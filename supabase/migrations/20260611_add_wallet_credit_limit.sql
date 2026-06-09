alter table public.wallets
  add column if not exists credit_limit numeric(14, 2);

alter table public.wallets
  drop constraint if exists wallets_credit_limit_non_negative;

alter table public.wallets
  add constraint wallets_credit_limit_non_negative
  check (credit_limit is null or credit_limit >= 0);
