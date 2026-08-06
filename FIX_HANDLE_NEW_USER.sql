-- إصلاح دالة إنشاء ملف المستخدم بدون pg_catalog.coalesce
-- نفّذ هذا الملف مرة واحدة داخل Supabase SQL Editor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_full_name text;
  v_country text;
  v_address text;
begin
  v_full_name := case
    when new.raw_user_meta_data ->> 'full_name' is null then ''
    else new.raw_user_meta_data ->> 'full_name'
  end;

  v_country := case
    when new.raw_user_meta_data ->> 'country' is null
      or pg_catalog.btrim(new.raw_user_meta_data ->> 'country') = ''
      then 'العراق'
    else new.raw_user_meta_data ->> 'country'
  end;

  v_address := case
    when new.raw_user_meta_data ->> 'address' is null then ''
    else new.raw_user_meta_data ->> 'address'
  end;

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
    v_full_name,
    new.phone,
    new.email,
    v_country,
    v_address
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email,
    country = excluded.country,
    address = excluded.address;

  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

notify pgrst, 'reload schema';
