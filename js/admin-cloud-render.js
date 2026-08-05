(function(){
'use strict';
if(!location.pathname.endsWith('admin-dashboard.html')) return;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const digits=v=>String(v||'').replace(/\D/g,'');
const statusOptions=['قيد المعالجة','قيد المراجعة','قيد الشحن','تم التوصيل','تم التسليم','ملغي'];
let loadingPromise=null;

function mapCustomer(row){
  return {...(row.payload||{}),dbId:row.id,cloudId:row.id,id:row.id,
    customer_code:row.customer_code||row.payload?.code||'',code:row.customer_code||row.payload?.code||'',
    name:row.name||'',phone:row.phone||'',email:row.email||'',country:row.country||'',
    state:row.payload?.state||'',address:row.address||'',status:row.status||'active',
    balance:Number(row.balance||0),orders:[]};
}
function mapOrder(row){
  return {...(row.payload||{}),dbId:row.id,cloudId:row.id,
    id:row.legacy_id||row.payload?.id||row.id,status:row.status||row.payload?.status||'قيد المعالجة',
    price:row.payload?.price||'$0.00',createdAt:row.created_at,
    customer_id:row.customer_id,customer_phone:row.customer_phone};
}
function expose(customers){
  window.cloudAdminCustomers=customers;
  try{window.cloudStorage?.setItem('adminCustomersList',JSON.stringify(customers));}
  catch(e){console.warn('[Admin Cloud Render] cloudStorage sync failed',e);}
}
function renderCustomers(customers){
  const body=document.getElementById('custTableBody');
  if(!body)return;
  const filter=document.getElementById('customerFilterSelect')?.value||'all';
  const visible=customers.filter(c=>filter!=='eligible'||((c.orders||[]).filter(o=>/تم التسليم|تم التوصيل/.test(o.status)).length>=5));
  body.innerHTML=visible.map(c=>{
    const i=customers.indexOf(c);
    const completed=(c.orders||[]).filter(o=>/تم التسليم|تم التوصيل/.test(o.status)).length;
    return `<tr><td><b style="color:#2980b9">${esc(c.code||'---')}</b></td><td><b>${esc(c.name)}</b></td><td dir="ltr">${esc(c.phone)}</td><td>${esc(c.country||'---')} / ${esc(c.state||'---')}</td><td>${esc(c.address||'---')}</td><td><span style="background:#e1f5fe;color:#0288d1;padding:3px 8px;border-radius:4px;font-weight:bold">${completed} كلي</span></td><td><span style="background:#e0e0e0;padding:4px 8px;border-radius:4px">${completed} / 5 طلبات</span></td><td><input type="checkbox" style="width:20px;height:20px"></td><td><span style="background:#e8f8f5;color:#16a085;padding:4px 10px;border-radius:4px">${Number(c.usageCount||0)} مرة</span></td><td><span style="color:#888;font-size:11px">لا توجد مكافآت</span></td><td><button class="btn-green" onclick="loginAsCustomer(${i})">دخول</button> <button class="btn-blue" onclick="editCustomer(${i})">تعديل</button> <button class="btn-red" onclick="deleteCustomer(${i})">حذف</button></td></tr>`;
  }).join('');
}
function renderOrders(customers,orders){
  const body=document.getElementById('adminOrdersTableBody');
  if(!body)return;
  const byId=new Map(customers.map(c=>[c.dbId,c]));
  const byPhone=new Map(customers.map(c=>[digits(c.phone),c]));
  body.innerHTML=orders.map(o=>{
    const c=byId.get(o.customer_id)||byPhone.get(digits(o.customer_phone))||{};
    const options=statusOptions.map(s=>`<option value="${esc(s)}" ${s===o.status?'selected':''}>${esc(s)}</option>`).join('');
    return `<tr><td><b style="color:#2980b9">${esc(o.id)}</b></td><td><b>${esc(c.name||o.customerName||'---')}</b></td><td dir="ltr">${esc(c.phone||o.customer_phone||'---')}</td><td>${esc(c.address||o.address||'---')}</td><td><button class="btn-details" onclick="openAdminOrderDetailsById('${esc(o.dbId)}')">عرض تفاصيل الطلب</button></td><td><b style="color:#0a5">${esc(o.price)}</b></td><td>${esc(o.status)}</td><td><select onchange="updateCloudOrderStatus('${esc(o.dbId)}',this.value)">${options}</select></td></tr>`;
  }).join('');
}
async function load(){
  if(loadingPromise)return loadingPromise;
  loadingPromise=(async()=>{
    const client=window.cloudDb?.client;
    if(!client)throw new Error('Supabase client is not ready');
    const [cr,or]=await Promise.all([
      client.from('customers').select('*').order('created_at',{ascending:true}),
      client.from('orders').select('*').order('created_at',{ascending:true})
    ]);
    if(cr.error)throw cr.error;
    if(or.error)throw or.error;
    const customers=(cr.data||[]).map(mapCustomer);
    const orders=(or.data||[]).map(mapOrder);
    const byId=new Map(customers.map(c=>[c.dbId,c]));
    const byPhone=new Map(customers.map(c=>[digits(c.phone),c]));
    for(const o of orders){const c=byId.get(o.customer_id)||byPhone.get(digits(o.customer_phone));if(c)c.orders.push(o);}
    expose(customers);
    window.cloudAdminOrders=orders;
    renderCustomers(customers);
    renderOrders(customers,orders);
    console.info('[Admin Cloud Render] direct Supabase rows',{customers:customers.length,orders:orders.length});
    return {customers,orders};
  })().finally(()=>{loadingPromise=null;});
  return loadingPromise;
}

function lockedLoadCustomers(){renderCustomers(window.cloudAdminCustomers||[]);}
function lockedLoadAdminOrders(){renderOrders(window.cloudAdminCustomers||[],window.cloudAdminOrders||[]);}

function lockCloudRenderers(){
  // Legacy inline code is evaluated after cloudDbReady and used to overwrite
  // these functions. Install the cloud versions after all page scripts finish,
  // then make them non-writable so F5 and hard refresh follow the same path.
  try{Object.defineProperty(window,'loadCustomers',{value:lockedLoadCustomers,writable:false,configurable:false});}
  catch(_){window.loadCustomers=lockedLoadCustomers;}
  try{Object.defineProperty(window,'loadAdminOrders',{value:lockedLoadAdminOrders,writable:false,configurable:false});}
  catch(_){window.loadAdminOrders=lockedLoadAdminOrders;}
}

window.updateCloudOrderStatus=async function(id,status){
  const client=window.cloudDb?.client;
  const {error}=await client.from('orders').update({status,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return alert(error.message);
  await load();
};
window.openAdminOrderDetailsById=function(id){
  const o=(window.cloudAdminOrders||[]).find(x=>x.dbId===id);if(!o)return;
  const modal=document.getElementById('orderDetailsModal'),content=document.getElementById('orderDetailsContent');
  if(content)content.innerHTML=`<p><b>رقم الطلب:</b> ${esc(o.id)}</p><p><b>الحالة:</b> ${esc(o.status)}</p><p><b>السعر:</b> ${esc(o.price)}</p>`;
  if(modal)modal.style.display='flex';
};
window.reloadAdminCloudData=load;

function start(){
  lockCloudRenderers();
  load().catch(e=>console.error('[Admin Cloud Render]',e));
  // Repeat after delayed legacy callbacks; the properties remain locked.
  setTimeout(()=>{lockCloudRenderers();load().catch(console.error);},300);
  setTimeout(()=>{lockCloudRenderers();load().catch(console.error);},1000);
}

(window.cloudDbReady||Promise.resolve()).then(()=>{
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}).catch(e=>console.error('[Admin Cloud Render init]',e));
window.addEventListener('pageshow',()=>{if(window.cloudDb?.client){lockCloudRenderers();load().catch(console.error);}});
})();