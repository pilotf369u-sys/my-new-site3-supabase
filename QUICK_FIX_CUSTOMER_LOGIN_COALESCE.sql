-- إصلاح فوري لخطأ:
-- function pg_catalog.coalesce(text, text) does not exist
-- نفّذ هذا الملف كاملاً مرة واحدة في Supabase SQL Editor.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.customer_password_login_v2(
  p_phone text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer public.customers%rowtype;
  v_salt text;
  v_expected_hash text;
  v_token text;
  v_token_hash text;
begin
  select * into v_customer
  from public.customers
  where public.normalize_customer_phone(phone)
        = public.normalize_customer_phone(p_phone)
    and status = 'active'
    and password_hash like 'sha256$%$%'
  limit 1;

  if v_customer.id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'رقم الهاتف أو كلمة المرور غير صحيحة'
    );
  end if;

  v_salt := pg_catalog.split_part(
    v_customer.password_hash,
    '$',
    2
  );

  v_expected_hash :=
    'sha256$' || v_salt || '$' ||
    pg_catalog.encode(
      extensions.digest(v_salt || p_password, 'sha256'),
      'hex'
    );

  if v_customer.password_hash <> v_expected_hash then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'رقم الهاتف أو كلمة المرور غير صحيحة'
    );
  end if;

  delete from public.customer_portal_sessions
  where expires_at < pg_catalog.now();

  v_token :=
    pg_catalog.md5(
      pg_catalog.random()::text ||
      pg_catalog.clock_timestamp()::text ||
      v_customer.id::text ||
      p_phone
    ) ||
    pg_catalog.md5(
      pg_catalog.random()::text ||
      pg_catalog.clock_timestamp()::text ||
      p_password
    );

  v_token_hash := pg_catalog.encode(
    extensions.digest(v_token, 'sha256'),
    'hex'
  );

  insert into public.customer_portal_sessions (
    token_hash,
    customer_id,
    expires_at
  )
  values (
    v_token_hash,
    v_customer.id,
    pg_catalog.now() + interval '30 days'
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'token', v_token,
    'customer', pg_catalog.jsonb_build_object(
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
$function$;

create or replace function public.customer_portal_data_v2(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  join public.customers c
    on c.id = s.customer_id
  where s.token_hash = v_token_hash
    and s.expires_at > pg_catalog.now()
    and c.status = 'active'
  limit 1;

  if v_customer.id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'انتهت جلسة العميل'
    );
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(o)
      order by o.created_at desc
    ),
    '[]'::jsonb
  )
  into v_orders
  from public.orders o
  where o.customer_id = v_customer.id
     or public.normalize_customer_phone(o.customer_phone)
        = public.normalize_customer_phone(v_customer.phone);

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'customer',
      pg_catalog.to_jsonb(v_customer) - 'password_hash',
    'orders', v_orders
  );
end;
$function$;

grant execute
on function public.customer_password_login_v2(text, text)
to anon, authenticated;

grant execute
on function public.customer_portal_data_v2(text)
to anon, authenticated;

notify pgrst, 'reload schema';

-- اختبارات آمنة للتأكد من عدم بقاء pg_catalog.coalesce
select
  p.proname as function_name,
  position(
    'pg_catalog.coalesce'
    in pg_catalog.pg_get_functiondef(p.oid)
  ) as invalid_coalesce_position
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'customer_password_login_v2',
    'customer_portal_data_v2'
  )
  and p.prokind = 'f';
