-- bike-my-day profile preferences
--
-- One row per auth.users row, holding the user's free-text preference
-- description that the LLM consumes when generating a verdict
-- ("hate riding under 5 °C, fine in light rain, anything over 8 m/s headwind
--  is a no"). RLS restricts the row to its owner.

set search_path = public;

create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  preferences text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: owner read"   on public.profiles for select using (user_id = auth.uid());
create policy "profiles: owner insert" on public.profiles for insert with check (user_id = auth.uid());
create policy "profiles: owner update" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "profiles: owner delete" on public.profiles for delete using (user_id = auth.uid());
