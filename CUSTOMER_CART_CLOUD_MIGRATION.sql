-- Cloud-only customer cart migration.
-- Run once in Supabase SQL Editor after the previous migrations.

alter table public.carts
  add column if not exists customer_id uuid references public.customers(id) on delete cascade;

alter table public.carts
  alter column user_id drop not null;

create index if not exists carts_customer_id_idx on public.carts(customer_id);
create unique index if not exists one_active_cart_per_customer_idx
  on public.carts(customer_id)
  where customer_id is not null and status = 'active';

create or replace function public.customer_session_customer_id(p_token text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select s.customer_id
  from public.customer_portal_sessions s
  where s.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.expires_at > pg_catalog.now()
  limit 1;
$$;

create or replace function public.customer_add_cart_item_v2(
  p_token text,
  p_product_id uuid,
  p_quantity integer,
  p_unit_price numeric,
  p_color text default null,
  p_size text default null,
  p_weight text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_cart_id uuid;
  v_item_id uuid;
begin
  v_customer_id := public.customer_session_customer_id(p_token);
  if v_customer_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'انتهت جلسة العميل');
  end if;

  if p_quantity is null or p_quantity < 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'الكمية غير صحيحة');
  end if;

  select id into v_cart_id
  from public.carts
  where customer_id = v_customer_id and status = 'active'
  limit 1;

  if v_cart_id is null then
    insert into public.carts(customer_id, status)
    values(v_customer_id, 'active')
    returning id into v_cart_id;
  end if;

  insert into public.cart_items(
    cart_id, product_id, quantity, unit_price, color, size, weight
  ) values (
    v_cart_id,
    p_product_id,
    p_quantity,
    p_unit_price,
    nullif(pg_catalog.btrim(case when p_color is null then '' else p_color end), ''),
    nullif(pg_catalog.btrim(case when p_size is null then '' else p_size end), ''),
    nullif(pg_catalog.btrim(case when p_weight is null then '' else p_weight end), '')
  )
  on conflict (cart_id, product_id, color, size, weight)
  do update set
    quantity = public.cart_items.quantity + excluded.quantity,
    unit_price = excluded.unit_price,
    updated_at = pg_catalog.now()
  returning id into v_item_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'cart_id', v_cart_id,
    'item_id', v_item_id
  );
end;
$$;

create or replace function public.customer_cart_data_v2(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_items jsonb;
begin
  v_customer_id := public.customer_session_customer_id(p_token);
  if v_customer_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'انتهت جلسة العميل');
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', ci.id,
        'quantity', ci.quantity,
        'unit_price', ci.unit_price,
        'color', ci.color,
        'size', ci.size,
        'weight', ci.weight,
        'product', pg_catalog.jsonb_build_object(
          'id', p.id,
          'code', p.code,
          'name', p.name,
          'image', p.image,
          'price_label', p.price_label
        )
      ) order by ci.created_at desc
    ),
    '[]'::jsonb
  ) into v_items
  from public.carts c
  join public.cart_items ci on ci.cart_id = c.id
  join public.products p on p.id = ci.product_id
  where c.customer_id = v_customer_id and c.status = 'active';

  return pg_catalog.jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

grant execute on function public.customer_session_customer_id(text) to anon, authenticated;
grant execute on function public.customer_add_cart_item_v2(text,uuid,integer,numeric,text,text,text) to anon, authenticated;
grant execute on function public.customer_cart_data_v2(text) to anon, authenticated;

notify pgrst, 'reload schema';
