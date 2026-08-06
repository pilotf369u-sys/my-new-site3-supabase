import { supabase } from './supabase-client.js';

const $ = id => document.getElementById(id);
const clean = value => String(value ?? '').trim();
const digits = value => clean(value).replace(/\D/g, '');
const esc = value => clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let customers = [];

async function fetchCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'تعذر تحميل العملاء.');
  customers = data || [];
  return customers;
}

function completedOrdersCount(customer) {
  const value = customer?.payload?.completedOrders ?? customer?.payload?.completed_orders ?? 0;
  return Number(value || 0);
}

function renderCustomers() {
  const body = $('custTableBody');
  if (!body) return;
  const eligibleOnly = $('customerFilterSelect')?.value === 'eligible';
  const rows = customers.filter(customer => !eligibleOnly || Number(customer.balance || 0) > 0);

  body.innerHTML = rows.map(customer => {
    const code = customer.customer_code || customer.payload?.code || '';
    const state = customer.payload?.state || '';
    const countryRegion = [customer.country, state].filter(Boolean).join(' / ');
    return `<tr>
      <td>${esc(code)}</td>
      <td>${esc(customer.name)}</td>
      <td dir="ltr">${esc(customer.phone)}</td>
      <td>${esc(countryRegion)}</td>
      <td>${esc(customer.address)}</td>
      <td>${completedOrdersCount(customer)}</td>
      <td>${Number(customer.balance || 0) > 0 ? 'مستحق' : 'غير مستحق'}</td>
      <td><button class="btn-green" type="button" disabled>منح المكافأة</button></td>
      <td>${Number(customer.payload?.usageCount || 0)}</td>
      <td>${esc(customer.payload?.rewardsLog?.length ? `${customer.payload.rewardsLog.length} سجل` : 'لا يوجد')}</td>
      <td>
        <button class="btn-blue" type="button" onclick="editCustomerCloud('${customer.id}')">تعديل</button>
        <button class="btn-red" type="button" onclick="deleteCustomerCloud('${customer.id}')">حذف</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="11">لا توجد بيانات عملاء.</td></tr>';
}

function setEditMode(customer) {
  let hidden = $('editCustomerId');
  if (!hidden) {
    hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.id = 'editCustomerId';
    document.body.appendChild(hidden);
  }
  hidden.value = customer.id;
  const values = {
    custName: customer.name,
    custPhone: customer.phone,
    custCode: customer.customer_code || customer.payload?.code,
    custEmail: customer.email,
    custCountry: customer.country,
    custAddress: customer.address,
    custState: customer.payload?.state,
    custPass: '',
  };
  Object.entries(values).forEach(([id, value]) => { if ($(id)) $(id).value = value ?? ''; });
  if ($('customerFormTitle')) $('customerFormTitle').textContent = 'تعديل بيانات العميل الموجود';
  if ($('saveCustomerBtn')) $('saveCustomerBtn').textContent = 'حفظ تعديلات العميل';
  if ($('cancelEditBtn')) $('cancelEditBtn').style.display = 'inline-block';
  window.showSection?.('customers');
  $('custName')?.focus();
}

window.loadCustomers = async function loadCustomers() {
  await fetchCustomers();
  renderCustomers();
};

window.editCustomerCloud = function editCustomerCloud(id) {
  const customer = customers.find(item => item.id === id);
  if (customer) setEditMode(customer);
};

window.resetCustomerForm = function resetCustomerForm() {
  ['custName','custPhone','custCode','custEmail','custPass','custCountry','custAddress','custState']
    .forEach(id => { if ($(id)) $(id).value = ''; });
  if ($('editCustomerId')) $('editCustomerId').value = '';
  if ($('customerFormTitle')) $('customerFormTitle').textContent = 'إضافة عميل جديد';
  if ($('saveCustomerBtn')) $('saveCustomerBtn').textContent = '+ حفظ وإضافة العميل';
  if ($('cancelEditBtn')) $('cancelEditBtn').style.display = 'none';
};

window.saveCustomerData = async function saveCustomerData() {
  const phone = digits($('custPhone')?.value);
  const name = clean($('custName')?.value);
  if (!name || !phone) return alert('الاسم والهاتف مطلوبان.');

  await fetchCustomers();
  const hiddenId = clean($('editCustomerId')?.value);
  const existing = customers.find(customer => digits(customer.phone) === phone);

  if (!hiddenId && existing) {
    setEditMode(existing);
    alert('هذا الرقم مسجل مسبقاً. تم فتح بيانات العميل في وضع التعديل. عدّل الحقول المطلوبة ثم اضغط حفظ تعديلات العميل.');
    return;
  }

  const payload = {
    p_customer_id: hiddenId || null,
    p_name: name,
    p_phone: phone,
    p_password: clean($('custPass')?.value),
    p_customer_code: clean($('custCode')?.value),
    p_email: clean($('custEmail')?.value) || null,
    p_country: clean($('custCountry')?.value) || null,
    p_address: clean($('custAddress')?.value) || null,
    p_state: clean($('custState')?.value) || null,
  };

  const { error } = await supabase.rpc('admin_upsert_customer_account_v2', payload);
  if (error) {
    if (error.code === '23505' || String(error.message).includes('customers_phone_key')) {
      await fetchCustomers();
      const duplicate = customers.find(customer => digits(customer.phone) === phone);
      if (duplicate) setEditMode(duplicate);
      alert('هذا الرقم مسجل مسبقاً، وتم تحويل النموذج إلى وضع التعديل.');
      return;
    }
    throw new Error(error.message || 'تعذر حفظ العميل.');
  }

  window.resetCustomerForm();
  await fetchCustomers();
  renderCustomers();
  alert(hiddenId ? 'تم تحديث بيانات العميل على Supabase.' : 'تمت إضافة العميل إلى Supabase.');
};

window.deleteCustomerCloud = async function deleteCustomerCloud(id) {
  if (!confirm('هل تريد حذف هذا العميل نهائياً؟')) return;
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) return alert(error.message || 'تعذر حذف العميل.');
  await fetchCustomers();
  renderCustomers();
};

window.addEventListener('admin-template-ready', () => {
  setTimeout(() => window.loadCustomers().catch(error => alert(error.message)), 0);
});
