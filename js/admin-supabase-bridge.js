import { supabase } from './supabase-client.js?v=20260805-26';

const digits = value => String(value ?? '').replace(/\D/g, '');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

let customers = [];
let orders = [];

function customerCode() {
  return `CUS-${Math.floor(1000 + Math.random() * 9000)}`;
}

function databaseId(customer) {
  return customer?.id || null;
}

function stateOf(customer) {
  return customer?.payload?.state || '';
}

function completedCount(customerId) {
  return orders.filter(order => order.customer_id === customerId && ['تم التسليم', 'تم التوصيل'].includes(order.status)).length;
}

async function loadCloudData() {
  const [customersResult, ordersResult] = await Promise.all([
    supabase.from('customers').select('*').order('created_at', { ascending: true }),
    supabase.from('orders').select('*').order('created_at', { ascending: true })
  ]);
  if (customersResult.error) throw customersResult.error;
  if (ordersResult.error) throw ordersResult.error;
  customers = customersResult.data || [];
  orders = ordersResult.data || [];
}

function renderCustomers() {
  const tbody = document.getElementById('custTableBody');
  if (!tbody) return;
  const filter = document.getElementById('customerFilterSelect')?.value || 'all';
  const rows = customers.map((customer, index) => {
    const completed = completedCount(customer.id);
    const eligible = completed >= 5;
    if (filter === 'eligible' && !eligible) return '';
    return `<tr>
      <td><b style="color:#2980b9">${escapeHtml(customer.customer_code || customer.payload?.code || '---')}</b></td>
      <td style="font-weight:bold">${escapeHtml(customer.name)}</td>
      <td dir="ltr">${escapeHtml(customer.phone)}</td>
      <td>${escapeHtml(customer.country || '---')} / ${escapeHtml(stateOf(customer) || '---')}</td>
      <td>${escapeHtml(customer.address || '---')}</td>
      <td><span style="background:#e1f5fe;color:#0288d1;padding:3px 8px;border-radius:4px;font-weight:bold">${completed} كلي</span></td>
      <td>${eligible ? '<span style="background:#27ae60;color:#fff;padding:4px 8px;border-radius:4px">مستحق ⭐</span>' : `<span style="background:#e0e0e0;padding:4px 8px;border-radius:4px">${completed} / 5 طلبات</span>`}</td>
      <td><input type="checkbox" style="width:20px;height:20px" disabled></td>
      <td><span style="background:#e8f8f5;color:#16a085;padding:4px 10px;border-radius:4px">0 مرة</span></td>
      <td><span style="color:#888">لا توجد مكافآت</span></td>
      <td>
        <button class="btn-green" onclick="loginAsCustomer(${index})">دخول</button>
        <button class="btn-blue" onclick="editCustomer(${index})">تعديل</button>
        <button class="btn-red" onclick="deleteCustomer(${index})">حذف</button>
      </td>
    </tr>`;
  }).join('');
  tbody.innerHTML = rows || '<tr><td colspan="11">لا يوجد عملاء في Supabase</td></tr>';
}

function orderPrice(order) {
  return order.total_price ?? order.payload?.price ?? order.payload?.totalPrice ?? '$0.00';
}

function renderOrders() {
  const tbody = document.getElementById('adminOrdersTableBody');
  if (!tbody) return;
  const customerMap = new Map(customers.map(customer => [customer.id, customer]));
  tbody.innerHTML = orders.length ? orders.map((order, index) => {
    const customer = customerMap.get(order.customer_id) || {};
    const status = order.status || 'قيد المعالجة';
    return `<tr>
      <td><b style="color:#2980b9">${escapeHtml(order.legacy_id || order.payload?.id || order.id)}</b></td>
      <td style="font-weight:bold">${escapeHtml(customer.name || order.payload?.customerName || '---')}</td>
      <td dir="ltr">${escapeHtml(customer.phone || order.customer_phone || '---')}</td>
      <td>${escapeHtml(customer.address || order.payload?.address || '---')}</td>
      <td><button class="btn-details" onclick="openCloudOrderDetails(${index})">عرض تفاصيل الطلب</button></td>
      <td><span style="color:#27ae60;font-weight:bold">${escapeHtml(orderPrice(order))}</span></td>
      <td>${escapeHtml(status)}</td>
      <td><select onchange="updateCloudOrderStatus('${order.id}', this.value)">
        <option value="قيد المعالجة" ${status === 'قيد المعالجة' ? 'selected' : ''}>قيد المعالجة</option>
        <option value="جاهز للشحن" ${status === 'جاهز للشحن' ? 'selected' : ''}>جاهز للشحن</option>
        <option value="تم التسليم" ${status === 'تم التسليم' ? 'selected' : ''}>تم التسليم</option>
        <option value="لم يتم الاتفاق - ملغي" ${status.includes('ملغي') ? 'selected' : ''}>لم يتم الاتفاق - ملغي</option>
      </select></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8">لا توجد طلبات في Supabase</td></tr>';
}

function resetCustomerForm() {
  const ids = ['custName','custCode','custEmail','custPass','custPhone','custState','custAddress'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const country = document.getElementById('custCountry');
  if (country) country.value = '';
  const edit = document.getElementById('editCustomerIndex');
  if (edit) edit.value = '-1';
  const title = document.getElementById('customerFormTitle');
  if (title) title.textContent = 'إضافة عميل جديد';
  const save = document.getElementById('saveCustomerBtn');
  if (save) save.textContent = '+ حفظ وإضافة العميل';
  const cancel = document.getElementById('cancelEditBtn');
  if (cancel) cancel.style.display = 'none';
}

async function saveCustomerData() {
  const editIndex = Number.parseInt(document.getElementById('editCustomerIndex')?.value || '-1', 10);
  const existing = editIndex >= 0 ? customers[editIndex] : null;
  const name = document.getElementById('custName')?.value.trim() || '';
  const code = document.getElementById('custCode')?.value.trim() || existing?.customer_code || existing?.payload?.code || customerCode();
  const email = document.getElementById('custEmail')?.value.trim() || '';
  const password = document.getElementById('custPass')?.value || '';
  const country = document.getElementById('custCountry')?.value || '';
  const phone = digits(document.getElementById('custPhone')?.value);
  const state = document.getElementById('custState')?.value.trim() || '';
  const address = document.getElementById('custAddress')?.value.trim() || '';

  if (!name || !country || !phone || !address) return alert('أدخل الاسم والدولة والهاتف والعنوان.');
  if (!existing && password.length < 4) return alert('كلمة المرور يجب أن تكون 4 خانات على الأقل.');
  if (existing && password && password.length < 4) return alert('كلمة المرور الجديدة يجب أن تكون 4 خانات على الأقل.');

  const button = document.getElementById('saveCustomerBtn');
  if (button) button.disabled = true;
  try {
    const { error } = await supabase.rpc('admin_upsert_customer_account_v2', {
      p_customer_id: databaseId(existing),
      p_name: name,
      p_phone: phone,
      p_password: password,
      p_customer_code: code,
      p_email: email || null,
      p_country: country || null,
      p_address: address || null,
      p_state: state || null
    });
    if (error) throw error;
    await loadCloudData();
    resetCustomerForm();
    renderCustomers();
    renderOrders();
    alert(existing ? 'تم تحديث العميل في Supabase.' : 'تم إنشاء العميل في Supabase ويمكنه تسجيل الدخول بنفس الرقم وكلمة المرور.');
  } catch (error) {
    console.error('[Admin customer save]', error);
    alert(error.message || 'تعذر حفظ العميل في Supabase.');
  } finally {
    if (button) button.disabled = false;
  }
}

function editCustomer(index) {
  const customer = customers[index];
  if (!customer) return;
  document.getElementById('editCustomerIndex').value = String(index);
  document.getElementById('custName').value = customer.name || '';
  document.getElementById('custCode').value = customer.customer_code || customer.payload?.code || '';
  document.getElementById('custEmail').value = customer.email || '';
  document.getElementById('custPass').value = '';
  document.getElementById('custCountry').value = customer.country || '';
  document.getElementById('custPhone').value = customer.phone || '';
  document.getElementById('custState').value = stateOf(customer);
  document.getElementById('custAddress').value = customer.address || '';
  document.getElementById('customerFormTitle').textContent = `تعديل بيانات العميل: ${customer.name || ''}`;
  document.getElementById('saveCustomerBtn').textContent = 'حفظ التعديلات';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';
}

async function deleteCustomer(index) {
  const customer = customers[index];
  if (!customer || !confirm(`هل تريد حذف العميل ${customer.name || ''}؟`)) return;
  const { error } = await supabase.from('customers').delete().eq('id', customer.id);
  if (error) return alert(error.message);
  await loadCloudData();
  renderCustomers();
  renderOrders();
}

function loginAsCustomer(index) {
  const customer = customers[index];
  if (!customer) return;
  sessionStorage.setItem('selectedCustomerPhone', digits(customer.phone));
  sessionStorage.setItem('openedByAdmin', 'true');
  location.href = `dashboard.html?phone=${encodeURIComponent(digits(customer.phone))}&view=admin`;
}

async function updateCloudOrderStatus(id, status) {
  const { error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return alert(error.message);
  await loadCloudData();
  renderOrders();
  renderCustomers();
}

function openCloudOrderDetails(index) {
  const order = orders[index];
  if (!order) return;
  const modal = document.getElementById('orderDetailsModal');
  const body = document.getElementById('modalOrderDetailsBody');
  if (!modal || !body) return;
  body.innerHTML = `<pre style="white-space:pre-wrap;direction:ltr;text-align:left">${escapeHtml(JSON.stringify(order.payload || order, null, 2))}</pre>`;
  modal.style.display = 'flex';
}

function cleanCountryLabels() {
  const select = document.getElementById('custCountry');
  if (!select) return;
  [...select.options].forEach(option => {
    option.textContent = option.textContent.replace(/\+/g, '');
    if (option.dataset.code) option.dataset.code = option.dataset.code.replace('+', '');
  });
}

async function install() {
  cleanCountryLabels();
  window.initDefaultCustomers = () => {};
  window.loadCustomers = renderCustomers;
  window.loadAdminOrders = renderOrders;
  window.saveCustomerData = saveCustomerData;
  window.editCustomer = editCustomer;
  window.deleteCustomer = deleteCustomer;
  window.loginAsCustomer = loginAsCustomer;
  window.resetCustomerForm = resetCustomerForm;
  window.updateCloudOrderStatus = updateCloudOrderStatus;
  window.openCloudOrderDetails = openCloudOrderDetails;
  window.updateCountryCode = () => {};

  try {
    await loadCloudData();
    renderCustomers();
    renderOrders();
  } catch (error) {
    console.error('[Admin Supabase bridge]', error);
    alert(`تعذر تحميل العملاء أو الطلبات من Supabase: ${error.message}`);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
