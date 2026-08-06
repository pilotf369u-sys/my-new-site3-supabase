import { supabase } from './supabase-client.js';

const $ = id => document.getElementById(id);
const clean = value => String(value ?? '').trim();
const digits = value => clean(value).replace(/\D/g, '');
const esc = value => clean(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function orderBelongsToCustomer(order, customer) {
  if (order.customer_id && order.customer_id === customer.id) return true;
  const orderPhone = digits(order.customer_phone || order.payload?.customerPhone || order.payload?.phone);
  return Boolean(orderPhone && orderPhone === digits(customer.phone));
}

function isCompleted(order) {
  return ['delivered', 'completed', 'تم التسليم', 'مكتمل'].includes(clean(order.status).toLowerCase());
}

function orderLabel(order) {
  return clean(order.legacy_id || order.order_number || order.id).slice(0, 18);
}

async function loadCustomerRows() {
  const body = $('custTableBody');
  if (!body) return;

  const [customersResult, ordersResult] = await Promise.all([
    supabase.from('customers').select('*').order('created_at', { ascending: false }),
    supabase.from('orders').select('*').order('created_at', { ascending: false })
  ]);

  if (customersResult.error) {
    console.error('[Admin customer portal] customers', customersResult.error);
    return;
  }

  const customers = customersResult.data || [];
  const orders = ordersResult.error ? [] : (ordersResult.data || []);

  body.innerHTML = customers.map(customer => {
    const customerOrders = orders.filter(order => orderBelongsToCustomer(order, customer));
    const completed = customerOrders.filter(isCompleted).length;
    const recent = customerOrders.slice(0, 3);
    const code = customer.customer_code || customer.payload?.code || '';
    const region = [customer.country, customer.payload?.state].filter(Boolean).join(' / ');
    const rewards = Array.isArray(customer.payload?.rewardsLog) ? customer.payload.rewardsLog.length : 0;
    const summary = customerOrders.length
      ? `<details><summary>${customerOrders.length} طلب</summary>${recent.map(order => `<div style="font-size:12px;margin-top:4px">${esc(orderLabel(order))} — ${esc(order.status || '')}</div>`).join('')}</details>`
      : 'لا توجد طلبات';

    return `<tr>
      <td>${esc(code)}</td>
      <td>${esc(customer.name)}</td>
      <td dir="ltr">${esc(customer.phone)}</td>
      <td>${esc(region)}</td>
      <td>${esc(customer.address)}</td>
      <td>${completed}<div style="margin-top:5px">${summary}</div></td>
      <td>${Number(customer.balance || 0) > 0 ? 'مستحق' : 'غير مستحق'}</td>
      <td><button class="btn-green" type="button" disabled>منح المكافأة</button></td>
      <td>${Number(customer.payload?.usageCount || 0)}</td>
      <td>${rewards ? `${rewards} سجل` : 'لا يوجد'}</td>
      <td>
        <button class="btn-login" type="button" onclick="openCustomerPortal('${customer.id}')">دخول</button>
        <button class="btn-blue" type="button" onclick="editCustomerCloud('${customer.id}')">تعديل</button>
        <button class="btn-red" type="button" onclick="deleteCustomerCloud('${customer.id}')">حذف</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="11">لا توجد بيانات عملاء.</td></tr>';
}

window.openCustomerPortal = function openCustomerPortal(customerId) {
  const url = new URL('dashboard.html', window.location.href);
  url.searchParams.set('preview_customer_id', customerId);
  window.open(url.href, '_blank', 'noopener');
};

function scheduleLoad() {
  [0, 400, 1200].forEach(delay => setTimeout(() => loadCustomerRows().catch(console.error), delay));
}

window.addEventListener('admin-template-ready', scheduleLoad);
if (document.body?.dataset?.adminTemplateReady === 'true') scheduleLoad();

const previousShowSection = window.showSection;
window.showSection = function patchedShowSection(id) {
  previousShowSection?.(id);
  if (id === 'customers') loadCustomerRows().catch(console.error);
};
