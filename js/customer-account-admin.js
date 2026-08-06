(function () {
  'use strict';

  function getCustomers() {
    try { return JSON.parse(localStorage.getItem('adminCustomersList') || '[]'); }
    catch (error) { console.error('[Customer Accounts] Failed to read customers:', error); return []; }
  }
  function getExistingCustomer(index) { return Number.isInteger(index) && index >= 0 ? getCustomers()[index] || null : null; }
  function getDatabaseId(customer) { return customer?.dbId || customer?.cloudId || null; }
  function makeCustomerCode() {
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    const timePart = Date.now().toString(36).slice(-4).toUpperCase();
    return `CUS-${randomPart}${timePart}`;
  }
  function setValue(id, value) { const element = document.getElementById(id); if (element) element.value = value ?? ''; }
  function explicitText(value) { return String(value ?? '').trim(); }
  function nullableText(value) {
    const text = explicitText(value);
    return text === '' ? null : text;
  }
  function refreshCustomerViews() {
    if (typeof window.loadCustomers === 'function') window.loadCustomers();
    if (typeof window.loadAdminOrders === 'function') window.loadAdminOrders();
  }

  function install() {
    if (!window.location.pathname.endsWith('admin-dashboard.html')) return;
    (window.cloudDbReady || Promise.resolve()).catch(error => console.error('[Customer Accounts] Cloud initialization failed:', error)).finally(() => {
      setTimeout(() => {
        window.editCustomer = function editCustomer(index) {
          const customer = getExistingCustomer(Number(index));
          if (!customer) return alert('تعذر العثور على بيانات العميل. أعد تحميل الصفحة.');
          if (!getDatabaseId(customer)) return alert('تعذر تحديد سجل العميل في Supabase. أعد تحميل الصفحة.');
          setValue('editCustomerIndex', String(index));
          setValue('custName', customer.name || '');
          setValue('custCode', customer.customer_code || customer.code || customer.payload?.code || '');
          setValue('custEmail', customer.email || '');
          setValue('custPass', '');
          setValue('custCountry', customer.country || '');
          setValue('custPhone', customer.phone || '');
          setValue('custState', customer.state || customer.payload?.state || '');
          setValue('custAddress', customer.address || '');
          const title = document.getElementById('customerFormTitle');
          if (title) title.textContent = `تعديل بيانات العميل: ${customer.name || ''}`;
          const saveButton = document.getElementById('saveCustomerBtn');
          if (saveButton) saveButton.textContent = 'حفظ التعديلات';
          const cancelButton = document.getElementById('cancelEditBtn');
          if (cancelButton) cancelButton.style.display = 'inline-block';
          (title || document.getElementById('customers'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };

        window.deleteCustomer = async function deleteCustomer(index) {
          const customer = getExistingCustomer(Number(index));
          if (!customer) return alert('تعذر العثور على بيانات العميل. أعد تحميل الصفحة.');
          const databaseId = getDatabaseId(customer);
          if (!databaseId) return alert('تعذر تحديد سجل العميل في Supabase. أعد تحميل الصفحة.');
          if (!window.confirm(`هل أنت متأكد من حذف العميل «${customer.name || customer.phone}»؟\nسيتم حذف طلباته المرتبطة به أيضاً.`)) return;
          const client = window.cloudDb?.client;
          if (!client) return alert('تعذر الاتصال بقاعدة البيانات. أعد تحميل الصفحة.');
          try {
            const { data, error } = await client.from('customers').delete().eq('id', databaseId).select('id');
            if (error) throw error;
            if (!data?.length) throw new Error('لم يتم حذف السجل. تحقق من صلاحية الأدمن وسياسات RLS.');
            if (typeof window.resetCustomerForm === 'function') window.resetCustomerForm();
            await window.cloudDb.reload();
            refreshCustomerViews();
            alert('تم حذف العميل نهائياً من Supabase.');
          } catch (error) {
            console.error('[Customer Accounts] Delete failed:', error);
            alert(error?.message || 'تعذر حذف العميل من قاعدة البيانات.');
          }
        };

        window.saveCustomerData = async function saveCustomerData() {
          const client = window.cloudDb?.client;
          if (!client) return alert('تعذر الاتصال بقاعدة البيانات. أعد تحميل الصفحة.');

          const customerData = {
            name: explicitText(document.getElementById('custName')?.value),
            code: explicitText(document.getElementById('custCode')?.value),
            email: nullableText(document.getElementById('custEmail')?.value),
            password: explicitText(document.getElementById('custPass')?.value),
            country: explicitText(document.getElementById('custCountry')?.value),
            phone: explicitText(document.getElementById('custPhone')?.value),
            state: nullableText(document.getElementById('custState')?.value),
            address: explicitText(document.getElementById('custAddress')?.value),
          };

          const editIndex = Number.parseInt(explicitText(document.getElementById('editCustomerIndex')?.value) || '-1', 10);
          const existing = getExistingCustomer(editIndex);
          const databaseId = getDatabaseId(existing);

          if (!customerData.name || !customerData.country || !customerData.phone || !customerData.address) {
            return alert('الرجاء إدخال الاسم والدولة والهاتف والعنوان.');
          }
          if (!existing && customerData.password.length < 4) return alert('كلمة مرور العميل يجب أن تكون 4 أحرف أو أرقام على الأقل.');
          if (existing && customerData.password && customerData.password.length < 4) return alert('كلمة المرور الجديدة للعميل يجب أن تكون 4 أحرف أو أرقام على الأقل.');
          if (existing && !databaseId) return alert('تعذر تحديد سجل العميل في Supabase. أعد تحميل الصفحة ثم حاول مجدداً.');

          const finalCode = customerData.code || explicitText(existing?.customer_code || existing?.code || existing?.payload?.code) || makeCustomerCode();
          setValue('custCode', finalCode);

          const rpcParams = {
            p_customer_id: databaseId ? String(databaseId) : null,
            p_name: customerData.name,
            p_phone: customerData.phone,
            p_password: customerData.password,
            p_customer_code: String(finalCode),
            p_email: customerData.email,
            p_country: customerData.country || null,
            p_address: customerData.address || null,
            p_state: customerData.state,
          };

          const button = document.getElementById('saveCustomerBtn');
          const oldText = button?.textContent || 'حفظ وإضافة العميل';
          if (button) { button.disabled = true; button.textContent = 'جاري الحفظ...'; }
          try {
            const { data, error } = await client.rpc('admin_upsert_customer_account_v2', rpcParams);
            if (error) throw error;
            await window.cloudDb.reload();
            if (typeof window.resetCustomerForm === 'function') window.resetCustomerForm();
            refreshCustomerViews();
            alert(existing ? (customerData.password ? 'تم تحديث بيانات العميل وتعيين كلمة المرور الجديدة بنجاح.' : 'تم تحديث بيانات العميل بنجاح دون تغيير كلمة المرور.') : 'تم إنشاء حساب العميل وكلمة المرور بنجاح.');
            console.info('[Customer Accounts v2] Saved customer UUID:', data);
          } catch (error) {
            console.error('[Customer Accounts v2] Save failed:', error);
            const details = String(`${error?.message || ''} ${error?.details || ''}`).toLowerCase();
            if (details.includes('could not find the function') || details.includes('schema cache')) {
              alert('دوال حسابات العملاء v2 غير مثبتة بعد. نفّذ ملف FIX_CUSTOMER_LOGIN_FUNCTIONS.sql المحدث في Supabase.');
            } else if (details.includes('duplicate') || details.includes('unique')) {
              alert('رقم الهاتف أو كود العميل مستخدم في حساب آخر.');
            } else {
              alert(error?.message || 'تعذر حفظ حساب العميل.');
            }
          } finally {
            if (button) { button.disabled = false; button.textContent = oldText; }
          }
        };
        console.info('[Customer Accounts] v2 handlers installed.');
      }, 0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();