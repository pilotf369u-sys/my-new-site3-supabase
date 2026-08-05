alter table public.profiles add column if not exists role text not null default 'customer' check (role in ('customer','admin','employee','delivery','branch'));

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.profiles where id=(select auth.uid()) and role in ('admin','employee','delivery','branch'));
$$;

create table if not exists public.customers(
 id uuid primary key default gen_random_uuid(), auth_user_id uuid unique references auth.users(id) on delete set null,
 phone text not null unique, name text not null default '', email text, country text, address text,
 status text not null default 'active', balance numeric(14,2) not null default 0,
 payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.orders(
 id uuid primary key default gen_random_uuid(), legacy_id text unique,
 customer_id uuid references public.customers(id) on delete cascade, customer_phone text not null,
 status text not null default 'new', payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists orders_customer_phone_idx on public.orders(customer_phone);
create index if not exists orders_status_idx on public.orders(status);

create table if not exists public.staff(
 id uuid primary key default gen_random_uuid(), auth_user_id uuid references auth.users(id) on delete set null,
 role text not null check(role in ('admin','employee','delivery','branch')), phone text not null,
 name text not null default '', status text not null default 'active', payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(role,phone)
);
create table if not exists public.branches(
 id uuid primary key default gen_random_uuid(), name text not null unique, phone text,
 status text not null default 'active', payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.app_settings(
 key text primary key, value jsonb not null default 'null'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.settlement_reports(
 id uuid primary key default gen_random_uuid(), legacy_id text unique, report_type text not null default 'branch',
 payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,full_name,phone,email,country,address)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.phone,new.email,coalesce(new.raw_user_meta_data->>'country','العراق'),coalesce(new.raw_user_meta_data->>'address',''))
 on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,email=excluded.email,country=excluded.country,address=excluded.address;
 if new.phone is not null then
  insert into public.customers(auth_user_id,phone,name,email,country,address,payload)
  values(new.id,new.phone,coalesce(new.raw_user_meta_data->>'full_name',''),new.email,coalesce(new.raw_user_meta_data->>'country','العراق'),coalesce(new.raw_user_meta_data->>'address',''),
  jsonb_build_object('name',coalesce(new.raw_user_meta_data->>'full_name',''),'phone',new.phone,'email',new.email,'country',coalesce(new.raw_user_meta_data->>'country','العراق'),'address',coalesce(new.raw_user_meta_data->>'address','')))
  on conflict(phone) do update set auth_user_id=excluded.auth_user_id,name=excluded.name,email=excluded.email,country=excluded.country,address=excluded.address,payload=excluded.payload;
 end if;
 return new;
end;$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.staff enable row level security;
alter table public.branches enable row level security;
alter table public.app_settings enable row level security;
alter table public.settlement_reports enable row level security;
grant select,insert,update,delete on public.customers,public.orders,public.staff,public.branches,public.app_settings,public.settlement_reports to authenticated;

drop policy if exists "customers cloud select" on public.customers;
create policy "customers cloud select" on public.customers for select to authenticated using(auth_user_id=(select auth.uid()) or public.is_staff());
drop policy if exists "customers cloud insert" on public.customers;
create policy "customers cloud insert" on public.customers for insert to authenticated with check(auth_user_id=(select auth.uid()) or public.is_staff());
drop policy if exists "customers cloud update" on public.customers;
create policy "customers cloud update" on public.customers for update to authenticated using(auth_user_id=(select auth.uid()) or public.is_staff()) with check(auth_user_id=(select auth.uid()) or public.is_staff());
drop policy if exists "customers cloud delete" on public.customers;
create policy "customers cloud delete" on public.customers for delete to authenticated using(public.is_staff());

drop policy if exists "orders cloud select" on public.orders;
create policy "orders cloud select" on public.orders for select to authenticated using(public.is_staff() or exists(select 1 from public.customers c where c.id=customer_id and c.auth_user_id=(select auth.uid())));
drop policy if exists "orders cloud insert" on public.orders;
create policy "orders cloud insert" on public.orders for insert to authenticated with check(public.is_staff() or exists(select 1 from public.customers c where c.id=customer_id and c.auth_user_id=(select auth.uid())));
drop policy if exists "orders cloud update" on public.orders;
create policy "orders cloud update" on public.orders for update to authenticated using(public.is_staff() or exists(select 1 from public.customers c where c.id=customer_id and c.auth_user_id=(select auth.uid()))) with check(public.is_staff() or exists(select 1 from public.customers c where c.id=customer_id and c.auth_user_id=(select auth.uid())));
drop policy if exists "orders cloud delete" on public.orders;
create policy "orders cloud delete" on public.orders for delete to authenticated using(public.is_staff());

do $$ declare t text; begin
 foreach t in array array['staff','branches','app_settings','settlement_reports'] loop
  execute format('drop policy if exists %I on public.%I',t||' staff select',t);
  execute format('create policy %I on public.%I for select to authenticated using(public.is_staff())',t||' staff select',t);
  execute format('drop policy if exists %I on public.%I',t||' staff insert',t);
  execute format('create policy %I on public.%I for insert to authenticated with check(public.is_staff())',t||' staff insert',t);
  execute format('drop policy if exists %I on public.%I',t||' staff update',t);
  execute format('create policy %I on public.%I for update to authenticated using(public.is_staff()) with check(public.is_staff())',t||' staff update',t);
  execute format('drop policy if exists %I on public.%I',t||' staff delete',t);
  execute format('create policy %I on public.%I for delete to authenticated using(public.is_staff())',t||' staff delete',t);
 end loop;
end $$;

-- After registering the administrator by phone, run once with the real number:
-- update public.profiles set role='admin' where phone='+964XXXXXXXXXX';
