-- Final repair for customer portal session loading.
-- Run once in Supabase SQL Editor. No customers or orders are deleted.

create or replace function public.customer_portal_data_v2(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer public.customers%rowtype;
  v_orders jsonb := '[]'::jsonb;
  v_messages jsonb := '[]'::jsonb;
  v_rewards jsonb := '[]'::jsonb;
  v_token_hash text;
begin
  if p_token is null or pg_catalog.btrim(p_token) = '' then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'رمز الجلسة غير موجود');
  end if;

  v_token_hash := pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex');

  select c.*
  into v_customer
  from public.customer_portal_sessions s
  join public.customers c on c.id = s.customer_id
  where s.token_hash = v_token_hash
    and s.expires_at > pg_catalog.now()
    and c.status = 'active'
  order by s.expires_at desc
  limit 1;

  if v_customer.id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'جلسة العميل غير موجودة أو منتهية');
  end if;

  select case
    when pg_catalog.count(*) = 0 then '[]'::jsonb
    else pg_catalog.jsonb_agg(pg_catalog.to_jsonb(o) order by o.created_at desc)
  end
  into v_orders
  from public.orders o
  where o.customer_id = v_customer.id
     or public.normalize_customer_phone(o.customer_phone) = public.normalize_customer_phone(v_customer.phone);

  if pg_catalog.to_regclass('public.messages') is not null then
    execute $sql$
      select case
        when pg_catalog.count(*) = 0 then '[]'::jsonb
        else pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.created_at asc)
      end
      from public.messages m
      where m.customer_id = $1
    $sql$ into v_messages using v_customer.id;
  end if;

  if pg_catalog.to_regclass('public.rewards') is not null then
    execute $sql$
      select case
        when pg_catalog.count(*) = 0 then '[]'::jsonb
        else pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.created_at desc)
      end
      from public.rewards r
      where r.customer_id = $1
    $sql$ into v_rewards using v_customer.id;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'customer', pg_catalog.to_jsonb(v_customer) - 'password_hash',
    'orders', v_orders,
    'messages', v_messages,
    'rewards', v_rewards
  );
end;
$function$;

grant execute on function public.customer_portal_data_v2(text) to anon, authenticated;
notify pgrst, 'reload schema';

select strpos(
  pg_get_functiondef('public.customer_portal_data_v2(text)'::regprocedure),
  'pg_catalog.coalesce'
) as invalid_coalesce_position;
