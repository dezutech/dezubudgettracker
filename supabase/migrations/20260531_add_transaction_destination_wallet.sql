alter table public.transactions
  add column if not exists destination_wallet_id uuid references public.wallets(id) on delete restrict;

create index if not exists transactions_destination_wallet_date_idx
  on public.transactions (destination_wallet_id, transaction_date desc)
  where is_deleted = false;

create or replace function public.assert_transaction_owner_refs()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.wallets
    where id = new.wallet_id and user_id = new.user_id and is_deleted = false
  ) then
    raise exception 'wallet_id does not belong to the current user';
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.categories
    where id = new.category_id and user_id = new.user_id and is_deleted = false
  ) then
    raise exception 'category_id does not belong to the current user';
  end if;

  if new.destination_wallet_id is not null and not exists (
    select 1 from public.wallets
    where id = new.destination_wallet_id and user_id = new.user_id and is_deleted = false
  ) then
    raise exception 'destination_wallet_id does not belong to the current user';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_assert_owner_refs on public.transactions;
create trigger transactions_assert_owner_refs
  before insert or update of user_id, wallet_id, category_id, destination_wallet_id on public.transactions
  for each row execute function public.assert_transaction_owner_refs();
