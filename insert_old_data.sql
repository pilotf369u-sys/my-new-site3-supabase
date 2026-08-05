-- MeshWar legacy data import
-- Run AFTER SUPABASE_CLOUD_MIGRATION.sql
-- This script is idempotent: it can be executed more than once safely.
-- Plain-text passwords found in the legacy frontend are intentionally NOT imported.

begin;

-- =========================================================
-- 1) Legacy customers
-- Sources: customers_db.js and admin-dashboard.html
-- Duplicate customer records are merged by phone number.
-- =========================================================

insert into public.customers (
  phone,
  name,
  email,
  country,
  address,
  status,
  balance,
  payload
)
values
  (
    '905378240430',
    'عمر الجماس',
    null,
    'تركيا',
    'إسطنبول - الفاتح، شارع الأنس',
    'active',
    0,
    jsonb_build_object(
      'code', 'CUS-9014',
      'state', 'إسطنبول',
      'rewardActive', false,
      'usageCount', 0,
      'lastRewardAtCompletedCount', 0,
      'rewardsLog', jsonb_build_array(),
      'legacy_names', jsonb_build_array('عمر الجماس', 'Omar al Jammas'),
      'legacy_addresses', jsonb_build_array(
        'إسطنبول - الفاتح، شارع الأنس',
        'بغداد، حي المنصور، شارع 14 رمضان'
      ),
      'password_migration_required', true,
      'source_files', jsonb_build_array('admin-dashboard.html', 'customers_db.js')
    )
  ),
  (
    '9647772279773',
    'عبد العزيز',
    null,
    'العراق',
    'بغداد، حي العدل، شارع 14',
    'active',
    0,
    jsonb_build_object(
      'password_migration_required', true,
      'source_files', jsonb_build_array('customers_db.js')
    )
  ),
  (
    '9647774366640',
    'عمار الحمداني',
    null,
    'العراق',
    'اربيل، سوق، شارع',
    'active',
    0,
    jsonb_build_object(
      'password_migration_required', true,
      'source_files', jsonb_build_array('customers_db.js')
    )
  ),
  (
    '9647718303382',
    'اسيل',
    null,
    'العراق',
    'تركيا، انقرة، كيجوران',
    'active',
    0,
    jsonb_build_object(
      'password_migration_required', true,
      'source_files', jsonb_build_array('customers_db.js')
    )
  )
on conflict (phone) do update
set
  name = excluded.name,
  email = coalesce(excluded.email, public.customers.email),
  country = excluded.country,
  address = excluded.address,
  status = excluded.status,
  payload = public.customers.payload || excluded.payload,
  updated_at = now();

-- =========================================================
-- 2) Legacy orders
-- The old code reused MW-8821 for two different customers.
-- The original value is kept in payload.original_legacy_id, while
-- legacy_id is made unique for the second record.
-- =========================================================

insert into public.orders (
  legacy_id,
  customer_id,
  customer_phone,
  status,
  payload
)
select
  'MW-9014',
  c.id,
  c.phone,
  'تم التسليم',
  jsonb_build_object(
    'id', 'MW-9014',
    'price', '$85.50',
    'numericPrice', 85.50,
    'currency', '$',
    'productUrl', 'https://www.trendyol.com/jumbo/smart-sarimsak-ezici-p-234164216',
    'notes', 'طلب تجريبي عبر المنصة',
    'legacy_status_variants', jsonb_build_array('في انتظار الدفع', 'تم التسليم'),
    'source_files', jsonb_build_array('admin-dashboard.html', 'customers_db.js')
  )
from public.customers c
where c.phone = '905378240430'
on conflict (legacy_id) do update
set
  customer_id = excluded.customer_id,
  customer_phone = excluded.customer_phone,
  status = excluded.status,
  payload = public.orders.payload || excluded.payload,
  updated_at = now();

insert into public.orders (
  legacy_id,
  customer_id,
  customer_phone,
  status,
  payload
)
select
  'MW-8821-905378240430',
  c.id,
  c.phone,
  'قيد المعالجة',
  jsonb_build_object(
    'id', '#MW-8821',
    'original_legacy_id', '#MW-8821',
    'price', '$120.00',
    'numericPrice', 120.00,
    'currency', '$',
    'source_files', jsonb_build_array('customers_db.js')
  )
from public.customers c
where c.phone = '905378240430'
on conflict (legacy_id) do update
set
  customer_id = excluded.customer_id,
  customer_phone = excluded.customer_phone,
  status = excluded.status,
  payload = public.orders.payload || excluded.payload,
  updated_at = now();

insert into public.orders (
  legacy_id,
  customer_id,
  customer_phone,
  status,
  payload
)
select
  'MW-5520',
  c.id,
  c.phone,
  'تم التوصيل',
  jsonb_build_object(
    'id', '#MW-5520',
    'price', '$200.00',
    'numericPrice', 200.00,
    'currency', '$',
    'source_files', jsonb_build_array('customers_db.js')
  )
from public.customers c
where c.phone = '9647772279773'
on conflict (legacy_id) do update
set
  customer_id = excluded.customer_id,
  customer_phone = excluded.customer_phone,
  status = excluded.status,
  payload = public.orders.payload || excluded.payload,
  updated_at = now();

insert into public.orders (
  legacy_id,
  customer_id,
  customer_phone,
  status,
  payload
)
select
  'MW-8821-9647772279773',
  c.id,
  c.phone,
  'قيد المعالجة',
  jsonb_build_object(
    'id', '#MW-8821',
    'original_legacy_id', '#MW-8821',
    'price', '$120.00',
    'numericPrice', 120.00,
    'currency', '$',
    'source_files', jsonb_build_array('customers_db.js')
  )
from public.customers c
where c.phone = '9647772279773'
on conflict (legacy_id) do update
set
  customer_id = excluded.customer_id,
  customer_phone = excluded.customer_phone,
  status = excluded.status,
  payload = public.orders.payload || excluded.payload,
  updated_at = now();

insert into public.orders (
  legacy_id,
  customer_id,
  customer_phone,
  status,
  payload
)
select
  'MW-3312',
  c.id,
  c.phone,
  'قيد الشحن',
  jsonb_build_object(
    'id', '#MW-3312',
    'price', '$45.00',
    'numericPrice', 45.00,
    'currency', '$',
    'source_files', jsonb_build_array('customers_db.js')
  )
from public.customers c
where c.phone = '9647718303382'
on conflict (legacy_id) do update
set
  customer_id = excluded.customer_id,
  customer_phone = excluded.customer_phone,
  status = excluded.status,
  payload = public.orders.payload || excluded.payload,
  updated_at = now();

-- =========================================================
-- 3) Legacy staff, delivery agents, and branches
-- No fixed named employee, delivery-agent, or branch records were
-- present in the repository source. Their arrays started empty and
-- were populated only through localStorage forms at runtime.
-- Therefore no fabricated staff records are inserted here.
-- =========================================================

commit;

-- Optional verification
select phone, name, country, address
from public.customers
where phone in (
  '905378240430',
  '9647772279773',
  '9647774366640',
  '9647718303382'
)
order by phone;

select legacy_id, customer_phone, status, payload ->> 'price' as price
from public.orders
where legacy_id in (
  'MW-9014',
  'MW-8821-905378240430',
  'MW-5520',
  'MW-8821-9647772279773',
  'MW-3312'
)
order by legacy_id;
