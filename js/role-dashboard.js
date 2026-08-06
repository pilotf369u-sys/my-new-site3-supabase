import { supabase } from './supabase-client.js';
import { listOrders, orderAmount, orderBranch, orderDelivery, orderLabel, customerName, customerPhone, customerAddress, updateOrderStatus } from './operations-cloud.js';

const pageRole = document.body.dataset.role;
const title = document.getElementById('title');
const statusBox = document.getElementById('status');
const tbody = document.getElementById('ordersBody');
let actor = null;

async function getActor() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { location.replace('login.html'); return null; }
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (!profile) throw new Error('لا يوجد ملف صلاحيات لهذا الحساب.');
  return { ...profile, name: profile.full_name || profile.name || user.email || user.phone || '' };
}

function relevant(order) {
  if (pageRole === 'branch') return orderBranch(order) === actor.name;
  if (pageRole === 'delivery') return orderDelivery(order) === actor.name;
  return true;
}

async function load() {
  statusBox.textContent = 'جاري تحميل البيانات من Supabase...';
  try {
    actor ||= await getActor();
    if (!actor) return;
    title.textContent = `${pageRole === 'branch' ? 'لوحة الفرع' : pageRole === 'delivery' ? 'لوحة المندوب' : 'لوحة الموظف'} — ${actor.name}`;
    const rows = (await listOrders()).filter(relevant);
    tbody.innerHTML = rows.length ? rows.map(order => `
      <tr>
        <td>${orderLabel(order)}</td>
        <td>${customerName(order)}</td>
        <td dir="ltr">${customerPhone(order)}</td>
        <td>${customerAddress(order)}</td>
        <td>$${orderAmount(order).toFixed(2)}</td>
        <td>${orderBranch(order) || '---'}</td>
        <td>${orderDelivery(order) || '---'}</td>
        <td>
          <select data-id="${order.id}">
            ${['new','قيد المعالجة','جاهز للشحن','قيد الشحن','تم التسليم','ملغي'].map(s => `<option ${order.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>`).join('') : '<tr><td colspan="8">لا توجد طلبات متاحة.</td></tr>';
    tbody.querySelectorAll('select[data-id]').forEach(select => select.onchange = async () => {
      select.disabled = true;
      try { await updateOrderStatus(select.dataset.id, select.value); await load(); }
      catch (error) { alert(error.message); }
      finally { select.disabled = false; }
    });
    statusBox.textContent = `تم تحميل ${rows.length} طلب من السيرفر.`;
  } catch (error) {
    console.error(error);
    statusBox.textContent = error.message || 'تعذر تحميل البيانات.';
  }
}

document.getElementById('refreshBtn').onclick = load;
document.getElementById('logoutBtn').onclick = async () => { await supabase.auth.signOut(); localStorage.removeItem('customerPortalToken'); location.replace('login.html'); };
await load();
