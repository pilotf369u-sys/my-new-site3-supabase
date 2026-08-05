-- Run this once in Supabase SQL Editor after SUPABASE_CLOUD_MIGRATION.sql.
-- It lets an existing imported customer activate/login by phone OTP without losing old orders.

create or replace function public.normalize_phone_digits(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_customer_id uuid;
  normalized_new_phone text;
begin
  insert into public.profiles (
    id,
    full_name,
    phone,
    email,
    country,
    address
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.phone,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'country', 'العراق'),
    coalesce(new.raw_user_meta_data ->> 'address', '')
  )
  on conflict (id)
  do update set
    full_name = case
      when excluded.full_name <> '' then excluded.full_name
      else public.profiles.full_name
    end,
    phone = coalesce(excluded.phone, public.profiles.phone),
    email = coalesce(excluded.email, public.profiles.email),
    country = case
      when excluded.country <> '' then excluded.country
      else public.profiles.country
    end,
    address = case
      when excluded.address <> '' then excluded.address
      else public.profiles.address
    end;

  if new.phone is not null then
    normalized_new_phone := public.normalize_phone_digits(new.phone);

    select c.id
      into matched_customer_id
    from public.customers c
    where public.normalize_phone_digits(c.phone) = normalized_new_phone
    order by c.created_at asc
    limit 1;

    if matched_customer_id is not null then
      update public.customers
      set
        auth_user_id = new.id,
        phone = new.phone,
        name = case
          when coalesce(new.raw_user_meta_data ->> 'full_name', '') <> ''
            then new.raw_user_meta_data ->> 'full_name'
          else name
        end,
        email = coalesce(new.email, email),
        country = case
          when coalesce(new.raw_user_meta_data ->> 'country', '') <> ''
            then new.raw_user_meta_data ->> 'country'
          else country
        end,
        address = case
          when coalesce(new.raw_user_meta_data ->> 'address', '') <> ''
            then new.raw_user_meta_data ->> 'address'
          else address
        end,
        payload = payload || jsonb_build_object(
          'auth_activated', true,
          'auth_activated_at', now(),
          'auth_phone', new.phone
        ),
        updated_at = now()
      where id = matched_customer_id;

      update public.orders
      set customer_phone = new.phone,
          updated_at = now()
      where customer_id = matched_customer_id;
    else
      insert into public.customers (
        auth_user_id,
        phone,
        name,
        email,
        country,
        address,
        payload
      )
      values (
        new.id,
        new.phone,
        coalesce(new.raw_user_meta_data ->> 'full_name', ''),
        new.email,
        coalesce(new.raw_user_meta_data ->> 'country', 'العراق'),
        coalesce(new.raw_user_meta_data ->> 'address', ''),
        jsonb_build_object(
          'auth_activated', true,
          'auth_activated_at', now(),
          'auth_phone', new.phone
        )
      )
      on conflict (phone)
      do update set
        auth_user_id = excluded.auth_user_id,
        email = coalesce(excluded.email, public.customers.email),
        updated_at = now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Optional check after a customer activates the account:
-- select id, phone, name, auth_user_id from public.customers order by created_at;
