alter table public.profiles
  add column if not exists base_currency text not null default 'PHP';

alter table public.profiles
  drop constraint if exists profiles_base_currency_check;

alter table public.profiles
  add constraint profiles_base_currency_check
  check (base_currency in ('PHP', 'USD', 'JPY', 'EUR', 'GBP', 'SGD', 'HKD', 'AUD', 'CAD'));
