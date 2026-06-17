alter table public.transactions
  add column if not exists receipt_url text,
  add column if not exists receipt_path text,
  add column if not exists receipt_file_name text,
  add column if not exists receipt_mime_type text,
  add column if not exists receipt_size integer;

alter table public.bills
  add column if not exists receipt_url text,
  add column if not exists receipt_path text,
  add column if not exists receipt_file_name text,
  add column if not exists receipt_mime_type text,
  add column if not exists receipt_size integer;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipts_select_public" on storage.objects;
create policy "receipts_select_public"
  on storage.objects for select
  using (bucket_id = 'receipts');

drop policy if exists "receipts_insert_own_folder" on storage.objects;
create policy "receipts_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipts_update_own_folder" on storage.objects;
create policy "receipts_update_own_folder"
  on storage.objects for update
  using (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipts_delete_own_folder" on storage.objects;
create policy "receipts_delete_own_folder"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
