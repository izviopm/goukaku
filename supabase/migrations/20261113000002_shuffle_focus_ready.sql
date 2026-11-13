-- 1) MCQ options are shuffled per run, so the key's position in the bank cannot be guessed.
-- 2) Focus runs are recorded, so they can be told apart from full practice exams.
-- 3) Dashboard "ready" counts come from the shared bank in one call.

alter table public.simulations add column topics text[]; -- null = full blueprint run

-- Returns {options, answer} in a random order. Left as-is when an option refers to other options by position.
create function public.shuffled_mcq(p_options jsonb, p_answer text) returns jsonb
language sql volatile set search_path = '' as $$
  with o as (
    select value, ordinality as old, row_number() over (order by random()) as new
    from jsonb_array_elements(p_options) with ordinality
  ),
  keep as (
    select p_answer !~ '^[A-E]$' or ascii(p_answer) - 64 > jsonb_array_length(p_options)
      or exists (
        select 1 from jsonb_array_elements_text(p_options) t
        where t ~* '(semua|seluruh|kedua).*(benar|salah)|di atas|\m[a-e] (dan|atau|&) [a-e]\M|(jawaban|opsi|pilihan) [a-e]\M|tidak ada (jawaban|yang)|(all|none) of the above|both [a-e]\M'
      ) as k
  )
  select case when keep.k then jsonb_build_object('options', p_options, 'answer', p_answer)
    else jsonb_build_object(
      'options', (select jsonb_agg(o.value order by o.new) from o),
      'answer', (select chr(64 + o.new::int) from o where o.old = ascii(p_answer) - 64))
    end
  from keep;
$$;
revoke execute on function public.shuffled_mcq(jsonb, text) from public, anon, authenticated;

create or replace function public.start_simulation(p_exam_id uuid, p_size int, p_mode text, p_topics text[] default null) returns jsonb
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

  insert into public.simulations (user_id, exam_id, size, feedback_mode, pass_score_snapshot, format, topics)
  values (v_uid, p_exam_id, p_size, p_mode, v_pass, v_format, p_topics) returning id into v_sim;

  -- Within each topic quota: new first, then last answered wrong, most often wrong,
  -- shortest correct streak (mastered last), least recently seen. Positions are shuffled across topics.
  -- 'key' keeps the bank's own letter, so a later key change can still be detected after the shuffle.
  insert into public.simulation_items (simulation_id, position, question_id, snapshot)
  select v_sim, row_number() over (order by random()), t.id,
    case when t.snap->>'type' = 'mcq' then t.snap || public.shuffled_mcq(t.snap->'options', t.snap->>'answer') else t.snap end
  from (
    select q.id, qt.needed,
      jsonb_build_object('body', q.body, 'options', q.options, 'answer', q.answer, 'key', q.answer, 'rubric', q.rubric,
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

-- Verified questions per exam on the caller's dashboard. Security invoker: RLS applies.
create function public.my_exam_ready() returns table (exam_id uuid, ready int)
language sql stable set search_path = '' as $$
  select ue.exam_id, count(q.id)::int
  from public.user_exams ue
  join public.exams e on e.id = ue.exam_id
  join public.exam_catalog c on c.id = e.catalog_id
  left join public.questions q
    on q.exam_id = ue.exam_id and q.answer_status = 'verified' and q.status = 'active' and q.type = coalesce(c.format, 'mcq')
  where ue.user_id = (select auth.uid())
  group by ue.exam_id;
$$;
revoke execute on function public.my_exam_ready() from public, anon;
grant execute on function public.my_exam_ready() to authenticated;
