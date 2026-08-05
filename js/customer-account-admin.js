(function () {
  'use strict';

  function install() {
    if (!window.location.pathname.endsWith('admin-dashboard.html')) return;

    const ready = window.cloudDbReady || Promise.resolve();
    ready.finally(() => setTimeout(() => {
      window.saveCustomerData = async function saveCustomerData() {
        const client = window.cloudDb?.client;
        if (!client) return alert('تعذر الاتصال بقاعدة البيانات.');

        const name = document.getElementById('custName').value.trim();
        const code = document.getElementById('custCode').value.trim();
        const email = document.getElementById('custEmail').value.trim();
        const password = document.getElementById('custPass').value;
        const country = document.getElementById('custCountry').value;
        const phone = document.getElementById('custPhone').value.trim();
        const state = document.getElementById('custState').value.trim();
        const address = document.getElementById('custAddress').value.trim();
        const editIndex = Number.parseInt(document.getElementById('editCustomerIndex').value, 10);

        let customers = [];
        try {
          customers = JSON.parse(localStorage.getItem('adminCustomersList') || '[]');
        } catch {}

        const existing = editIndex >= 0 ? customers[editIndex] : null;
        if (!name || !country || !phone || !address) {
          return alert('الرجاء إدخال الاسم والدولة والهاتف والعنوان.');
        }
        if (!existing && password.length < 4) {
          return alert('كلمة المرور يجب أن تكون 4 أحرف أو أرقام على الأقل.');
        }
        if (existing && password && password.length < 4) {
          return alert('كلمة المرور الجديدة يجب أن تكون 4 أحرف أو أرقام على الأقل.');
        }

        const button = document.getElementById('saveCustomerBtn');
        const oldText = button.textContent;
        button.disabled = true;
        button.textContent = 'جاري الحفظ...';

        try {
          const { data, error } = await client.rpc('admin_upsert_customer_account', {
            p_customer_id: existing?.id || null,
            p_name: name,
            p_phone: phone,
            p_password: password,
            p_customer_code: code || existing?.code || null,
            p_email: email || null,
            p_country: country || null,
            p_address: address || null,
            p_state: state || null,
          });
          if (error) throw error;

          await window.cloudDb.reload();
          if (typeof window.resetCustomerForm === 'function') window.resetCustomerForm();
          if (typeof window.loadCustomers === 'function') window.loadCustomers();
          if (typeof window.loadAdminOrders === 'function') window.loadAdminOrders();
          alert(existing ? 'تم تحديث بيانات العميل وكلمة المرور.' : 'تم إنشاء حساب العميل بنجاح.');
          console.info('[Customer Accounts] Saved customer:', data);
        } catch (error) {
          console.error('[Customer Accounts] Save failed:', error);
          alert(error.message || 'تعذر حفظ حساب العميل. تأكد من تنفيذ CUSTOMER_PASSWORD_LOGIN.sql');
        } finally {
          button.disabled = false;
          button.textContent = oldText;
        }
      };

      console.info('[Customer Accounts] Admin account editor is ready.');
    }, 0));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
