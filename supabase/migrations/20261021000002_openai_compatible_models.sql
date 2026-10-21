-- OpenAI-compatible providers (custom base URL) and a named model list managed in /admin.
alter table public.ai_settings drop constraint ai_settings_provider_check;
alter table public.ai_settings add constraint ai_settings_provider_check
  check (provider in ('openai', 'anthropic', 'gemini', 'openai_compatible'));
alter table public.ai_settings add column base_url text;

-- {"models": [{"id": "provider/model-id", "name": "Nama tampilan"}]}
insert into public.app_settings (key, value) values ('ai_models', '{"models": []}')
on conflict (key) do nothing;
