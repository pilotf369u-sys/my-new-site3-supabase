-- جداول الأقسام الثانوية للوحة الإدارة الأصلية.
-- نفّذ هذا الملف مرة واحدة في Supabase SQL Editor.

create table if not exists public.currencies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  rate numeric(18,6) not null check (rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  image_path text,
  category text not null default 'comprehensive',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.currencies enable row level security;
alter table public.stores enable row level security;
alter table public.content_blocks enable row level security;

revoke all on public.currencies from anon;
revoke all on public.stores from anon;
revoke all on public.content_blocks from anon;

grant select, insert, update, delete on public.currencies to authenticated;
grant select, insert, update, delete on public.stores to authenticated;
grant select, insert, update, delete on public.content_blocks to authenticated;

drop policy if exists "staff manage currencies" on public.currencies;
create policy "staff manage currencies" on public.currencies
for all to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "staff manage stores" on public.stores;
create policy "staff manage stores" on public.stores
for all to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "staff manage content" on public.content_blocks;
create policy "staff manage content" on public.content_blocks
for all to authenticated
using (public.is_staff())
with check (public.is_staff());

-- تأكد أن الجداول الأساسية موجودة ومحمية بسياسات الموظفين.
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.staff enable row level security;
alter table public.branches enable row level security;
alter table public.app_settings enable row level security;

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.staff to authenticated;
grant select, insert, update, delete on public.branches to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customers' and policyname='staff manage customers') then
    create policy "staff manage customers" on public.customers for all to authenticated using (public.is_staff()) with check (public.is_staff());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='orders' and policyname='staff manage orders') then
    create policy "staff manage orders" on public.orders for all to authenticated using (public.is_staff()) with check (public.is_staff());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='staff' and policyname='staff manage staff') then
    create policy "staff manage staff" on public.staff for all to authenticated using (public.is_staff()) with check (public.is_staff());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='branches' and policyname='staff manage branches') then
    create policy "staff manage branches" on public.branches for all to authenticated using (public.is_staff()) with check (public.is_staff());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_settings' and policyname='staff manage settings') then
    create policy "staff manage settings" on public.app_settings for all to authenticated using (public.is_staff()) with check (public.is_staff());
  end if;
end $$;

notify pgrst, 'reload schema';
