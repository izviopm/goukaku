-- Audit trail for questions bulk-imported from an outside bank. Admin-only: users never see where a question came from.
create table public.question_imports (
  question_id uuid primary key references public.questions on delete cascade,
  source text not null,
  source_ref text,
  imported_at timestamptz not null default now()
);
alter table public.question_imports enable row level security;
create policy "admin read" on public.question_imports for select to authenticated using ((select public.is_admin()));
