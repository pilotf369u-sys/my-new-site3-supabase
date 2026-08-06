-- Final runtime fix for the current admin dashboard.
-- Run this whole file once in Supabase SQL Editor.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_blocks enable row level security;
grant select, insert, update, delete on public.content_blocks to authenticated;

drop policy if exists "Staff can manage content blocks" on public.content_blocks;
create policy "Staff can manage content blocks"
on public.content_blocks
for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

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
as $function$
declare
  v_id uuid;
  v_phone text := public.normalize_customer_phone(p_phone);
  v_code text := nullif(pg_catalog.btrim(coalesce(p_customer_code, '')), '');
  v_salt text;
  v_password_hash text;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  if v_phone = '' or pg_catalog.btrim(coalesce(p_name, '')) = '' then
    raise exception 'Name and phone are required';
  end if;

  if p_customer_id is null and pg_catalog.length(coalesce(p_password, '')) < 4 then
    raise exception 'Password must contain at least 4 characters';
  end if;

  if v_code is null then
    v_code := 'CUS-' || pg_catalog.upper(
      pg_catalog.substr(
        pg_catalog.md5(
          pg_catalog.random()::text ||
          pg_catalog.clock_timestamp()::text ||
          v_phone
        ),
        1,
        8
      )
    );
  end if;

  if pg_catalog.length(coalesce(p_password, '')) >= 4 then
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
      pg_catalog.btrim(p_name),
      nullif(pg_catalog.btrim(coalesce(p_email, '')), ''),
      nullif(pg_catalog.btrim(coalesce(p_country, '')), ''),
      nullif(pg_catalog.btrim(coalesce(p_address, '')), ''),
      'active',
      0,
      v_code,
      v_password_hash,
      pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'code', v_code,
          'state', nullif(pg_catalog.btrim(coalesce(p_state, '')), '')
        )
      )
    )
    returning id into v_id;
  else
    update public.customers
    set phone = v_phone,
        name = pg_catalog.btrim(p_name),
        email = nullif(pg_catalog.btrim(coalesce(p_email, '')), ''),
        country = nullif(pg_catalog.btrim(coalesce(p_country, '')), ''),
        address = nullif(pg_catalog.btrim(coalesce(p_address, '')), ''),
        customer_code = v_code,
        password_hash = case
          when v_password_hash is not null then v_password_hash
          else password_hash
        end,
        payload = coalesce(payload, '{}'::jsonb) ||
          pg_catalog.jsonb_strip_nulls(
            pg_catalog.jsonb_build_object(
              'code', v_code,
              'state', nullif(pg_catalog.btrim(coalesce(p_state, '')), '')
            )
          ),
        updated_at = pg_catalog.now()
    where id = p_customer_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Customer not found';
    end if;
  end if;

  return v_id;
end;
$function$;

grant execute on function public.admin_upsert_customer_account_v2(
  uuid, text, text, text, text, text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';

-- Expected result: 0
select strpos(
  pg_get_functiondef(
    'public.admin_upsert_customer_account_v2(uuid,text,text,text,text,text,text,text,text)'::regprocedure
  ),
  'pg_catalog.coalesce'
) as invalid_coalesce_position;
