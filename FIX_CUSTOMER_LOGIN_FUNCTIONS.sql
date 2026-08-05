-- Direct patch for customer account functions.
-- Run this file once in Supabase SQL Editor.
-- It replaces the existing functions and does not delete customer or order data.
-- This version does NOT use gen_random_bytes(), gen_random_uuid(), gen_salt(), or crypt().

create extension if not exists pgcrypto with schema extensions;

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
  v_salt text;
  v_password_hash text;
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
    v_code := 'CUS-' || upper(substr(
      pg_catalog.md5(
        pg_catalog.random()::text ||
        pg_catalog.clock_timestamp()::text ||
        v_phone
      ),
      1,
      8
    ));
  end if;

  if length(coalesce(p_password, '')) >= 4 then
    v_salt := pg_catalog.md5(
      pg_catalog.random()::text ||
      pg_catalog.clock_timestamp()::text ||
      v_phone ||
      coalesce(p_customer_id::text, '')
    );

    v_password_hash := 'sha256$' || v_salt || '$' ||
      pg_catalog.encode(
        extensions.digest(v_salt || p_password, 'sha256'),
        'hex'
      );
  end if;

  if p_customer_id is null then
    insert into public.customers (
      phone,
      name,
      email,
      country,
      address,
      status,
      balance,
      customer_code,
      password_hash,
      payload
    )
    values (
      v_phone,
      trim(p_name),
      nullif(trim(p_email), ''),
      nullif(trim(p_country), ''),
      nullif(trim(p_address), ''),
      'active',
      0,
      v_code,
      v_password_hash,
      jsonb_strip_nulls(
        jsonb_build_object(
          'code', v_code,
          'state', nullif(trim(p_state), '')
        )
      )
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
          when v_password_hash is not null then v_password_hash
          else password_hash
        end,
        payload = coalesce(payload, '{}'::jsonb) ||
          jsonb_strip_nulls(
            jsonb_build_object(
              'code', v_code,
              'state', nullif(trim(p_state), '')
            )
          ),
        updated_at = now()
    where id = p_customer_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Customer not found';
    end if;
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
  v_salt text;
  v_expected_hash text;
  v_token text;
  v_token_hash text;
begin
  select * into v_customer
  from public.customers
  where public.normalize_customer_phone(phone) = public.normalize_customer_phone(p_phone)
    and status = 'active'
    and password_hash is not null
  limit 1;

  if v_customer.id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'رقم الهاتف أو كلمة المرور غير صحيحة'
    );
  end if;

  if v_customer.password_hash like 'sha256$%$%' then
    v_salt := split_part(v_customer.password_hash, '$', 2);
    v_expected_hash := 'sha256$' || v_salt || '$' ||
      pg_catalog.encode(
        extensions.digest(v_salt || p_password, 'sha256'),
        'hex'
      );

    if v_customer.password_hash <> v_expected_hash then
      return jsonb_build_object(
        'ok', false,
        'message', 'رقم الهاتف أو كلمة المرور غير صحيحة'
      );
    end if;
  else
    -- Legacy bcrypt hashes remain supported where pgcrypto crypt() is available.
    if v_customer.password_hash <> extensions.crypt(p_password, v_customer.password_hash) then
      return jsonb_build_object(
        'ok', false,
        'message', 'رقم الهاتف أو كلمة المرور غير صحيحة'
      );
    end if;
  end if;

  delete from public.customer_portal_sessions
  where expires_at < now();

  v_token := pg_catalog.md5(
    pg_catalog.random()::text ||
    pg_catalog.clock_timestamp()::text ||
    v_customer.id::text ||
    p_phone
  ) || pg_catalog.md5(
    pg_catalog.random()::text ||
    pg_catalog.clock_timestamp()::text ||
    p_password
  );

  v_token_hash := pg_catalog.encode(
    extensions.digest(v_token, 'sha256'),
    'hex'
  );

  insert into public.customer_portal_sessions(
    token_hash,
    customer_id,
    expires_at
  )
  values (
    v_token_hash,
    v_customer.id,
    now() + interval '30 days'
  );

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'name', v_customer.name,
      'phone', v_customer.phone,
      'code', coalesce(
        v_customer.customer_code,
        v_customer.payload ->> 'code'
      ),
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
  v_token_hash text;
begin
  v_token_hash := pg_catalog.encode(
    extensions.digest(p_token, 'sha256'),
    'hex'
  );

  select c.* into v_customer
  from public.customer_portal_sessions s
  join public.customers c on c.id = s.customer_id
  where s.token_hash = v_token_hash
    and s.expires_at > now()
    and c.status = 'active'
  limit 1;

  if v_customer.id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'انتهت جلسة العميل'
    );
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(o) order by o.created_at desc),
    '[]'::jsonb
  )
  into v_orders
  from public.orders o
  where o.customer_id = v_customer.id
     or public.normalize_customer_phone(o.customer_phone)
        = public.normalize_customer_phone(v_customer.phone);

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

notify pgrst, 'reload schema';

-- Verification: this query must return zero rows.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'admin_upsert_customer_account',
    'customer_password_login',
    'customer_portal_data'
  )
  and (
    pg_get_functiondef(p.oid) ilike '%gen_random_bytes%'
    or pg_get_functiondef(p.oid) ilike '%gen_random_uuid%'
    or pg_get_functiondef(p.oid) ilike '%gen_salt%'
  );