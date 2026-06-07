alter table public.wallets
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wallet-logos',
  'wallet-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wallet_logos_select_public" on storage.objects;
create policy "wallet_logos_select_public"
  on storage.objects for select
  using (bucket_id = 'wallet-logos');

drop policy if exists "wallet_logos_insert_own_folder" on storage.objects;
create policy "wallet_logos_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'wallet-logos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallet_logos_update_own_folder" on storage.objects;
create policy "wallet_logos_update_own_folder"
  on storage.objects for update
  using (
    bucket_id = 'wallet-logos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'wallet-logos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallet_logos_delete_own_folder" on storage.objects;
create policy "wallet_logos_delete_own_folder"
  on storage.objects for delete
  using (
    bucket_id = 'wallet-logos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
