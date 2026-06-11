alter table public.goals
  add column if not exists icon text,
  add column if not exists color text,
  add column if not exists notes text;
