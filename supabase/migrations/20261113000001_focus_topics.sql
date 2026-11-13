-- Focus practice: an optional subset of blueprint topics for one run. Percentages are re-normalized over the subset.
-- null p_topics = the whole blueprint, exactly as before.

drop function public.exam_readiness(uuid, int);
drop function public.exam_readiness_for(uuid, uuid, int);
drop function public.topic_quota_for(uuid, uuid, int);
drop function public.start_simulation(uuid, int, text);

create function public.topic_quota_for(p_user uuid, p_exam_id uuid, p_size int, p_topics text[] default null)
returns table (topic text, needed int)
language sql stable security definer set search_path = '' as $$
  with bp as (
    select b.topic, b.percentage from public.effective_blueprint_for(p_user, p_exam_id) b
    where p_topics is null or lower(trim(b.topic)) in (select lower(trim(x)) from unnest(p_topics) x)
  ),
  tot as (select sum(percentage) as s from bp),
  ex as (
    select bp.topic, p_size * bp.percentage / tot.s as exact, floor(p_size * bp.percentage / tot.s)::int as base
    from bp, tot
  ),
  ranked as (select ex.*, row_number() over (order by ex.exact - ex.base desc, ex.topic) as rn from ex),
  rem as (select p_size - coalesce(sum(base), 0) as r from ex)
  select ranked.topic, ranked.base + case when ranked.rn <= rem.r then 1 else 0 end
  from ranked, rem;
$$;

create function public.exam_readiness_for(p_user uuid, p_exam_id uuid, p_size int, p_topics text[] default null)
returns table (topic text, needed int, available int, unanswered int)
language sql stable security definer set search_path = '' as $$
  select qt.topic, qt.needed,
    count(q.id)::int,
    count(q.id) filter (where coalesce(up.answered_count, 0) = 0)::int
  from public.topic_quota_for(p_user, p_exam_id, p_size, p_topics) qt
  cross join (
    select coalesce(c.format, 'mcq') as type
    from public.exams e join public.exam_catalog c on c.id = e.catalog_id
    where e.id = p_exam_id
  ) f
  left join public.questions q
    on q.exam_id = p_exam_id and lower(trim(q.topic)) = lower(trim(qt.topic))
    and q.answer_status = 'verified' and q.status = 'active' and q.type = f.type
    and not exists (
      select 1 from public.simulation_items si join public.simulations s on s.id = si.simulation_id
      where s.user_id = p_user and s.status = 'in_progress' and si.question_id = q.id)
  left join public.user_progress up on up.user_id = p_user and up.question_id = q.id
  group by qt.topic, qt.needed;
$$;

create function public.exam_readiness(p_exam_id uuid, p_size int, p_topics text[] default null)
returns table (topic text, needed int, available int, unanswered int)
language sql stable security definer set search_path = '' as $$
  select * from public.exam_readiness_for(auth.uid(), p_exam_id, greatest(1, least(p_size, 500)), p_topics);
$$;

create function public.start_simulation(p_exam_id uuid, p_size int, p_mode text, p_topics text[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_sim uuid;
  v_n int;
  v_pass numeric;
  v_stale uuid;
  v_short jsonb;
  v_format text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_mode not in ('instant', 'end') then raise exception 'BAD_MODE'; end if;
  if p_size < 1 or p_size > 200 then raise exception 'BAD_SIZE'; end if;

  select coalesce(c.format, 'mcq') into v_format
  from public.exams e join public.exam_catalog c on c.id = e.catalog_id
  where e.id = p_exam_id;
  if v_format is null then raise exception 'NO_EXAM'; end if;

  -- Simulations left open for over 12 hours count as abandoned (PRD 7, Abandon).
  for v_stale in select id from public.simulations
    where user_id = v_uid and status = 'in_progress' and started_at < now() - interval '12 hours'
  loop
    perform public.close_simulation(v_stale, 'abandoned');
  end loop;

  if not exists (select 1 from public.effective_blueprint_for(v_uid, p_exam_id)) then
    raise exception 'NO_BLUEPRINT';
  end if;
  if not exists (select 1 from public.topic_quota_for(v_uid, p_exam_id, p_size, p_topics)) then
    raise exception 'NO_TOPICS';
  end if;

  -- Never mix topics: refuse to start until every topic has enough verified questions.
  select jsonb_agg(jsonb_build_object('topic', r.topic, 'needed', r.needed, 'available', r.available))
  into v_short
  from public.exam_readiness_for(v_uid, p_exam_id, p_size, p_topics) r where r.available < r.needed;
  if v_short is not null then raise exception 'SHORTFALL:%', v_short; end if;

  -- The shared bank feeds the personal pool for every blueprint topic (PRD 5, shared bank).
  insert into public.user_exam_pool (user_id, exam_id, question_id)
  select v_uid, p_exam_id, q.id
  from public.questions q
  join public.effective_blueprint_for(v_uid, p_exam_id) b on lower(trim(q.topic)) = lower(trim(b.topic))
  where q.exam_id = p_exam_id and q.answer_status = 'verified' and q.status = 'active' and q.type = v_format
  on conflict do nothing;

  select coalesce(g.target_score, c.pass_score) into v_pass
  from public.exams e join public.exam_catalog c on c.id = e.catalog_id
  left join public.user_exam_goal g on g.exam_id = e.id and g.user_id = v_uid
  where e.id = p_exam_id;

  insert into public.simulations (user_id, exam_id, size, feedback_mode, pass_score_snapshot, format)
  values (v_uid, p_exam_id, p_size, p_mode, v_pass, v_format) returning id into v_sim;

  -- Within each topic quota: new first, then last answered wrong, most often wrong,
  -- shortest correct streak (mastered last), least recently seen. Positions are shuffled across topics.
  insert into public.simulation_items (simulation_id, position, question_id, snapshot)
  select v_sim, row_number() over (order by random()), t.id, t.snap
  from (
    select q.id, qt.needed,
      jsonb_build_object('body', q.body, 'options', q.options, 'answer', q.answer, 'rubric', q.rubric,
                         'explanation', q.explanation, 'topic', qt.topic, 'type', q.type) as snap,
      row_number() over (
        partition by qt.topic
        order by
          coalesce(up.answered_count, 0) > 0,
          case when up.last_correct = false then 0 else 1 end,
          coalesce(up.wrong_count, 0) desc,
          coalesce(up.correct_streak, 0),
          up.last_answered_at nulls first,
          random()
      ) as rn
    from public.topic_quota_for(v_uid, p_exam_id, p_size, p_topics) qt
    join public.questions q
      on q.exam_id = p_exam_id and lower(trim(q.topic)) = lower(trim(qt.topic))
      and q.answer_status = 'verified' and q.status = 'active' and q.type = v_format
    left join public.user_progress up on up.user_id = v_uid and up.question_id = q.id
    where not exists (
      select 1 from public.simulation_items si join public.simulations s on s.id = si.simulation_id
      where s.user_id = v_uid and s.status = 'in_progress' and s.id <> v_sim and si.question_id = q.id)
  ) t
  where t.rn <= t.needed;
  get diagnostics v_n = row_count;

  if v_n <> p_size then raise exception 'SHORTFALL:[]'; end if;
  return jsonb_build_object('id', v_sim, 'size', v_n, 'requested', p_size);
end $$;

revoke execute on function public.topic_quota_for(uuid, uuid, int, text[]) from public, anon, authenticated;
revoke execute on function public.exam_readiness_for(uuid, uuid, int, text[]) from public, anon, authenticated;
grant execute on function public.topic_quota_for(uuid, uuid, int, text[]) to service_role;
grant execute on function public.exam_readiness_for(uuid, uuid, int, text[]) to service_role;
revoke execute on function public.exam_readiness(uuid, int, text[]) from public, anon;
grant execute on function public.exam_readiness(uuid, int, text[]) to authenticated;
revoke execute on function public.start_simulation(uuid, int, text, text[]) from public, anon;
grant execute on function public.start_simulation(uuid, int, text, text[]) to authenticated;
