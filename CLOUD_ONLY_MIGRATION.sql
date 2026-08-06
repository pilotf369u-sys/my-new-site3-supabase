-- Cloud-only migration: customers, orders, messages and rewards live in Supabase.
-- Run once in Supabase SQL Editor after the existing customer login functions.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  sender text not null check (sender in ('customer','staff','admin')),
  body text not null check (char_length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists messages_customer_created_idx on public.messages(customer_id, created_at);
create index if not exists messages_order_created_idx on public.messages(order_id, created_at);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  note text,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rewards_customer_created_idx on public.rewards(customer_id, created_at);

alter table public.messages enable row level security;
alter table public.rewards enable row level security;

grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.rewards to authenticated;

drop policy if exists "staff manage messages" on public.messages;
create policy "staff manage messages" on public.messages
for all to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "staff manage rewards" on public.rewards;
create policy "staff manage rewards" on public.rewards
for all to authenticated
using (public.is_staff())
with check (public.is_staff());

create or replace function public.customer_portal_data_v2(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer public.customers%rowtype;
  v_orders jsonb;
  v_messages jsonb;
  v_rewards jsonb;
  v_token_hash text;
begin
  v_token_hash := pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex');

  select c.* into v_customer
  from public.customer_portal_sessions s
  join public.customers c on c.id = s.customer_id
  where s.token_hash = v_token_hash
    and s.expires_at > pg_catalog.now()
    and c.status = 'active'
  limit 1;

  if v_customer.id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'انتهت جلسة العميل');
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(o) order by o.created_at desc),
    '[]'::jsonb
  ) into v_orders
  from public.orders o
  where o.customer_id = v_customer.id
     or public.normalize_customer_phone(o.customer_phone) = public.normalize_customer_phone(v_customer.phone);

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.created_at asc),
    '[]'::jsonb
  ) into v_messages
  from public.messages m
  where m.customer_id = v_customer.id;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.created_at desc),
    '[]'::jsonb
  ) into v_rewards
  from public.rewards r
  where r.customer_id = v_customer.id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'customer', pg_catalog.to_jsonb(v_customer) - 'password_hash',
    'orders', v_orders,
    'messages', v_messages,
    'rewards', v_rewards
  );
end;
$function$;

create or replace function public.customer_update_address(p_token text, p_address text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer_id uuid;
begin
  select s.customer_id into v_customer_id
  from public.customer_portal_sessions s
  where s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.expires_at > pg_catalog.now()
  limit 1;
  if v_customer_id is null then return pg_catalog.jsonb_build_object('ok', false, 'message', 'انتهت الجلسة'); end if;
  update public.customers set address = pg_catalog.btrim(p_address), updated_at = pg_catalog.now() where id = v_customer_id;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.customer_send_message(p_token text, p_order_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer_id uuid;
  v_message_id uuid;
begin
  select s.customer_id into v_customer_id
  from public.customer_portal_sessions s
  where s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.expires_at > pg_catalog.now()
  limit 1;
  if v_customer_id is null then return pg_catalog.jsonb_build_object('ok', false, 'message', 'انتهت الجلسة'); end if;
  if p_order_id is not null and not exists (select 1 from public.orders o where o.id = p_order_id and o.customer_id = v_customer_id) then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'الطلب غير تابع لهذا العميل');
  end if;
  insert into public.messages(customer_id, order_id, sender, body)
  values(v_customer_id, p_order_id, 'customer', pg_catalog.btrim(p_body)) returning id into v_message_id;
  return pg_catalog.jsonb_build_object('ok', true, 'id', v_message_id);
end;
$function$;

create or replace function public.customer_cancel_order(p_token text, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer_id uuid;
  v_updated uuid;
begin
  select s.customer_id into v_customer_id
  from public.customer_portal_sessions s
  where s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.expires_at > pg_catalog.now()
  limit 1;
  if v_customer_id is null then return pg_catalog.jsonb_build_object('ok', false, 'message', 'انتهت الجلسة'); end if;
  update public.orders
  set status = 'cancelled_by_customer', updated_at = pg_catalog.now()
  where id = p_order_id and customer_id = v_customer_id
    and status not in ('delivered','cancelled','cancelled_by_customer')
  returning id into v_updated;
  if v_updated is null then return pg_catalog.jsonb_build_object('ok', false, 'message', 'لا يمكن إلغاء هذا الطلب'); end if;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.customer_portal_data_v2(text) to anon, authenticated;
grant execute on function public.customer_update_address(text,text) to anon, authenticated;
grant execute on function public.customer_send_message(text,uuid,text) to anon, authenticated;
grant execute on function public.customer_cancel_order(text,uuid) to anon, authenticated;

notify pgrst, 'reload schema';