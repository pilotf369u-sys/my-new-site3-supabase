create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', phone text, email text,
  country text not null default 'العراق', address text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists profiles_phone_unique_idx on public.profiles(phone) where phone is not null;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  price numeric(12,2) not null default 0 check(price>=0), old_price numeric(12,2) check(old_price is null or old_price>=0),
  price_label text not null, old_price_label text, image text, description text,
  currency text not null default 'IQD', stock_quantity integer not null default 0 check(stock_quantity>=0),
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check(status in ('active','ordered','abandoned')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists one_active_cart_per_user_idx on public.carts(user_id) where status='active';

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(), cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict, quantity integer not null default 1 check(quantity>0),
  unit_price numeric(12,2) not null check(unit_price>=0), color text, size text, weight text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique nulls not distinct (cart_id,product_id,color,size,weight)
);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,full_name,phone,email,country,address) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.phone,new.email,coalesce(new.raw_user_meta_data->>'country','العراق'),coalesce(new.raw_user_meta_data->>'address','')) on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,email=excluded.email,country=excluded.country,address=excluded.address; return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles; create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists products_updated_at on public.products; create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists carts_updated_at on public.carts; create trigger carts_updated_at before update on public.carts for each row execute function public.set_updated_at();
drop trigger if exists cart_items_updated_at on public.cart_items; create trigger cart_items_updated_at before update on public.cart_items for each row execute function public.set_updated_at();
drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security; alter table public.products enable row level security; alter table public.carts enable row level security; alter table public.cart_items enable row level security;
grant usage on schema public to anon,authenticated; grant select on public.products to anon,authenticated; grant select,insert,update on public.profiles to authenticated; grant select,insert,update,delete on public.carts,public.cart_items to authenticated;

drop policy if exists "profiles own select" on public.profiles; create policy "profiles own select" on public.profiles for select to authenticated using(id=(select auth.uid()));
drop policy if exists "profiles own insert" on public.profiles; create policy "profiles own insert" on public.profiles for insert to authenticated with check(id=(select auth.uid()));
drop policy if exists "profiles own update" on public.profiles; create policy "profiles own update" on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
drop policy if exists "active products public" on public.products; create policy "active products public" on public.products for select to anon,authenticated using(is_active=true);
drop policy if exists "own carts select" on public.carts; create policy "own carts select" on public.carts for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "own carts insert" on public.carts; create policy "own carts insert" on public.carts for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists "own carts update" on public.carts; create policy "own carts update" on public.carts for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists "own carts delete" on public.carts; create policy "own carts delete" on public.carts for delete to authenticated using(user_id=(select auth.uid()));
drop policy if exists "own items select" on public.cart_items; create policy "own items select" on public.cart_items for select to authenticated using(exists(select 1 from public.carts c where c.id=cart_id and c.user_id=(select auth.uid())));
drop policy if exists "own items insert" on public.cart_items; create policy "own items insert" on public.cart_items for insert to authenticated with check(exists(select 1 from public.carts c where c.id=cart_id and c.user_id=(select auth.uid()) and c.status='active'));
drop policy if exists "own items update" on public.cart_items; create policy "own items update" on public.cart_items for update to authenticated using(exists(select 1 from public.carts c where c.id=cart_id and c.user_id=(select auth.uid()))) with check(exists(select 1 from public.carts c where c.id=cart_id and c.user_id=(select auth.uid()) and c.status='active'));
drop policy if exists "own items delete" on public.cart_items; create policy "own items delete" on public.cart_items for delete to authenticated using(exists(select 1 from public.carts c where c.id=cart_id and c.user_id=(select auth.uid())));

insert into public.products(code,name,price,old_price,price_label,old_price_label,image,currency,stock_quantity,is_active) values
('M001','شامبو ضد القشرة',15000,null,'15 الف دينار',null,'meshwar-images/m1.jpg','IQD',100,true),
('M002','معطر ملابس',12000,15000,'12 الف دينار','15 الف دينار','meshwar-images/m2.jpg','IQD',100,true),
('M003','معطر جو',20000,null,'20 الف دينار',null,'meshwar-images/m3.jpg','IQD',100,true),
('M004','زبدة',30000,35000,'30 الف دينار','35 الف دينار','meshwar-images/m4.jpg','IQD',100,true)
on conflict(code) do update set name=excluded.name,price=excluded.price,old_price=excluded.old_price,price_label=excluded.price_label,old_price_label=excluded.old_price_label,image=excluded.image,stock_quantity=excluded.stock_quantity,is_active=excluded.is_active;
