alter table public.wallets
  add column if not exists logo_path text,
  add column if not exists account_name text,
  add column if not exists account_number text,
  add column if not exists bank_name text,
  add column if not exists mobile_number text,
  add column if not exists qr_code_url text,
  add column if not exists qr_code_path text,
  add column if not exists qr_code_file_name text,
  add column if not exists qr_code_mime_type text,
  add column if not exists qr_code_size integer;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wallet-assets',
  'wallet-assets',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wallet_assets_select_own_folder" on storage.objects;
create policy "wallet_assets_select_own_folder"
  on storage.objects for select
  using (
    bucket_id = 'wallet-assets'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallet_assets_insert_own_folder" on storage.objects;
create policy "wallet_assets_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'wallet-assets'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallet_assets_update_own_folder" on storage.objects;
create policy "wallet_assets_update_own_folder"
  on storage.objects for update
  using (
    bucket_id = 'wallet-assets'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'wallet-assets'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallet_assets_delete_own_folder" on storage.objects;
create policy "wallet_assets_delete_own_folder"
  on storage.objects for delete
  using (
    bucket_id = 'wallet-assets'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
