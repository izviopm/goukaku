-- Admins are always unlimited: no per-user call or question limit and no global cap (PRD 9).
-- Only the kill switch still stops them.

create or replace function public.consume_ai_quota(p_user_id uuid, p_calls int, p_questions int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_global int;
  v_used_global int;
  v_lim public.user_limits;
  v_default jsonb;
  v_calls_lim int;
  v_q_lim int;
  v_usage public.ai_usage;
  v_exempt boolean;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage'));

  if coalesce((select (value->>'enabled')::boolean from public.app_settings where key = 'ai_kill_switch'), false) then
    raise exception 'AI_DISABLED';
  end if;

  select * into v_usage from public.ai_usage where user_id = p_user_id and day = current_date;
  select * into v_lim from public.user_limits where user_id = p_user_id;
  v_exempt := coalesce(v_lim.unlimited, false)
    or exists (select 1 from public.profiles where id = p_user_id and role = 'admin');

  if not v_exempt then
    select (value->>'calls_per_day')::int into v_global from public.app_settings where key = 'global_daily_limit';
    select coalesce(sum(u.calls), 0) into v_used_global
      from public.ai_usage u
      join public.profiles p on p.id = u.user_id
      left join public.user_limits l on l.user_id = u.user_id
      where u.day = current_date and p.role <> 'admin' and not coalesce(l.unlimited, false);
    if v_global is not null and v_used_global + p_calls > v_global then raise exception 'GLOBAL_LIMIT'; end if;

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

revoke execute on function public.consume_ai_quota(uuid, int, int) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, int, int) to service_role;
