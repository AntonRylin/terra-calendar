-- Per-user entitlements. Clients may READ their own row; entitlement fields are
-- written ONLY by the service-role Stripe webhook (which bypasses RLS), so a
-- patched client cannot grant itself a paid feature.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cosmetics_unlocked boolean not null default false,
  cloud_active boolean not null default false,
  plan text,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id);

alter table public.profiles enable row level security;

-- Read-only for the owner. No insert/update/delete policies for authenticated
-- users -> the only writer is the service role (webhook).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
