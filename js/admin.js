import { supabase } from './supabase-client.js';

const state = { customers: [], orders: [], staff: [], branches: [], currencies: [], stores: [], settings: {}, content: [] };
const $ = id => document.getElementById(id);
const text = value => String(value ?? '').trim();
const nullable = value => text(value) || null;
const esc = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notify = message => { console.info('[Admin]', message); };

async function query(promise, label) {
  const { data, error } = await promise;
  if (error) { console.error(`[Admin:${label}]`, error); throw new Error(error.message || `فشلت عملية ${label}`); }
  return data ?? [];
}

window.showSection = function showSection(id) {
  document.querySelectorAll('.card').forEach(card => card.classList.remove('active-section'));
  $(id)?.classList.add('active-section');
};

async function loadAll() {
  const [customers, orders, staff, branches, currencies, stores, settings, content] = await Promise.all([
    query(supabase.from('customers').select('*').order('created_at', { ascending: false }), 'تحميل العملاء'),
    query(supabase.from('orders').select('*, customers(name,phone,address)').order('created_at', { ascending: false }), 'تحميل الطلبات'),
    query(supabase.from('staff').select('*').order('created_at', { ascending: false }), 'تحميل الموظفين'),
    query(supabase.from('branches').select('*').order('created_at', { ascending: false }), 'تحميل الفروع'),
    query(supabase.from('currencies').select('*').order('name'), 'تحميل العملات'),
    query(supabase.from('stores').select('*').order('created_at', { ascending: false }), 'تحميل المتاجر'),
    query(supabase.from('app_settings').select('*'), 'تحميل الإعدادات'),
    query(supabase.from('content_blocks').select('*').order('key'), 'تحميل المحتوى'),
  ]);
  Object.assign(state, { customers, orders, staff, branches, currencies, stores, content });
  state.settings = Object.fromEntries(settings.map(row => [row.key, row.value]));
  renderAll();
}

function renderAll() {
  loadCustomers(); loadAdminOrders(); loadEmployees(); loadDelivery(); loadCurrencies(); loadStoresAdmin();
  loadPricingSettings(); loadWhatsappSettings(); loadBaseCurrency(); loadContentSettings();
}

window.loadCustomers = function loadCustomers() {
  const body = $('customersTableBody') || $('customerTableBody');
  if (!body) return;
  const eligibleOnly = $('customerFilterSelect')?.value === 'eligible';
  const rows = state.customers.filter(c => !eligibleOnly || Number(c.balance || 0) > 0);
  body.innerHTML = rows.map((c, index) => `<tr>
    <td>${esc(c.customer_code || c.payload?.code || '')}</td><td>${esc(c.name)}</td><td>${esc(c.phone)}</td>
    <td>${esc(c.country)}</td><td>${esc(c.address)}</td><td>${esc(c.status || 'active')}</td>
    <td><button class="btn-blue" onclick="editCustomerCloud('${c.id}')">تعديل</button> <button class="btn-red" onclick="deleteCustomerCloud('${c.id}')">حذف</button></td>
  </tr>`).join('') || '<tr><td colspan="7">لا توجد بيانات</td></tr>';
};

window.saveCustomerData = async function saveCustomerData() {
  const id = nullable($('editCustomerId')?.value || $('editCustomerIndex')?.dataset?.customerId);
  const payload = {
    p_customer_id: id,
    p_name: text($('custName')?.value), p_phone: text($('custPhone')?.value),
    p_password: text($('custPass')?.value), p_customer_code: text($('custCode')?.value),
    p_email: nullable($('custEmail')?.value), p_country: nullable($('custCountry')?.value),
    p_address: nullable($('custAddress')?.value), p_state: nullable($('custState')?.value),
  };
  if (!payload.p_name || !payload.p_phone) return alert('الاسم والهاتف مطلوبان.');
  await query(supabase.rpc('admin_upsert_customer_account_v2', payload), 'حفظ العميل');
  resetCustomerForm(); await loadAll(); alert('تم حفظ العميل على Supabase.');
};

window.editCustomerCloud = function editCustomerCloud(id) {
  const c = state.customers.find(x => x.id === id); if (!c) return;
  let hidden = $('editCustomerId');
  if (!hidden) { hidden = document.createElement('input'); hidden.type='hidden'; hidden.id='editCustomerId'; document.body.appendChild(hidden); }
  hidden.value = id;
  [['custName',c.name],['custPhone',c.phone],['custCode',c.customer_code||c.payload?.code],['custEmail',c.email],['custCountry',c.country],['custAddress',c.address],['custState',c.payload?.state]].forEach(([id2,v])=>{if($(id2)) $(id2).value=v??'';});
  showSection('customers');
};
window.deleteCustomerCloud = async id => { if(confirm('حذف العميل نهائياً؟')) { await query(supabase.from('customers').delete().eq('id',id), 'حذف العميل'); await loadAll(); } };
window.resetCustomerForm = function resetCustomerForm(){ ['custName','custPhone','custCode','custEmail','custPass','custCountry','custAddress','custState'].forEach(id=>{if($(id)) $(id).value='';}); if($('editCustomerId')) $('editCustomerId').value=''; };

window.loadAdminOrders = function loadAdminOrders() {
  const body = $('adminOrdersTableBody'); if (!body) return;
  body.innerHTML = state.orders.map(o => `<tr><td>${esc(o.legacy_id||o.id)}</td><td>${esc(o.customers?.name||o.payload?.customerName)}</td><td>${esc(o.customer_phone||o.customers?.phone)}</td><td>${esc(o.customers?.address||o.payload?.address)}</td><td>${esc(o.payload?.details||o.payload?.productName||'')}</td><td>${esc(o.payload?.price||'')}</td><td>${esc(o.status)}</td><td><select onchange="updateOrderStatusCloud('${o.id}',this.value)"><option>${esc(o.status)}</option><option>new</option><option>processing</option><option>shipped</option><option>delivered</option><option>cancelled</option></select></td></tr>`).join('') || '<tr><td colspan="8">لا توجد طلبات</td></tr>';
};
window.updateOrderStatusCloud = async (id,status) => { await query(supabase.from('orders').update({status,updated_at:new Date().toISOString()}).eq('id',id), 'تحديث الطلب'); await loadAll(); };
window.updateOrderStatus = (customerIndex,orderIndex,status) => { const order=state.orders[orderIndex]; if(order) return updateOrderStatusCloud(order.id,status); };

function renderStaff(role, bodyId) { const body=$(bodyId); if(!body)return; body.innerHTML=state.staff.filter(x=>x.role===role).map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.phone)}</td><td>••••••</td><td><button class="btn-red" onclick="deleteStaffCloud('${x.id}')">حذف</button></td></tr>`).join('')||'<tr><td colspan="4">لا توجد بيانات</td></tr>'; }
window.loadEmployees=()=>renderStaff('employee','empTableBody'); window.loadDelivery=()=>renderStaff('delivery','delTableBody');
async function addStaff(role,nameId,phoneId,passId){const name=text($(nameId)?.value),phone=text($(phoneId)?.value),password=text($(passId)?.value);if(!name||!phone)return alert('الاسم والهاتف مطلوبان');await query(supabase.from('staff').insert({role,name,phone,status:'active',payload:{temporary_password:password||null}}),'إضافة الحساب'); await loadAll();}
window.addEmployee=()=>addStaff('employee','empName','empPhone','empPass'); window.addDelivery=()=>addStaff('delivery','delName','delPhone','delPass');
window.deleteStaffCloud=async id=>{if(confirm('حذف الحساب؟')){await query(supabase.from('staff').delete().eq('id',id),'حذف الحساب');await loadAll();}};
window.deleteEmployee=i=>{const x=state.staff.filter(s=>s.role==='employee')[i];if(x)return deleteStaffCloud(x.id)}; window.deleteDelivery=i=>{const x=state.staff.filter(s=>s.role==='delivery')[i];if(x)return deleteStaffCloud(x.id)};

window.loadCurrencies=function(){const b=$('currencyTableBody');if(!b)return;b.innerHTML=state.currencies.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.rate)}</td><td><button class="btn-red" onclick="deleteCurrencyCloud('${c.id}')">حذف</button></td></tr>`).join('')||'<tr><td colspan="3">لا توجد عملات</td></tr>';};
window.addCurrency=async()=>{const name=text($('currencyName')?.value),rate=Number($('currencyRate')?.value);if(!name||!Number.isFinite(rate))return alert('أدخل العملة والسعر');await query(supabase.from('currencies').upsert({name,rate},{onConflict:'name'}),'حفظ العملة');await loadAll();};
window.deleteCurrencyCloud=async id=>{await query(supabase.from('currencies').delete().eq('id',id),'حذف العملة');await loadAll();}; window.deleteCurrency=i=>{const x=state.currencies[i];if(x)return deleteCurrencyCloud(x.id)};
window.loadBaseCurrency=()=>{const v=state.settings.baseCurrency||'دولار';if($('baseCurrency'))$('baseCurrency').value=typeof v==='string'?v:v.value||'دولار';if($('displayBaseCurrency'))$('displayBaseCurrency').textContent=typeof v==='string'?v:v.value||'دولار';};
window.saveBaseCurrency=async()=>{await saveSetting('baseCurrency',text($('baseCurrency')?.value));await loadAll();};

window.loadStoresAdmin=function(){const b=$('storesTableBody');if(!b)return;b.innerHTML=state.stores.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.category)}</td><td><a href="${esc(s.url)}" target="_blank">فتح</a></td><td><button class="btn-red" onclick="deleteStoreCloud('${s.id}')">حذف</button></td></tr>`).join('')||'<tr><td colspan="4">لا توجد متاجر</td></tr>';};
window.addStore=async()=>{const row={name:text($('storeName')?.value),url:text($('storeUrl')?.value),image_path:nullable($('storeImg')?.value),category:text($('storeCategory')?.value)||'comprehensive'};if(!row.name||!row.url)return alert('الاسم والرابط مطلوبان');await query(supabase.from('stores').insert(row),'إضافة المتجر');await loadAll();};
window.deleteStoreCloud=async id=>{await query(supabase.from('stores').delete().eq('id',id),'حذف المتجر');await loadAll();}; window.deleteStore=i=>{const x=state.stores[i];if(x)return deleteStoreCloud(x.id)};

async function saveSetting(key,value){await query(supabase.from('app_settings').upsert({key,value},{onConflict:'key'}),`حفظ ${key}`);}
window.loadPricingSettings=()=>{const v=state.settings.pricing||{};if($('siteCommission'))$('siteCommission').value=v.siteCommission??'';if($('baseShippingFee'))$('baseShippingFee').value=v.baseShippingFee??'';};
window.savePricingSettings=async()=>{await saveSetting('pricing',{siteCommission:Number($('siteCommission')?.value||0),baseShippingFee:Number($('baseShippingFee')?.value||0)});alert('تم الحفظ على Supabase');};
window.loadWhatsappSettings=()=>{const v=state.settings.adminWhatsappPhone||'';if($('adminWhatsappPhone'))$('adminWhatsappPhone').value=v;if($('displayWhatsappPhone'))$('displayWhatsappPhone').textContent=v||'غير مسجل';};
window.saveWhatsappSettings=async()=>{await saveSetting('adminWhatsappPhone',text($('adminWhatsappPhone')?.value));await loadAll();};
window.loadContentSettings=function(){state.content.forEach(row=>{const el=$(row.key);if(el)el.value=typeof row.value==='string'?row.value:JSON.stringify(row.value);});};
window.saveContent=async(key,value)=>{await query(supabase.from('content_blocks').upsert({key,value},{onConflict:'key'}),'حفظ المحتوى');await loadAll();};
window.initDefaultCustomers=()=>{};

window.addEventListener('admin-template-ready',()=>loadAll().catch(e=>alert(e.message)),{once:true});
if(document.readyState!=='loading' && document.body.dataset.adminTemplateReady==='true') loadAll().catch(e=>alert(e.message));
