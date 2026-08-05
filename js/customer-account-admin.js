(function () {
  'use strict';

  function getCustomers() {
    try {
      return JSON.parse(localStorage.getItem('adminCustomersList') || '[]');
    } catch (error) {
      console.error('[Customer Accounts] Failed to read customers:', error);
      return [];
    }
  }

  function getExistingCustomer(editIndex) {
    if (!Number.isInteger(editIndex) || editIndex < 0) return null;
    return getCustomers()[editIndex] || null;
  }

  function getDatabaseId(customer) {
    if (!customer) return null;

    // db.js exposes the real Supabase UUID as dbId. The legacy `id` field may
    // contain the visible customer code (CUS-xxxx), which is not a UUID and
    // must never be sent as p_customer_id.
    return customer.dbId || customer.cloudId || null;
  }

  function install() {
    if (!window.location.pathname.endsWith('admin-dashboard.html')) return;

    const ready = window.cloudDbReady || Promise.resolve();

    ready
      .catch(error => {
        console.error('[Customer Accounts] Cloud initialization failed:', error);
      })
      .finally(() => {
        // Install after the legacy page functions have finished loading so this
        // implementation remains the active save handler.
        setTimeout(() => {
          window.saveCustomerData = async function saveCustomerData() {
            const client = window.cloudDb?.client;
            if (!client) {
              alert('تعذر الاتصال بقاعدة البيانات. أعد تحميل الصفحة.');
              return;
            }

            const name = document.getElementById('custName')?.value.trim() || '';
            const code = document.getElementById('custCode')?.value.trim() || '';
            const email = document.getElementById('custEmail')?.value.trim() || '';
            const password = document.getElementById('custPass')?.value || '';
            const country = document.getElementById('custCountry')?.value || '';
            const phone = document.getElementById('custPhone')?.value.trim() || '';
            const state = document.getElementById('custState')?.value.trim() || '';
            const address = document.getElementById('custAddress')?.value.trim() || '';
            const editIndex = Number.parseInt(
              document.getElementById('editCustomerIndex')?.value || '-1',
              10,
            );

            const existing = getExistingCustomer(editIndex);
            const databaseId = getDatabaseId(existing);

            if (!name || !country || !phone || !address) {
              alert('الرجاء إدخال الاسم والدولة والهاتف والعنوان.');
              return;
            }

            if (!existing && password.length < 4) {
              alert('كلمة المرور يجب أن تكون 4 أحرف أو أرقام على الأقل.');
              return;
            }

            if (existing && password && password.length < 4) {
              alert('كلمة المرور الجديدة يجب أن تكون 4 أحرف أو أرقام على الأقل.');
              return;
            }

            if (existing && !databaseId) {
              console.error('[Customer Accounts] Missing Supabase UUID:', existing);
              alert('تعذر تحديد سجل العميل في Supabase. أعد تحميل الصفحة ثم حاول مجدداً.');
              return;
            }

            const button = document.getElementById('saveCustomerBtn');
            const oldText = button?.textContent || 'حفظ وإضافة العميل';

            if (button) {
              button.disabled = true;
              button.textContent = 'جاري الحفظ...';
            }

            try {
              const { data, error } = await client.rpc(
                'admin_upsert_customer_account',
                {
                  p_customer_id: databaseId,
                  p_name: name,
                  p_phone: phone,
                  p_password: password,
                  p_customer_code:
                    code ||
                    existing?.customer_code ||
                    existing?.code ||
                    existing?.payload?.code ||
                    null,
                  p_email: email || null,
                  p_country: country || null,
                  p_address: address || null,
                  p_state: state || null,
                },
              );

              if (error) throw error;

              await window.cloudDb.reload();

              if (typeof window.resetCustomerForm === 'function') {
                window.resetCustomerForm();
              }
              if (typeof window.loadCustomers === 'function') {
                window.loadCustomers();
              }
              if (typeof window.loadAdminOrders === 'function') {
                window.loadAdminOrders();
              }

              alert(
                existing
                  ? password
                    ? 'تم تحديث بيانات العميل وتعيين كلمة المرور الجديدة بنجاح.'
                    : 'تم تحديث بيانات العميل بنجاح دون تغيير كلمة المرور.'
                  : 'تم إنشاء حساب العميل وكلمة المرور بنجاح.',
              );

              console.info('[Customer Accounts] Saved customer UUID:', data);
            } catch (error) {
              console.error('[Customer Accounts] Save failed:', error);

              const details = String(
                `${error?.message || ''} ${error?.details || ''}`,
              ).toLowerCase();

              if (
                details.includes('could not find the function') ||
                details.includes('schema cache')
              ) {
                alert('دالة حفظ حساب العميل غير متاحة في Supabase. أعد تحميل الصفحة بعد تنفيذ ملف CUSTOMER_PASSWORD_LOGIN.sql.');
              } else if (details.includes('duplicate') || details.includes('unique')) {
                alert('رقم الهاتف أو كود العميل مستخدم في حساب آخر.');
              } else {
                alert(error?.message || 'تعذر حفظ حساب العميل.');
              }
            } finally {
              if (button) {
                button.disabled = false;
                button.textContent = oldText;
              }
            }
          };

          console.info('[Customer Accounts] Supabase account editor installed.');
        }, 0);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
