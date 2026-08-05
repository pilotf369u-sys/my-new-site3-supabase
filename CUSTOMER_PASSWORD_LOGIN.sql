-- Run this once in Supabase SQL Editor.
-- Customer accounts are created by staff with phone, password and customer code.

create extension if not exists pgcrypto;

alter table public.customers
  add column if not exists customer_code text,
  add column if not exists password_hash text;

create unique index if not exists customers_customer_code_unique_idx
  on public.customers(customer_code)
  where customer_code is not null;

create table if not exists public.customer_portal_sessions (
  token_hash text primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.customer_portal_sessions enable row level security;
revoke all on public.customer_portal_sessions from anon, authenticated;

create or replace function public.normalize_customer_phone(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g');
$$;

create or replace function public.admin_upsert_customer_account(
  p_customer_id uuid,
  p_name text,
  p_phone text,
  p_password text,
  p_customer_code text,
  p_email text default null,
  p_country text default null,
  p_address text default null,
  p_state text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_phone text := public.normalize_customer_phone(p_phone);
  v_code text := nullif(trim(p_customer_code), '');
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  if v_phone = '' or trim(coalesce(p_name, '')) = '' then
    raise exception 'Name and phone are required';
  end if;

  if p_customer_id is null and length(coalesce(p_password, '')) < 4 then
    raise exception 'Password must contain at least 4 characters';
  end if;

  if v_code is null then
    v_code := 'CUS-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
  end if;

  if p_customer_id is null then
    insert into public.customers (
      phone, name, email, country, address, status, balance,
      customer_code, password_hash, payload
    ) values (
      v_phone, trim(p_name), nullif(trim(p_email), ''), nullif(trim(p_country), ''),
      nullif(trim(p_address), ''), 'active', 0, v_code,
      crypt(p_password, gen_salt('bf')),
      jsonb_strip_nulls(jsonb_build_object('code', v_code, 'state', nullif(trim(p_state), '')))
    )
    returning id into v_id;
  else
    update public.customers
    set phone = v_phone,
        name = trim(p_name),
        email = nullif(trim(p_email), ''),
        country = nullif(trim(p_country), ''),
        address = nullif(trim(p_address), ''),
        customer_code = v_code,
        password_hash = case
          when length(coalesce(p_password, '')) >= 4 then crypt(p_password, gen_salt('bf'))
          else password_hash
        end,
        payload = coalesce(payload, '{}'::jsonb) ||
          jsonb_strip_nulls(jsonb_build_object('code', v_code, 'state', nullif(trim(p_state), ''))),
        updated_at = now()
    where id = p_customer_id
    returning id into v_id;

    if v_id is null then raise exception 'Customer not found'; end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.customer_password_login(
  p_phone text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_token text;
begin
  select * into v_customer
  from public.customers
  where public.normalize_customer_phone(phone) = public.normalize_customer_phone(p_phone)
    and status = 'active'
    and password_hash is not null
    and password_hash = crypt(p_password, password_hash)
  limit 1;

  if v_customer.id is null then
    return jsonb_build_object('ok', false, 'message', 'رقم الهاتف أو كلمة المرور غير صحيحة');
  end if;

  delete from public.customer_portal_sessions where expires_at < now();
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.customer_portal_sessions(token_hash, customer_id, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_customer.id, now() + interval '30 days');

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'name', v_customer.name,
      'phone', v_customer.phone,
      'code', coalesce(v_customer.customer_code, v_customer.payload ->> 'code'),
      'country', v_customer.country,
      'address', v_customer.address,
      'role', 'customer'
    )
  );
end;
$$;

create or replace function public.customer_portal_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_orders jsonb;
begin
  select c.* into v_customer
  from public.customer_portal_sessions s
  join public.customers c on c.id = s.customer_id
  where s.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and s.expires_at > now()
    and c.status = 'active'
  limit 1;

  if v_customer.id is null then
    return jsonb_build_object('ok', false, 'message', 'انتهت جلسة العميل');
  end if;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc), '[]'::jsonb)
  into v_orders
  from public.orders o
  where o.customer_id = v_customer.id
     or public.normalize_customer_phone(o.customer_phone) = public.normalize_customer_phone(v_customer.phone);

  return jsonb_build_object(
    'ok', true,
    'customer', to_jsonb(v_customer) - 'password_hash',
    'orders', v_orders
  );
end;
$$;

revoke all on function public.admin_upsert_customer_account(uuid,text,text,text,text,text,text,text,text) from public;
grant execute on function public.admin_upsert_customer_account(uuid,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.customer_password_login(text,text) to anon, authenticated;
grant execute on function public.customer_portal_data(text) to anon, authenticated;

-- Give imported customers temporary passwords by editing each customer in the admin panel.
-- The password field is required for a new customer and optional when editing an existing customer.
