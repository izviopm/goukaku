-- What the exam actually is (e.g. "CGI" = Certified General Insurance, AAUI, module 002).
-- Shared per exam: set once by the first learner after an AI clarification, then admin-only.
alter table public.exam_catalog
  add column identity jsonb, -- {full_name, issuer, scope, country, summary}
  add column identity_set_by uuid references auth.users on delete set null;
