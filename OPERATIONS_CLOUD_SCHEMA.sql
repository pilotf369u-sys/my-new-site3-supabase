-- نفّذ هذا الملف مرة واحدة بعد ADMIN_FULL_CLOUD_SCHEMA.sql و CLOUD_ONLY_MIGRATION.sql.

alter table public.branches enable row level security;
alter table public.staff enable row level security;
alter table public.orders enable row level security;
alter table public.customers enable row level security;
alter table public.settlement_reports enable row level security;

grant select, insert, update, delete on public.branches to authenticated;
grant select, insert, update, delete on public.staff to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.customers to authenticated;
grant select, insert, update on public.settlement_reports to authenticated;

drop policy if exists "staff read branches" on public.branches;
create policy "staff read branches" on public.branches for select to authenticated using (public.is_staff());
drop policy if exists "admin manage branches" on public.branches;
create policy "admin manage branches" on public.branches for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff read staff" on public.staff;
create policy "staff read staff" on public.staff for select to authenticated using (public.is_staff());

drop policy if exists "staff read customers" on public.customers;
create policy "staff read customers" on public.customers for select to authenticated using (public.is_staff());

drop policy if exists "staff read orders" on public.orders;
create policy "staff read orders" on public.orders for select to authenticated using (public.is_staff());
drop policy if exists "staff update orders" on public.orders;
create policy "staff update orders" on public.orders for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff read settlements" on public.settlement_reports;
create policy "staff read settlements" on public.settlement_reports for select to authenticated using (public.is_staff());
drop policy if exists "staff manage settlements" on public.settlement_reports;
create policy "staff manage settlements" on public.settlement_reports for insert to authenticated with check (public.is_staff());

notify pgrst, 'reload schema';
