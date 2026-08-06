import { supabase } from './supabase-client.js';

const $ = id => document.getElementById(id);
const clean = value => String(value ?? '').trim();
const nullable = value => clean(value) || null;
let customers = [], orders = [], messages = [], rewards = [];

function status(message, error = false) {
  $('status').textContent = message;
  $('status').style.color = error ? '#b42318' : '#155eef';
}
function fmt(value) { return value ? new Date(value).toLocaleString('ar') : ''; }
function customerName(id) { return customers.find(c => c.id === id)?.name || id || ''; }

async function assertAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { location.replace('login.html'); throw new Error('يجب تسجيل الدخول'); }
  const { data, error } = await supabase.rpc('is_staff');
  if (error || !data) { location.replace('login.html'); throw new Error('الحساب لا يملك صلاحية الإدارة'); }
}

async function loadAll() {
  status('جاري تحميل البيانات من Supabase...');
  const [c, o, m, r] = await Promise.all([
    supabase.from('customers').select('*').order('created_at', { ascending: false }),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('messages').select('*').order('created_at', { ascending: true }),
    supabase.from('rewards').select('*').order('created_at', { ascending: false }),
  ]);
  for (const result of [c, o, m, r]) if (result.error) throw result.error;
  customers = c.data || []; orders = o.data || []; messages = m.data || []; rewards = r.data || [];
  renderAll(); status(`تم تحميل ${customers.length} عميل و${orders.length} طلب من Supabase.`);
}

function renderAll() {
  $('customersBody').innerHTML = customers.map(c => `<tr><td>${c.customer_code || c.payload?.code || ''}</td><td>${c.name || ''}</td><td>${c.phone || ''}</td><td>${c.country || ''}</td><td>${c.address || ''}</td><td><button data-edit="${c.id}">تعديل</button> <button class="danger" data-delete="${c.id}">حذف</button></td></tr>`).join('') || '<tr><td colspan="6">لا يوجد عملاء.</td></tr>';
  $('ordersBody').innerHTML = orders.map(o => `<tr><td>${o.legacy_id || o.id}</td><td>${customerName(o.customer_id)}</td><td>${o.customer_phone || ''}</td><td>${o.status || ''}</td><td>${fmt(o.created_at)}</td><td><select data-order-status="${o.id}">${['new','processing','ready','shipped','delivered','cancelled','cancelled_by_customer'].map(s => `<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="6">لا توجد طلبات.</td></tr>';
  const options = customers.map(c => `<option value="${c.id}">${c.name || c.phone}</option>`).join('');
  $('messageCustomer').innerHTML = '<option value="">اختر العميل</option>' + options;
  $('rewardCustomer').innerHTML = '<option value="">اختر العميل</option>' + options;
  $('messageOrder').innerHTML = '<option value="">بدون طلب محدد</option>' + orders.map(o => `<option value="${o.id}">${o.legacy_id || o.id} — ${customerName(o.customer_id)}</option>`).join('');
  $('messagesList').innerHTML = messages.map(m => `<p><b>${customerName(m.customer_id)}</b> — ${m.sender}: ${m.body} <span class="muted">${fmt(m.created_at)}</span></p>`).join('') || '<p>لا توجد رسائل.</p>';
  $('rewardsBody').innerHTML = rewards.map(r => `<tr><td>${customerName(r.customer_id)}</td><td>${Number(r.amount || 0).toFixed(2)}</td><td>${r.note || ''}</td><td>${fmt(r.created_at)}</td></tr>`).join('') || '<tr><td colspan="4">لا توجد مكافآت.</td></tr>';
}

function resetCustomerForm() {
  ['customerId','name','phone','password','code','email','country','address'].forEach(id => $(id).value = '');
}

$('customerForm').addEventListener('submit', async event => {
  event.preventDefault();
  const id = nullable($('customerId').value);
  const payload = {
    p_customer_id: id,
    p_name: clean($('name').value),
    p_phone: clean($('phone').value),
    p_password: clean($('password').value),
    p_customer_code: clean($('code').value),
    p_email: nullable($('email').value),
    p_country: nullable($('country').value),
    p_address: nullable($('address').value),
    p_state: null,
  };
  const { error } = await supabase.rpc('admin_upsert_customer_account_v2', payload);
  if (error) return status(error.message, true);
  resetCustomerForm(); await loadAll();
});

$('customersBody').addEventListener('click', async event => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) {
    const c = customers.find(x => x.id === editId); if (!c) return;
    $('customerId').value = c.id; $('name').value = c.name || ''; $('phone').value = c.phone || ''; $('code').value = c.customer_code || c.payload?.code || ''; $('email').value = c.email || ''; $('country').value = c.country || ''; $('address').value = c.address || ''; $('password').value = '';
  }
  if (deleteId && confirm('حذف العميل وبياناته المرتبطة؟')) {
    const { error } = await supabase.from('customers').delete().eq('id', deleteId);
    if (error) return status(error.message, true); await loadAll();
  }
});

$('ordersBody').addEventListener('change', async event => {
  const id = event.target.dataset.orderStatus; if (!id) return;
  const { error } = await supabase.from('orders').update({ status: event.target.value, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return status(error.message, true); await loadAll();
});

$('messageForm').addEventListener('submit', async event => {
  event.preventDefault();
  const { error } = await supabase.from('messages').insert({ customer_id: $('messageCustomer').value, order_id: nullable($('messageOrder').value), sender: 'staff', body: clean($('messageBody').value) });
  if (error) return status(error.message, true); $('messageBody').value = ''; await loadAll();
});

$('rewardForm').addEventListener('submit', async event => {
  event.preventDefault();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('rewards').insert({ customer_id: $('rewardCustomer').value, amount: Number($('rewardAmount').value || 0), note: nullable($('rewardNote').value), granted_by: user?.id || null });
  if (error) return status(error.message, true); $('rewardAmount').value = ''; $('rewardNote').value = ''; await loadAll();
});

$('cancelEdit').onclick = resetCustomerForm;
$('refreshBtn').onclick = () => loadAll().catch(e => status(e.message, true));
$('logoutBtn').onclick = async () => { await supabase.auth.signOut(); localStorage.removeItem('customerPortalToken'); location.replace('login.html'); };
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => {
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
  button.classList.add('active');
  ['customers','orders','messages','rewards'].forEach(id => $(id).classList.toggle('hidden', id !== button.dataset.tab));
});

await assertAdmin();
await loadAll();
