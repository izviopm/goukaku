-- Stage 1: hybrid blueprints, blueprint-exact simulations, smart repetition, per-question answer counts.

-- ============ Goal ============
alter table public.user_exam_goal alter column target_score drop not null;
alter table public.user_exam_goal add column exam_size int check (exam_size between 1 and 500);

-- ============ Personal blueprints (hybrid: personal overrides the shared default) ============
create table public.user_blueprints (
  user_id uuid not null references auth.users on delete cascade,
  exam_id uuid not null references public.exams on delete cascade,
  topic text not null check (length(trim(topic)) between 1 and 200),
  percentage numeric not null check (percentage > 0 and percentage <= 100),
  created_at timestamptz not null default now(),
  primary key (user_id, exam_id, topic)
);
alter table public.user_blueprints enable row level security;
create policy "own all" on public.user_blueprints for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============ Answer counts for analytics and smart repetition ============
alter table public.user_progress
  add column correct_count int not null default 0,
  add column wrong_count int not null default 0,
  add column correct_streak int not null default 0; -- consecutive correct answers; 3+ = mastered

update public.user_progress up set
  correct_count = a.correct,
  wrong_count = a.wrong,
  correct_streak = a.streak
from (
  select s.user_id, si.question_id,
    count(*) filter (where si.is_correct) as correct,
    count(*) filter (where not coalesce(si.is_correct, false)) as wrong,
    count(*) filter (where si.is_correct and si.answered_at > coalesce(lw.last_wrong, '-infinity')) as streak
  from public.simulation_items si
  join public.simulations s on s.id = si.simulation_id and s.status <> 'in_progress'
  left join lateral (
    select max(x.answered_at) as last_wrong
    from public.simulation_items x join public.simulations xs on xs.id = x.simulation_id
    where xs.user_id = s.user_id and x.question_id = si.question_id and not coalesce(x.is_correct, false)
      and x.answered_at is not null and xs.status <> 'in_progress'
  ) lw on true
  where si.answered_at is not null and si.question_id is not null
  group by s.user_id, si.question_id, lw.last_wrong
) a
where up.user_id = a.user_id and up.question_id = a.question_id;

-- ============ Background AI jobs: generate / upload / prepare ============
alter table public.ai_jobs drop constraint ai_jobs_requested_check;
alter table public.ai_jobs add constraint ai_jobs_requested_check check (requested between 0 and 500);
alter table public.ai_jobs
  add column kind text not null default 'generate' check (kind in ('generate', 'upload', 'prepare')),
  add column payload jsonb,
  add column summary jsonb;

-- ============ Blueprint helpers ============

-- Personal blueprint if the user saved one, otherwise the confirmed shared default.
create function public.effective_blueprint_for(p_user uuid, p_exam_id uuid)
returns table (topic text, percentage numeric, personal boolean)
language sql stable security definer set search_path = '' as $$
  select ub.topic, ub.percentage, true from public.user_blueprints ub
  where ub.user_id = p_user and ub.exam_id = p_exam_id
  union all
  select eb.topic, eb.percentage, false from public.exam_blueprints eb
  where eb.exam_id = p_exam_id and eb.confirmed_by is not null
    and not exists (select 1 from public.user_blueprints ub where ub.user_id = p_user and ub.exam_id = p_exam_id);
$$;

-- Questions per topic for a run of p_size, split by percentage with largest remainder (same as topicPlan in TS).
create function public.topic_quota_for(p_user uuid, p_exam_id uuid, p_size int)
returns table (topic text, needed int)
language sql stable security definer set search_path = '' as $$
  with bp as (select b.topic, b.percentage from public.effective_blueprint_for(p_user, p_exam_id) b),
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

-- Per topic: needed for this run, verified questions available to the user, and how many they never answered.
create function public.exam_readiness_for(p_user uuid, p_exam_id uuid, p_size int)
returns table (topic text, needed int, available int, unanswered int)
language sql stable security definer set search_path = '' as $$
  select qt.topic, qt.needed,
    count(q.id)::int,
    count(q.id) filter (where coalesce(up.answered_count, 0) = 0)::int
  from public.topic_quota_for(p_user, p_exam_id, p_size) qt
  left join public.questions q
    on q.exam_id = p_exam_id and lower(trim(q.topic)) = lower(trim(qt.topic))
    and q.answer_status = 'verified' and q.status = 'active' and q.type = 'mcq'
    and not exists (
      select 1 from public.simulation_items si join public.simulations s on s.id = si.simulation_id
      where s.user_id = p_user and s.status = 'in_progress' and si.question_id = q.id)
  left join public.user_progress up on up.user_id = p_user and up.question_id = q.id
  group by qt.topic, qt.needed;
$$;

revoke execute on function public.effective_blueprint_for(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.topic_quota_for(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.exam_readiness_for(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.effective_blueprint_for(uuid, uuid) to service_role;
grant execute on function public.topic_quota_for(uuid, uuid, int) to service_role;
grant execute on function public.exam_readiness_for(uuid, uuid, int) to service_role;

-- Public wrappers bound to the caller, so nobody can read another user's personal blueprint.
create function public.effective_blueprint(p_exam_id uuid)
returns table (topic text, percentage numeric, personal boolean)
language sql stable security definer set search_path = '' as $$
  select * from public.effective_blueprint_for(auth.uid(), p_exam_id);
$$;

create function public.exam_readiness(p_exam_id uuid, p_size int)
returns table (topic text, needed int, available int, unanswered int)
language sql stable security definer set search_path = '' as $$
  select * from public.exam_readiness_for(auth.uid(), p_exam_id, greatest(1, least(p_size, 500)));
$$;

revoke execute on function public.effective_blueprint(uuid) from public, anon;
revoke execute on function public.exam_readiness(uuid, int) from public, anon;
grant execute on function public.effective_blueprint(uuid) to authenticated;
grant execute on function public.exam_readiness(uuid, int) to authenticated;

-- ============ Scoring now also updates correct/wrong counts and the streak ============
create or replace function public.close_simulation(p_sim_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_size int;
  v_correct int;
  v_score numeric;
begin
  select size into v_size from public.simulations where id = p_sim_id and status = 'in_progress' for update;
  if not found then raise exception 'SIM_NOT_ACTIVE'; end if;

  select count(*) filter (where is_correct) into v_correct from public.simulation_items where simulation_id = p_sim_id;
  v_score := round(100.0 * v_correct / v_size, 2);

  update public.simulations set status = p_status, finished_at = now(), score = v_score where id = p_sim_id;

  insert into public.user_progress as up
    (user_id, question_id, answered_count, last_correct, last_answered_at, correct_count, wrong_count, correct_streak)
  select s.user_id, si.question_id, 1, coalesce(si.is_correct, false), si.answered_at,
    case when si.is_correct then 1 else 0 end,
    case when si.is_correct then 0 else 1 end,
    case when si.is_correct then 1 else 0 end
  from public.simulation_items si join public.simulations s on s.id = si.simulation_id
  where si.simulation_id = p_sim_id and si.answered_at is not null and si.question_id is not null
  on conflict (user_id, question_id) do update set
    answered_count = up.answered_count + 1,
    last_correct = excluded.last_correct,
    last_answered_at = excluded.last_answered_at,
    correct_count = up.correct_count + excluded.correct_count,
    wrong_count = up.wrong_count + excluded.wrong_count,
    correct_streak = case when excluded.last_correct then up.correct_streak + 1 else 0 end;

  return jsonb_build_object('score', v_score, 'correct', v_correct, 'size', v_size);
end $$;
revoke execute on function public.close_simulation(uuid, text) from public, anon, authenticated;

-- ============ Blueprint-exact simulation with smart repetition ============
create or replace function public.start_simulation(p_exam_id uuid, p_size int, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_sim uuid;
  v_n int;
  v_pass numeric;
  v_stale uuid;
  v_short jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_mode not in ('instant', 'end') then raise exception 'BAD_MODE'; end if;
  if p_size < 1 or p_size > 200 then raise exception 'BAD_SIZE'; end if;

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
  where q.exam_id = p_exam_id and q.answer_status = 'verified' and q.status = 'active' and q.type = 'mcq'
  on conflict do nothing;

  select coalesce(g.target_score, c.pass_score) into v_pass
  from public.exams e join public.exam_catalog c on c.id = e.catalog_id
  left join public.user_exam_goal g on g.exam_id = e.id and g.user_id = v_uid
  where e.id = p_exam_id;

  insert into public.simulations (user_id, exam_id, size, feedback_mode, pass_score_snapshot)
  values (v_uid, p_exam_id, p_size, p_mode, v_pass) returning id into v_sim;

  -- Within each topic quota: new first, then last answered wrong, most often wrong,
  -- shortest correct streak (mastered last), least recently seen. Positions are shuffled across topics.
  insert into public.simulation_items (simulation_id, position, question_id, snapshot)
  select v_sim, row_number() over (order by random()), t.id, t.snap
  from (
    select q.id, qt.needed,
      jsonb_build_object('body', q.body, 'options', q.options, 'answer', q.answer,
                         'explanation', q.explanation, 'topic', qt.topic) as snap,
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
      and q.answer_status = 'verified' and q.status = 'active' and q.type = 'mcq'
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
