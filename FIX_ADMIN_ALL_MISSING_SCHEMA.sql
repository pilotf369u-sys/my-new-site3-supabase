-- Final consolidated admin runtime schema fix.
-- Run this whole file once in Supabase SQL Editor.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.currencies (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null unique,
  rate numeric not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  url text not null,
  image_path text,
  category text not null default 'comprehensive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_blocks (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.currencies enable row level security;
alter table public.stores enable row level security;
alter table public.app_settings enable row level security;
alter table public.content_blocks enable row level security;

drop policy if exists currencies_staff_all on public.currencies;
create policy currencies_staff_all on public.currencies
for all to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists stores_staff_all on public.stores;
create policy stores_staff_all on public.stores
for all to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists app_settings_staff_all on public.app_settings;
create policy app_settings_staff_all on public.app_settings
for all to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists content_blocks_staff_all on public.content_blocks;
create policy content_blocks_staff_all on public.content_blocks
for all to authenticated
using (public.is_staff())
with check (public.is_staff());

grant select, insert, update, delete on public.currencies to authenticated;
grant select, insert, update, delete on public.stores to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;
grant select, insert, update, delete on public.content_blocks to authenticated;

create or replace function public.admin_list_customers_v2()
returns table (
  id uuid,
  name text,
  phone text,
  email text,
  country text,
  address text,
  status text,
  balance numeric,
  customer_code text,
  payload jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    c.id,
    c.name,
    c.phone,
    c.email,
    c.country,
    c.address,
    c.status,
    c.balance,
    c.customer_code,
    c.payload,
    c.created_at,
    c.updated_at
  from public.customers c
  order by c.created_at desc;
end;
$function$;

revoke all on function public.admin_list_customers_v2() from public;
grant execute on function public.admin_list_customers_v2() to authenticated;

notify pgrst, 'reload schema';

select
  to_regclass('public.stores') as stores_table,
  to_regclass('public.currencies') as currencies_table,
  to_regclass('public.app_settings') as app_settings_table,
  to_regclass('public.content_blocks') as content_blocks_table,
  to_regprocedure('public.admin_list_customers_v2()') as customer_list_rpc;
