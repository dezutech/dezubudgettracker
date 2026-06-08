alter table public.debts
  add column if not exists wallet_id uuid references public.wallets(id) on delete set null;

create index if not exists debts_wallet_id_idx
  on public.debts (wallet_id)
  where is_deleted = false;

create or replace function public.assert_debt_owner_refs()
returns trigger
language plpgsql
as $$
begin
  if new.wallet_id is not null and not exists (
    select 1 from public.wallets
    where id = new.wallet_id and user_id = new.user_id and is_deleted = false
  ) then
    raise exception 'wallet_id does not belong to the current user';
  end if;

  return new;
end;
$$;

drop trigger if exists debts_assert_owner_refs on public.debts;
create trigger debts_assert_owner_refs
  before insert or update of user_id, wallet_id on public.debts
  for each row execute function public.assert_debt_owner_refs();
