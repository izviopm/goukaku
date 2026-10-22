-- My profile: name, gender, and photo. Users edit only these columns of their own row (never `role`).
alter table public.profiles
  add column full_name text check (length(trim(full_name)) between 1 and 100),
  add column gender text check (gender in ('male', 'female')),
  add column avatar_path text; -- object path in the "avatars" bucket; null = default avatar by gender

revoke update on public.profiles from authenticated;
grant update (full_name, gender, avatar_path) on public.profiles to authenticated;
create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Public-read bucket; each user may only write inside the folder named after their own id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "avatar insert own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
