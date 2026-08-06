-- Secure admin customer listing for the original administration dashboard.
-- Run once in Supabase SQL Editor.

create or replace function public.admin_list_customers_v2()
returns setof public.customers
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  return query
  select c.*
  from public.customers c
  order by c.created_at desc;
end;
$function$;

revoke all on function public.admin_list_customers_v2() from public;
grant execute on function public.admin_list_customers_v2() to authenticated;

notify pgrst, 'reload schema';

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'admin_list_customers_v2';
