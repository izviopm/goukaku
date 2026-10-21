-- Goukaku v1 schema. See PRD.md section 12.

-- ============ Tables ============

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

create table public.exam_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  aliases text[] not null default '{}',
  language text check (language in ('id', 'en')), -- null = not decided yet, AI asks
  pass_score numeric check (pass_score between 0 and 100),
  pass_score_source text check (pass_score_source in ('web', 'user')),
  pass_score_url text,
  created_at timestamptz not null default now()
);
create index exam_catalog_aliases_idx on public.exam_catalog using gin (aliases);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null unique references public.exam_catalog on delete cascade,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- Which exams appear on a user's dashboard (not in PRD schema; needed for "daftar ujian user").
create table public.user_exams (
  user_id uuid not null references auth.users on delete cascade,
  exam_id uuid not null references public.exams on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, exam_id)
);

create table public.exam_blueprints (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams on delete cascade,
  topic text not null,
  percentage numeric not null check (percentage > 0 and percentage <= 100),
  source text not null check (source in ('web', 'user', 'ai')),
  source_url text,
  confirmed_by uuid references auth.users on delete set null, -- null = not active yet
  created_at timestamptz not null default now(),
  unique (exam_id, topic)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams on delete cascade,
  type text not null default 'mcq' check (type in ('mcq', 'essay')),
  body text not null,
  options jsonb not null default '[]',
  answer text,
  explanation text,
  rubric jsonb,
  topic text,
  origin text not null check (origin in ('user_upload', 'user_pdf_ai_answered', 'ai_generated', 'web')),
  answer_status text not null default 'unverified' check (answer_status in ('unverified', 'verified', 'disputed')),
  verification jsonb,
  status text not null default 'active' check (status in ('active', 'hidden')),
  created_by uuid references auth.users on delete set null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (exam_id, content_hash)
);
create index questions_exam_ready_idx on public.questions (exam_id) where answer_status = 'verified' and status = 'active';

create table public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  reason text not null check (length(reason) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (question_id, user_id)
);

create table public.user_exam_pool (
  user_id uuid not null references auth.users on delete cascade,
  exam_id uuid not null references public.exams on delete cascade,
  question_id uuid not null references public.questions on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, exam_id, question_id)
);

create table public.user_progress (
  user_id uuid not null references auth.users on delete cascade,
  question_id uuid not null references public.questions on delete cascade,
  answered_count int not null default 0,
  last_correct boolean,
  last_answered_at timestamptz,
  primary key (user_id, question_id)
);

create table public.user_exam_goal (
  user_id uuid not null references auth.users on delete cascade,
  exam_id uuid not null references public.exams on delete cascade,
  target_score numeric not null check (target_score between 0 and 100),
  primary key (user_id, exam_id)
);

create table public.simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  exam_id uuid not null references public.exams on delete cascade,
  size int not null check (size > 0),
  feedback_mode text not null check (feedback_mode in ('instant', 'end')),
  status text not null default 'in_progress' check (status in ('in_progress', 'finished', 'abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score numeric,
  pass_score_snapshot numeric
);
create index simulations_user_idx on public.simulations (user_id, started_at desc);

create table public.simulation_items (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations on delete cascade,
  position int not null,
  question_id uuid references public.questions on delete set null,
  snapshot jsonb not null,
  user_answer text,
  is_correct boolean,
  ai_score numeric,
  ai_feedback text,
  answered_at timestamptz,
  unique (simulation_id, position),
  unique (simulation_id, question_id)
);

create table public.ai_settings (
  id boolean primary key default true check (id), -- singleton
  provider text not null check (provider in ('openai', 'anthropic', 'gemini')),
  model text not null,
  api_key_secret_id uuid, -- vault.secrets id; the key itself lives encrypted in Supabase Vault
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null
);

create table public.user_limits (
  user_id uuid primary key references auth.users on delete cascade,
  ai_calls_per_day int check (ai_calls_per_day >= 0),
  questions_generated_per_day int check (questions_generated_per_day >= 0),
  unlimited boolean not null default false,
  set_by uuid references auth.users on delete set null,
  set_at timestamptz not null default now(),
  note text
);

create table public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  calls int not null default 0,
  questions_generated int not null default 0,
  tokens int not null default 0,
  primary key (user_id, day)
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  exam_id uuid not null references public.exams on delete cascade,
  requested int not null check (requested between 1 and 200),
  done int not null default 0,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('default_limits', '{"ai_calls_per_day": 50, "questions_generated_per_day": 100}'),
  ('global_daily_limit', '{"calls_per_day": 2000}'),
  ('ai_kill_switch', '{"enabled": false}'),
  ('verifier_models', '{"models": []}');

-- ============ Helpers ============

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Feedback mode must never change mid-simulation (PRD 7).
create function public.lock_feedback_mode() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.feedback_mode is distinct from old.feedback_mode then
    raise exception 'feedback_mode cannot be changed';
  end if;
  return new;
end $$;

create trigger simulations_lock_mode before update on public.simulations
  for each row execute function public.lock_feedback_mode();

-- ============ RLS ============

alter table public.profiles enable row level security;
alter table public.exam_catalog enable row level security;
alter table public.exams enable row level security;
alter table public.user_exams enable row level security;
alter table public.exam_blueprints enable row level security;
alter table public.questions enable row level security;
alter table public.question_reports enable row level security;
alter table public.user_exam_pool enable row level security;
alter table public.user_progress enable row level security;
alter table public.user_exam_goal enable row level security;
alter table public.simulations enable row level security;
alter table public.simulation_items enable row level security;
alter table public.ai_settings enable row level security;
alter table public.app_settings enable row level security;
alter table public.user_limits enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_jobs enable row level security;

create policy "own or admin read" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "admin update" on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Shared bank: readable by every logged-in user, written by the server (service role).
create policy "read" on public.exam_catalog for select to authenticated using (true);
create policy "admin update" on public.exam_catalog for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "read" on public.exams for select to authenticated using (true);
create policy "read" on public.exam_blueprints for select to authenticated using (true);
create policy "read" on public.questions for select to authenticated using (true);

create policy "own read" on public.user_exams for select to authenticated using (user_id = (select auth.uid()));
create policy "own read" on public.user_exam_pool for select to authenticated using (user_id = (select auth.uid()));
create policy "own read" on public.user_progress for select to authenticated using (user_id = (select auth.uid()));
create policy "own all" on public.user_exam_goal for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own read" on public.simulations for select to authenticated using (user_id = (select auth.uid()));
create policy "own read" on public.simulation_items for select to authenticated
  using (exists (select 1 from public.simulations s where s.id = simulation_id and s.user_id = (select auth.uid())));
create policy "own read" on public.ai_jobs for select to authenticated using (user_id = (select auth.uid()));

create policy "own or admin read" on public.question_reports for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "own or admin read" on public.user_limits for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "own or admin read" on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "admin all" on public.ai_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin all" on public.app_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin write" on public.user_limits for insert to authenticated
  with check ((select public.is_admin()));
create policy "admin update" on public.user_limits for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin delete" on public.user_limits for delete to authenticated
  using ((select public.is_admin()));

-- ============ Simulation RPCs (run as the calling user via auth.uid()) ============

-- Scores the simulation, closes it, and counts answered items into user_progress.
create function public.close_simulation(p_sim_id uuid, p_status text) returns jsonb
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

  insert into public.user_progress as up (user_id, question_id, answered_count, last_correct, last_answered_at)
  select s.user_id, si.question_id, 1, si.is_correct, si.answered_at
  from public.simulation_items si join public.simulations s on s.id = si.simulation_id
  where si.simulation_id = p_sim_id and si.answered_at is not null and si.question_id is not null
  on conflict (user_id, question_id) do update
    set answered_count = up.answered_count + 1, last_correct = excluded.last_correct, last_answered_at = excluded.last_answered_at;

  return jsonb_build_object('score', v_score, 'correct', v_correct, 'size', v_size);
end $$;
revoke execute on function public.close_simulation(uuid, text) from public, anon, authenticated;

create function public.start_simulation(p_exam_id uuid, p_size int, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_sim uuid;
  v_n int;
  v_available int;
  v_pass numeric;
  v_stale uuid;
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

  select count(*) into v_available
  from public.user_exam_pool p join public.questions q on q.id = p.question_id
  where p.user_id = v_uid and p.exam_id = p_exam_id
    and q.answer_status = 'verified' and q.status = 'active' and q.type = 'mcq';

  -- Short on questions: pull ready questions from the shared bank into the personal pool first.
  if v_available < p_size then
    insert into public.user_exam_pool (user_id, exam_id, question_id)
    select v_uid, p_exam_id, q.id from public.questions q
    where q.exam_id = p_exam_id and q.answer_status = 'verified' and q.status = 'active' and q.type = 'mcq'
      and not exists (select 1 from public.user_exam_pool p where p.user_id = v_uid and p.exam_id = p_exam_id and p.question_id = q.id)
    limit p_size - v_available;
  end if;

  select coalesce(g.target_score, c.pass_score) into v_pass
  from public.exams e join public.exam_catalog c on c.id = e.catalog_id
  left join public.user_exam_goal g on g.exam_id = e.id and g.user_id = v_uid
  where e.id = p_exam_id;

  insert into public.simulations (user_id, exam_id, size, feedback_mode, pass_score_snapshot)
  values (v_uid, p_exam_id, p_size, p_mode, v_pass) returning id into v_sim;

  -- Unanswered first, then least recently answered; skip questions in other active simulations.
  insert into public.simulation_items (simulation_id, position, question_id, snapshot)
  select v_sim, row_number() over (order by t.answered, t.last_at nulls first, t.r), t.id, t.snap
  from (
    select q.id,
      coalesce(up.answered_count, 0) > 0 as answered,
      up.last_answered_at as last_at,
      random() as r,
      jsonb_build_object('body', q.body, 'options', q.options, 'answer', q.answer,
                         'explanation', q.explanation, 'topic', q.topic) as snap
    from public.user_exam_pool p
    join public.questions q on q.id = p.question_id
    left join public.user_progress up on up.user_id = v_uid and up.question_id = q.id
    where p.user_id = v_uid and p.exam_id = p_exam_id
      and q.answer_status = 'verified' and q.status = 'active' and q.type = 'mcq'
      and not exists (
        select 1 from public.simulation_items si join public.simulations s on s.id = si.simulation_id
        where s.user_id = v_uid and s.status = 'in_progress' and s.id <> v_sim and si.question_id = q.id)
    order by answered, last_at nulls first, r
    limit p_size
  ) t;
  get diagnostics v_n = row_count;

  if v_n = 0 then raise exception 'NO_QUESTIONS'; end if;
  update public.simulations set size = v_n where id = v_sim;

  return jsonb_build_object('id', v_sim, 'size', v_n, 'requested', p_size);
end $$;

create function public.answer_item(p_item_id uuid, p_answer text) returns jsonb
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
  if r.feedback_mode = 'instant' and r.answered_at is not null then raise exception 'ALREADY_ANSWERED'; end if;
  if v_answer !~ '^[A-E]$' then raise exception 'BAD_ANSWER'; end if;

  v_correct := v_answer = upper(r.snapshot->>'answer');
  update public.simulation_items set user_answer = v_answer, is_correct = v_correct, answered_at = now() where id = p_item_id;

  if r.feedback_mode = 'instant' then
    return jsonb_build_object('is_correct', v_correct, 'answer', r.snapshot->>'answer', 'explanation', r.snapshot->>'explanation');
  end if;
  return jsonb_build_object('saved', true);
end $$;

create function public.end_simulation(p_sim_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('finished', 'abandoned') then raise exception 'BAD_STATUS'; end if;
  if not exists (select 1 from public.simulations where id = p_sim_id and user_id = auth.uid()) then
    raise exception 'NOT_FOUND';
  end if;
  return public.close_simulation(p_sim_id, p_status);
end $$;

-- 3 reports from different users hide the question (PRD 10).
create function public.report_question(p_question_id uuid, p_reason text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  insert into public.question_reports (question_id, user_id, reason)
  values (p_question_id, auth.uid(), trim(p_reason))
  on conflict (question_id, user_id) do update set reason = excluded.reason, created_at = now();

  select count(distinct user_id) into v_count from public.question_reports where question_id = p_question_id;
  if v_count >= 3 then
    update public.questions set status = 'hidden' where id = p_question_id;
  end if;
  return v_count;
end $$;

revoke execute on function public.start_simulation(uuid, int, text) from public, anon;
revoke execute on function public.answer_item(uuid, text) from public, anon;
revoke execute on function public.end_simulation(uuid, text) from public, anon;
revoke execute on function public.report_question(uuid, text) from public, anon;
grant execute on function public.start_simulation(uuid, int, text) to authenticated;
grant execute on function public.answer_item(uuid, text) to authenticated;
grant execute on function public.end_simulation(uuid, text) to authenticated;
grant execute on function public.report_question(uuid, text) to authenticated;

-- ============ AI quota and key (server / service role only) ============

-- Atomically checks kill switch, global daily cap, and the user's limit, then records usage (PRD 9).
create function public.consume_ai_quota(p_user_id uuid, p_calls int, p_questions int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_global int;
  v_used_global int;
  v_lim public.user_limits;
  v_default jsonb;
  v_calls_lim int;
  v_q_lim int;
  v_usage public.ai_usage;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage'));

  if coalesce((select (value->>'enabled')::boolean from public.app_settings where key = 'ai_kill_switch'), false) then
    raise exception 'AI_DISABLED';
  end if;

  select (value->>'calls_per_day')::int into v_global from public.app_settings where key = 'global_daily_limit';
  select coalesce(sum(calls), 0) into v_used_global from public.ai_usage where day = current_date;
  if v_global is not null and v_used_global + p_calls > v_global then raise exception 'GLOBAL_LIMIT'; end if;

  select * into v_usage from public.ai_usage where user_id = p_user_id and day = current_date;
  select * into v_lim from public.user_limits where user_id = p_user_id;

  if not coalesce(v_lim.unlimited, false) then
    select value into v_default from public.app_settings where key = 'default_limits';
    v_calls_lim := coalesce(v_lim.ai_calls_per_day, (v_default->>'ai_calls_per_day')::int);
    v_q_lim := coalesce(v_lim.questions_generated_per_day, (v_default->>'questions_generated_per_day')::int);
    if v_calls_lim is not null and coalesce(v_usage.calls, 0) + p_calls > v_calls_lim then
      raise exception 'USER_CALL_LIMIT';
    end if;
    if v_q_lim is not null and coalesce(v_usage.questions_generated, 0) + p_questions > v_q_lim then
      raise exception 'USER_QUESTION_LIMIT';
    end if;
  end if;

  insert into public.ai_usage as u (user_id, day, calls, questions_generated)
  values (p_user_id, current_date, p_calls, p_questions)
  on conflict (user_id, day) do update
    set calls = u.calls + excluded.calls, questions_generated = u.questions_generated + excluded.questions_generated;
end $$;

create function public.set_ai_api_key(p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select api_key_secret_id into v_id from public.ai_settings where id;
  if not found then raise exception 'AI_SETTINGS_MISSING'; end if;
  if v_id is null then
    v_id := vault.create_secret(p_key, 'goukaku_ai_api_key');
    update public.ai_settings set api_key_secret_id = v_id, updated_at = now() where id;
  else
    perform vault.update_secret(v_id, p_key);
    update public.ai_settings set updated_at = now() where id;
  end if;
end $$;

create function public.get_ai_api_key() returns text
language sql stable security definer set search_path = '' as $$
  select ds.decrypted_secret from vault.decrypted_secrets ds
  join public.ai_settings s on s.api_key_secret_id = ds.id where s.id;
$$;

revoke execute on function public.consume_ai_quota(uuid, int, int) from public, anon, authenticated;
revoke execute on function public.get_ai_api_key() from public, anon, authenticated;
revoke execute on function public.set_ai_api_key(text) from public, anon;
grant execute on function public.consume_ai_quota(uuid, int, int) to service_role;
grant execute on function public.get_ai_api_key() to service_role;
grant execute on function public.set_ai_api_key(text) to authenticated;
