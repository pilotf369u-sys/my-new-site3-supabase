import { supabase } from './supabase-client.js';

const state = {
  customers: [], orders: [], staff: [], branches: [], currencies: [], stores: [], settings: {}, content: []
};
const $ = id => document.getElementById(id);
const text = value => String(value ?? '').trim();
const nullable = value => text(value) || null;
const esc = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function required(promise, label) {
  const { data, error } = await promise;
  if (error) {
    console.error(`[Admin:${label}]`, error);
    throw new Error(error.message || `فشلت عملية ${label}`);
  }
  return data ?? [];
}

async function optional(promise, label, tableName) {
  const { data, error } = await promise;
  if (!error) return data ?? [];
  const message = String(error.message || '');
  if (error.code === 'PGRST205' || message.includes(`public.${tableName}`) || message.includes(`'public.${tableName}'`)) {
    console.warn(`[Admin:${label}] الجدول الاختياري غير موجود: ${tableName}`);
    return [];
  }
  console.error(`[Admin:${label}]`, error);
  return [];
}

window.showSection = function showSection(id) {
  document.querySelectorAll('.card').forEach(card => card.classList.remove('active-section'));
  $(id)?.classList.add('active-section');
  if (id === 'customers') renderCustomersTable();
};

async function loadAll() {
  const [customers, orders, staff, branches, currencies, stores, settings, content] = await Promise.all([
    required(supabase.from('customers').select('*').order('created_at', { ascending: false }), 'تحميل العملاء'),
    required(supabase.from('orders').select('*, customers(name,phone,address)').order('created_at', { ascending: false }), 'تحميل الطلبات'),
    required(supabase.from('staff').select('*').order('created_at', { ascending: false }), 'تحميل الموظفين'),
    required(supabase.from('branches').select('*').order('created_at', { ascending: false }), 'تحميل الفروع'),
    required(supabase.from('currencies').select('*').order('name'), 'تحميل العملات'),
    optional(supabase.from('stores').select('*').order('created_at', { ascending: false }), 'تحميل المتاجر', 'stores'),
    required(supabase.from('app_settings').select('*'), 'تحميل الإعدادات'),
    optional(supabase.from('content_blocks').select('*').order('key'), 'تحميل المحتوى', 'content_blocks')
  ]);

  state.customers = Array.isArray(customers) ? customers : [];
  state.orders = Array.isArray(orders) ? orders : [];
  state.staff = Array.isArray(staff) ? staff : [];
  state.branches = Array.isArray(branches) ? branches : [];
  state.currencies = Array.isArray(currencies) ? currencies : [];
  state.stores = Array.isArray(stores) ? stores : [];
  state.content = Array.isArray(content) ? content : [];
  state.settings = Object.fromEntries((settings || []).map(row => [row.key, row.value]));

  renderAll();
}

function renderAll() {
  renderCustomersTable();
  loadAdminOrders();
  loadEmployees();
  loadDelivery();
  loadCurrencies();
  loadStoresAdmin();
  loadPricingSettings();
  loadWhatsappSettings();
  loadBaseCurrency();
  loadContentSettings();
}

function renderCustomersTable() {
  const body = $('custTableBody');
  if (!body) {
    console.error('[Admin:customers] لم يتم العثور على custTableBody');
    return;
  }
  const rows = state.customers;
  console.info('[Admin:customers] rendering', rows.length, 'customers');
  body.innerHTML = rows.map(c => {
    const code = c.customer_code || c.payload?.code || '';
    const region = [c.country, c.payload?.state].filter(Boolean).join(' / ');
    const completed = Number(c.payload?.completedOrders ?? c.payload?.completed_orders ?? 0);
    const rewards = Array.isArray(c.payload?.rewardsLog) ? c.payload.rewardsLog.length : 0;
    return `<tr>
      <td>${esc(code)}</td>
      <td>${esc(c.name)}</td>
      <td dir="ltr">${esc(c.phone)}</td>
      <td>${esc(region)}</td>
      <td>${esc(c.address)}</td>
      <td>${completed}</td>
      <td>${Number(c.balance || 0) > 0 ? 'مستحق' : 'غير مستحق'}</td>
      <td><button class="btn-green" type="button" disabled>منح المكافأة</button></td>
      <td>${Number(c.payload?.usageCount || 0)}</td>
      <td>${rewards ? `${rewards} سجل` : 'لا يوجد'}</td>
      <td><button class="btn-blue" type="button" onclick="editCustomerCloud('${c.id}')">تعديل</button> <button class="btn-red" type="button" onclick="deleteCustomerCloud('${c.id}')">حذف</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="11">لا توجد بيانات عملاء.</td></tr>';
}

window.loadCustomers = async function loadCustomers() {
  const customers = await required(supabase.from('customers').select('*').order('created_at', { ascending: false }), 'تحميل العملاء');
  state.customers = Array.isArray(customers) ? customers : [];
  renderCustomersTable();
};

function ensureEditId() {
  let hidden = $('editCustomerId');
  if (!hidden) {
    hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.id = 'editCustomerId';
    document.body.appendChild(hidden);
  }
  return hidden;
}

function setCustomerEditMode(c) {
  ensureEditId().value = c.id;
  const values = {
    custName: c.name,
    custPhone: c.phone,
    custCode: c.customer_code || c.payload?.code,
    custEmail: c.email,
    custCountry: c.country,
    custAddress: c.address,
    custState: c.payload?.state,
    custPass: ''
  };
  Object.entries(values).forEach(([id, value]) => { if ($(id)) $(id).value = value ?? ''; });
  if ($('customerFormTitle')) $('customerFormTitle').textContent = 'تعديل بيانات العميل الموجود';
  if ($('saveCustomerBtn')) $('saveCustomerBtn').textContent = 'حفظ تعديلات العميل';
  if ($('cancelEditBtn')) $('cancelEditBtn').style.display = 'inline-block';
  window.showSection('customers');
}

window.editCustomerCloud = function editCustomerCloud(id) {
  const customer = state.customers.find(item => item.id === id);
  if (customer) setCustomerEditMode(customer);
};

window.resetCustomerForm = function resetCustomerForm() {
  ['custName','custPhone','custCode','custEmail','custPass','custCountry','custAddress','custState']
    .forEach(id => { if ($(id)) $(id).value = ''; });
  ensureEditId().value = '';
  if ($('customerFormTitle')) $('customerFormTitle').textContent = 'إضافة عميل جديد';
  if ($('saveCustomerBtn')) $('saveCustomerBtn').textContent = '+ حفظ وإضافة العميل';
  if ($('cancelEditBtn')) $('cancelEditBtn').style.display = 'none';
};

window.saveCustomerData = async function saveCustomerData() {
  const phone = text($('custPhone')?.value).replace(/\D/g, '');
  const name = text($('custName')?.value);
  if (!name || !phone) return alert('الاسم والهاتف مطلوبان.');

  await window.loadCustomers();
  const editId = text(ensureEditId().value);
  const duplicate = state.customers.find(c => text(c.phone).replace(/\D/g, '') === phone);
  if (!editId && duplicate) {
    setCustomerEditMode(duplicate);
    alert('هذا الرقم مسجل مسبقاً. تم فتح بيانات العميل للتعديل.');
    return;
  }

  const payload = {
    p_customer_id: editId || null,
    p_name: name,
    p_phone: phone,
    p_password: text($('custPass')?.value),
    p_customer_code: text($('custCode')?.value),
    p_email: nullable($('custEmail')?.value),
    p_country: nullable($('custCountry')?.value),
    p_address: nullable($('custAddress')?.value),
    p_state: nullable($('custState')?.value)
  };

  const { error } = await supabase.rpc('admin_upsert_customer_account_v2', payload);
  if (error) return alert(error.message || 'تعذر حفظ العميل.');
  window.resetCustomerForm();
  await window.loadCustomers();
  alert(editId ? 'تم تحديث بيانات العميل.' : 'تمت إضافة العميل.');
};

window.deleteCustomerCloud = async function deleteCustomerCloud(id) {
  if (!confirm('هل تريد حذف هذا العميل نهائياً؟')) return;
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) return alert(error.message || 'تعذر حذف العميل.');
  await window.loadCustomers();
};

window.loadAdminOrders = function loadAdminOrders() {
  const body = $('adminOrdersTableBody'); if (!body) return;
  body.innerHTML = state.orders.map(o => `<tr><td>${esc(o.legacy_id || o.id)}</td><td>${esc(o.customers?.name || o.payload?.customerName)}</td><td>${esc(o.customer_phone || o.customers?.phone)}</td><td>${esc(o.customers?.address || o.payload?.address)}</td><td>${esc(o.payload?.details || o.payload?.productName || '')}</td><td>${esc(o.payload?.price || '')}</td><td>${esc(o.status)}</td><td><select onchange="updateOrderStatusCloud('${o.id}',this.value)"><option>${esc(o.status)}</option><option>new</option><option>processing</option><option>shipped</option><option>delivered</option><option>cancelled</option></select></td></tr>`).join('') || '<tr><td colspan="8">لا توجد طلبات</td></tr>';
};
window.updateOrderStatusCloud = async (id, status) => { await required(supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id), 'تحديث الطلب'); await loadAll(); };
window.updateOrderStatus = (customerIndex, orderIndex, status) => { const order = state.orders[orderIndex]; if (order) return window.updateOrderStatusCloud(order.id, status); };

function renderStaff(role, bodyId) { const body = $(bodyId); if (!body) return; body.innerHTML = state.staff.filter(x => x.role === role).map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.phone)}</td><td>••••••</td><td><button class="btn-red" onclick="deleteStaffCloud('${x.id}')">حذف</button></td></tr>`).join('') || '<tr><td colspan="4">لا توجد بيانات</td></tr>'; }
window.loadEmployees = () => renderStaff('employee', 'empTableBody');
window.loadDelivery = () => renderStaff('delivery', 'delTableBody');
async function addStaff(role, nameId, phoneId, passId) { const name = text($(nameId)?.value), phone = text($(phoneId)?.value), password = text($(passId)?.value); if (!name || !phone) return alert('الاسم والهاتف مطلوبان'); await required(supabase.from('staff').insert({ role, name, phone, status: 'active', payload: { temporary_password: password || null } }), 'إضافة الحساب'); await loadAll(); }
window.addEmployee = () => addStaff('employee', 'empName', 'empPhone', 'empPass');
window.addDelivery = () => addStaff('delivery', 'delName', 'delPhone', 'delPass');
window.deleteStaffCloud = async id => { if (confirm('حذف الحساب؟')) { await required(supabase.from('staff').delete().eq('id', id), 'حذف الحساب'); await loadAll(); } };

window.loadCurrencies = function () { const body = $('currencyTableBody'); if (!body) return; body.innerHTML = state.currencies.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.rate)}</td><td><button class="btn-red" onclick="deleteCurrencyCloud('${c.id}')">حذف</button></td></tr>`).join('') || '<tr><td colspan="3">لا توجد عملات</td></tr>'; };
window.addCurrency = async () => { const name = text($('currencyName')?.value), rate = Number($('currencyRate')?.value); if (!name || !Number.isFinite(rate)) return alert('أدخل العملة والسعر'); await required(supabase.from('currencies').upsert({ name, rate }, { onConflict: 'name' }), 'حفظ العملة'); await loadAll(); };
window.deleteCurrencyCloud = async id => { await required(supabase.from('currencies').delete().eq('id', id), 'حذف العملة'); await loadAll(); };

window.loadStoresAdmin = function () { const body = $('storesTableBody'); if (!body) return; body.innerHTML = state.stores.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.category)}</td><td><a href="${esc(s.url)}" target="_blank">فتح</a></td><td><button class="btn-red" onclick="deleteStoreCloud('${s.id}')">حذف</button></td></tr>`).join('') || '<tr><td colspan="4">جدول المتاجر غير مُنشأ بعد.</td></tr>'; };
window.addStore = async () => { const row = { name: text($('storeName')?.value), url: text($('storeUrl')?.value), image_path: nullable($('storeImg')?.value), category: text($('storeCategory')?.value) || 'comprehensive' }; if (!row.name || !row.url) return alert('الاسم والرابط مطلوبان'); await required(supabase.from('stores').insert(row), 'إضافة المتجر'); await loadAll(); };
window.deleteStoreCloud = async id => { await required(supabase.from('stores').delete().eq('id', id), 'حذف المتجر'); await loadAll(); };

async function saveSetting(key, value) { await required(supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' }), `حفظ ${key}`); }
window.loadPricingSettings = () => { const value = state.settings.pricing || {}; if ($('siteCommission')) $('siteCommission').value = value.siteCommission ?? ''; if ($('baseShippingFee')) $('baseShippingFee').value = value.baseShippingFee ?? ''; };
window.savePricingSettings = async () => { await saveSetting('pricing', { siteCommission: Number($('siteCommission')?.value || 0), baseShippingFee: Number($('baseShippingFee')?.value || 0) }); alert('تم الحفظ على Supabase'); };
window.loadWhatsappSettings = () => { const value = state.settings.adminWhatsappPhone || ''; if ($('adminWhatsappPhone')) $('adminWhatsappPhone').value = value; if ($('displayWhatsappPhone')) $('displayWhatsappPhone').textContent = value || 'غير مسجل'; };
window.saveWhatsappSettings = async () => { await saveSetting('adminWhatsappPhone', text($('adminWhatsappPhone')?.value)); await loadAll(); };
window.loadBaseCurrency = () => { const value = state.settings.baseCurrency || 'دولار'; const shown = typeof value === 'string' ? value : value.value || 'دولار'; if ($('baseCurrency')) $('baseCurrency').value = shown; if ($('displayBaseCurrency')) $('displayBaseCurrency').textContent = shown; };
window.saveBaseCurrency = async () => { await saveSetting('baseCurrency', text($('baseCurrency')?.value)); await loadAll(); };
window.loadContentSettings = function () { state.content.forEach(row => { const element = $(row.key); if (element) element.value = typeof row.value === 'string' ? row.value : JSON.stringify(row.value); }); };
window.saveContent = async (key, value) => { await required(supabase.from('content_blocks').upsert({ key, value }, { onConflict: 'key' }), 'حفظ المحتوى'); await loadAll(); };
window.initDefaultCustomers = () => {};

function startAdmin() {
  loadAll().catch(error => {
    console.error('[Admin startup]', error);
    alert(error.message);
  });
}
window.addEventListener('admin-template-ready', startAdmin, { once: true });
if (document.body?.dataset?.adminTemplateReady === 'true') startAdmin();
