-- FINAL isolated v2 customer account patch.
-- Run this file once in Supabase SQL Editor.
-- It does not delete customers or orders.
-- It does not call gen_random_bytes, gen_random_uuid, gen_salt or crypt.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_upsert_customer_account_v2(
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
  v_code text := nullif(pg_catalog.trim(p_customer_code), '');
  v_salt text;
  v_password_hash text;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  if v_phone = '' or pg_catalog.trim(pg_catalog.coalesce(p_name, '')) = '' then
    raise exception 'Name and phone are required';
  end if;

  if p_customer_id is null and pg_catalog.length(pg_catalog.coalesce(p_password, '')) < 4 then
    raise exception 'Password must contain at least 4 characters';
  end if;

  if v_code is null then
    v_code := 'CUS-' || pg_catalog.upper(pg_catalog.substr(
      pg_catalog.md5(
        pg_catalog.random()::text ||
        pg_catalog.clock_timestamp()::text ||
        v_phone
      ), 1, 8
    ));
  end if;

  if pg_catalog.length(pg_catalog.coalesce(p_password, '')) >= 4 then
    v_salt := pg_catalog.md5(
      pg_catalog.random()::text ||
      pg_catalog.clock_timestamp()::text ||
      v_phone ||
      pg_catalog.coalesce(p_customer_id::text, '')
    );
    v_password_hash := 'sha256$' || v_salt || '$' ||
      pg_catalog.encode(extensions.digest(v_salt || p_password, 'sha256'), 'hex');
  end if;

  if p_customer_id is null then
    insert into public.customers (
      phone, name, email, country, address, status, balance,
      customer_code, password_hash, payload
    ) values (
      v_phone,
      pg_catalog.trim(p_name),
      nullif(pg_catalog.trim(p_email), ''),
      nullif(pg_catalog.trim(p_country), ''),
      nullif(pg_catalog.trim(p_address), ''),
      'active', 0, v_code, v_password_hash,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'code', v_code,
        'state', nullif(pg_catalog.trim(p_state), '')
      ))
    ) returning id into v_id;
  else
    update public.customers
    set phone = v_phone,
        name = pg_catalog.trim(p_name),
        email = nullif(pg_catalog.trim(p_email), ''),
        country = nullif(pg_catalog.trim(p_country), ''),
        address = nullif(pg_catalog.trim(p_address), ''),
        customer_code = v_code,
        password_hash = case
          when v_password_hash is not null then v_password_hash
          else password_hash
        end,
        payload = pg_catalog.coalesce(payload, '{}'::jsonb) ||
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'code', v_code,
            'state', nullif(pg_catalog.trim(p_state), '')
          )),
        updated_at = pg_catalog.now()
    where id = p_customer_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Customer not found';
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.customer_password_login_v2(
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
  v_salt text;
  v_expected_hash text;
  v_token text;
  v_token_hash text;
begin
  select * into v_customer
  from public.customers
  where public.normalize_customer_phone(phone) = public.normalize_customer_phone(p_phone)
    and status = 'active'
    and password_hash like 'sha256$%$%'
  limit 1;

  if v_customer.id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'رقم الهاتف أو كلمة المرور غير صحيحة');
  end if;

  v_salt := pg_catalog.split_part(v_customer.password_hash, '$', 2);
  v_expected_hash := 'sha256$' || v_salt || '$' ||
    pg_catalog.encode(extensions.digest(v_salt || p_password, 'sha256'), 'hex');

  if v_customer.password_hash <> v_expected_hash then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'رقم الهاتف أو كلمة المرور غير صحيحة');
  end if;

  delete from public.customer_portal_sessions
  where expires_at < pg_catalog.now();

  v_token := pg_catalog.md5(
    pg_catalog.random()::text || pg_catalog.clock_timestamp()::text ||
    v_customer.id::text || p_phone
  ) || pg_catalog.md5(
    pg_catalog.random()::text || pg_catalog.clock_timestamp()::text || p_password
  );

  v_token_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.customer_portal_sessions(token_hash, customer_id, expires_at)
  values (v_token_hash, v_customer.id, pg_catalog.now() + interval '30 days');

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'token', v_token,
    'customer', pg_catalog.jsonb_build_object(
      'id', v_customer.id,
      'name', v_customer.name,
      'phone', v_customer.phone,
      'code', pg_catalog.coalesce(v_customer.customer_code, v_customer.payload ->> 'code'),
      'country', v_customer.country,
      'address', v_customer.address,
      'role', 'customer'
    )
  );
end;
$$;

create or replace function public.customer_portal_data_v2(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_orders jsonb;
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

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(o) order by o.created_at desc),
    '[]'::jsonb
  ) into v_orders
  from public.orders o
  where o.customer_id = v_customer.id
     or public.normalize_customer_phone(o.customer_phone)
        = public.normalize_customer_phone(v_customer.phone);

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'customer', pg_catalog.to_jsonb(v_customer) - 'password_hash',
    'orders', v_orders
  );
end;
$$;

revoke all on function public.admin_upsert_customer_account_v2(uuid,text,text,text,text,text,text,text,text) from public;
grant execute on function public.admin_upsert_customer_account_v2(uuid,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.customer_password_login_v2(text,text) to anon, authenticated;
grant execute on function public.customer_portal_data_v2(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Verification: must return exactly 3 rows, all ending with _v2.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'admin_upsert_customer_account_v2',
    'customer_password_login_v2',
    'customer_portal_data_v2'
  )
order by p.proname;