-- Essay format: one question format per exam catalog entry (certification + module), snapshotted per simulation.

-- ============ Format ============
alter table public.exam_catalog add column format text check (format in ('mcq', 'essay'));
update public.exam_catalog set format = 'mcq' where format is null;

alter table public.simulations add column format text not null default 'mcq' check (format in ('mcq', 'essay'));

-- ============ Readiness follows the exam format ============
create or replace function public.exam_readiness_for(p_user uuid, p_exam_id uuid, p_size int)
returns table (topic text, needed int, available int, unanswered int)
language sql stable security definer set search_path = '' as $$
  select qt.topic, qt.needed,
    count(q.id)::int,
    count(q.id) filter (where coalesce(up.answered_count, 0) = 0)::int
  from public.topic_quota_for(p_user, p_exam_id, p_size) qt
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

-- ============ Start: pick and snapshot the exam format ============
create or replace function public.start_simulation(p_exam_id uuid, p_size int, p_mode text) returns jsonb
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

  -- Never mix topics: refuse to start until every topic has enough verified questions.
  select jsonb_agg(jsonb_build_object('topic', r.topic, 'needed', r.needed, 'available', r.available))
  into v_short
  from public.exam_readiness_for(v_uid, p_exam_id, p_size) r where r.available < r.needed;
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
    from public.topic_quota_for(v_uid, p_exam_id, p_size) qt
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

-- ============ MCQ answers only go through answer_item ============
create or replace function public.answer_item(p_item_id uuid, p_answer text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_answer text := upper(trim(p_answer));
  v_correct boolean;
begin
  select si.id, si.snapshot, si.answered_at, s.user_id, s.status, s.feedback_mode into r
  from public.simulation_items si join public.simulations s on s.id = si.simulation_id
  where si.id = p_item_id for update of si;

  if not found or r.user_id <> auth.uid() then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'in_progress' then raise exception 'SIM_NOT_ACTIVE'; end if;
  if coalesce(r.snapshot->>'type', 'mcq') <> 'mcq' then raise exception 'BAD_TYPE'; end if;
  if r.feedback_mode = 'instant' and r.answered_at is not null then raise exception 'ALREADY_ANSWERED'; end if;
  if v_answer !~ '^[A-E]$' then raise exception 'BAD_ANSWER'; end if;

  v_correct := v_answer = upper(r.snapshot->>'answer');
  update public.simulation_items set user_answer = v_answer, is_correct = v_correct, answered_at = now() where id = p_item_id;

  if r.feedback_mode = 'instant' then
    return jsonb_build_object('is_correct', v_correct, 'answer', r.snapshot->>'answer', 'explanation', r.snapshot->>'explanation');
  end if;
  return jsonb_build_object('saved', true);
end $$;

-- ============ Essay answer text (AI grading is a server action) ============
create function public.save_essay_answer(p_item_id uuid, p_answer text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_text text := trim(coalesce(p_answer, ''));
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select si.id, si.snapshot, si.ai_score, s.user_id, s.status into r
  from public.simulation_items si join public.simulations s on s.id = si.simulation_id
  where si.id = p_item_id for update of si;

  if not found or r.user_id <> auth.uid() then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'in_progress' then raise exception 'SIM_NOT_ACTIVE'; end if;
  if coalesce(r.snapshot->>'type', 'mcq') <> 'essay' then raise exception 'BAD_TYPE'; end if;
  if r.ai_score is not null then raise exception 'ALREADY_GRADED'; end if;
  if length(v_text) < 1 or length(v_text) > 5000 then raise exception 'BAD_LENGTH'; end if;

  update public.simulation_items set user_answer = v_text, answered_at = now() where id = p_item_id;
  return jsonb_build_object('saved', true);
end $$;

revoke execute on function public.save_essay_answer(uuid, text) from public, anon;
grant execute on function public.save_essay_answer(uuid, text) to authenticated;

-- ============ Scoring: MCQ counts correct answers, essay averages AI scores ============
create or replace function public.close_simulation(p_sim_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_size int;
  v_correct int;
  v_score numeric;
  v_format text;
begin
  select size, format into v_size, v_format from public.simulations where id = p_sim_id and status = 'in_progress' for update;
  if not found then raise exception 'SIM_NOT_ACTIVE'; end if;

  select count(*) filter (where is_correct) into v_correct from public.simulation_items where simulation_id = p_sim_id;
  if v_format = 'essay' then
    select round(coalesce(sum(coalesce(ai_score, 0)), 0) / v_size, 2) into v_score
    from public.simulation_items where simulation_id = p_sim_id;
  else
    v_score := round(100.0 * v_correct / v_size, 2);
  end if;

  update public.simulations set status = p_status, finished_at = now(), score = v_score where id = p_sim_id;

  insert into public.user_progress as up
    (user_id, question_id, answered_count, last_correct, last_answered_at, correct_count, wrong_count, correct_streak)
  select s.user_id, si.question_id, 1, coalesce(si.is_correct, false), si.answered_at,
    case when si.is_correct then 1 else 0 end,
    case when si.is_correct then 0 else 1 end,
    case when si.is_correct then 1 else 0 end
  from public.simulation_items si join public.simulations s on s.id = si.simulation_id
  where si.simulation_id = p_sim_id and si.answered_at is not null and si.question_id is not null
    and (v_format <> 'essay' or si.ai_score is not null)
  on conflict (user_id, question_id) do update set
    answered_count = up.answered_count + 1,
    last_correct = excluded.last_correct,
    last_answered_at = excluded.last_answered_at,
    correct_count = up.correct_count + excluded.correct_count,
    wrong_count = up.wrong_count + excluded.wrong_count,
    correct_streak = case when excluded.last_correct then up.correct_streak + 1 else 0 end;

  return jsonb_build_object('score', v_score, 'correct', v_correct, 'size', v_size, 'format', v_format);
end $$;
