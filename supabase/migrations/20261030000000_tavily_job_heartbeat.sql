-- Tavily key gives web search to providers without a built-in search tool. Stored in Vault like the AI key.
alter table public.ai_settings add column tavily_key_secret_id uuid;

create function public.set_tavily_api_key(p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select tavily_key_secret_id into v_id from public.ai_settings where id;
  if not found then raise exception 'AI_SETTINGS_MISSING'; end if;
  if v_id is null then
    v_id := vault.create_secret(p_key, 'goukaku_tavily_api_key');
    update public.ai_settings set tavily_key_secret_id = v_id, updated_at = now() where id;
  else
    perform vault.update_secret(v_id, p_key);
    update public.ai_settings set updated_at = now() where id;
  end if;
end $$;

create function public.get_tavily_api_key() returns text
language sql stable security definer set search_path = '' as $$
  select ds.decrypted_secret from vault.decrypted_secrets ds
  join public.ai_settings s on s.tavily_key_secret_id = ds.id where s.id;
$$;

revoke execute on function public.get_tavily_api_key() from public, anon, authenticated;
revoke execute on function public.set_tavily_api_key(text) from public, anon;
grant execute on function public.get_tavily_api_key() to service_role;
grant execute on function public.set_tavily_api_key(text) to authenticated;

-- Heartbeat: a running job whose updated_at stops moving was cut off by the function time limit.
alter table public.ai_jobs add column updated_at timestamptz not null default now();
