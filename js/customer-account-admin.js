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

  function getExistingCustomer(index) {
    if (!Number.isInteger(index) || index < 0) return null;
    return getCustomers()[index] || null;
  }

  function getDatabaseId(customer) {
    if (!customer) return null;
    return customer.dbId || customer.cloudId || null;
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? '';
  }

  function refreshCustomerViews() {
    if (typeof window.loadCustomers === 'function') window.loadCustomers();
    if (typeof window.loadAdminOrders === 'function') window.loadAdminOrders();
  }

  function install() {
    if (!window.location.pathname.endsWith('admin-dashboard.html')) return;

    const ready = window.cloudDbReady || Promise.resolve();

    ready
      .catch(error => {
        console.error('[Customer Accounts] Cloud initialization failed:', error);
      })
      .finally(() => {
        setTimeout(() => {
          window.editCustomer = function editCustomer(index) {
            const customer = getExistingCustomer(Number(index));

            if (!customer) {
              alert('تعذر العثور على بيانات العميل. أعد تحميل الصفحة.');
              return;
            }

            if (!getDatabaseId(customer)) {
              console.error('[Customer Accounts] Missing Supabase UUID:', customer);
              alert('تعذر تحديد سجل العميل في Supabase. أعد تحميل الصفحة.');
              return;
            }

            setValue('editCustomerIndex', String(index));
            setValue('custName', customer.name || '');
            setValue(
              'custCode',
              customer.customer_code ||
                customer.code ||
                customer.payload?.code ||
                '',
            );
            setValue('custEmail', customer.email || '');

            // Password hashes are never returned from Supabase. Leaving this
            // blank keeps the existing password; entering a value replaces it.
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

            const formTitle = title || document.getElementById('customers');
            formTitle?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          };

          window.deleteCustomer = async function deleteCustomer(index) {
            const customer = getExistingCustomer(Number(index));

            if (!customer) {
              alert('تعذر العثور على بيانات العميل. أعد تحميل الصفحة.');
              return;
            }

            const databaseId = getDatabaseId(customer);
            if (!databaseId) {
              console.error('[Customer Accounts] Missing UUID for deletion:', customer);
              alert('تعذر تحديد سجل العميل في Supabase. أعد تحميل الصفحة.');
              return;
            }

            const confirmed = window.confirm(
              `هل أنت متأكد من حذف العميل «${customer.name || customer.phone}»؟\nسيتم حذف طلباته المرتبطة به أيضاً.`,
            );
            if (!confirmed) return;

            const client = window.cloudDb?.client;
            if (!client) {
              alert('تعذر الاتصال بقاعدة البيانات. أعد تحميل الصفحة.');
              return;
            }

            try {
              const { data, error } = await client
                .from('customers')
                .delete()
                .eq('id', databaseId)
                .select('id');

              if (error) throw error;

              if (!data?.length) {
                throw new Error(
                  'لم يتم حذف السجل. تحقق من صلاحية الأدمن وسياسات RLS.',
                );
              }

              if (typeof window.resetCustomerForm === 'function') {
                window.resetCustomerForm();
              }

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
              alert('كلمة مرور العميل يجب أن تكون 4 أحرف أو أرقام على الأقل.');
              return;
            }

            if (existing && password && password.length < 4) {
              alert('كلمة المرور الجديدة للعميل يجب أن تكون 4 أحرف أو أرقام على الأقل.');
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
              refreshCustomerViews();

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
                alert('دالة حفظ حساب العميل غير متاحة في Supabase. أعد تحميل الصفحة.');
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

          console.info('[Customer Accounts] Supabase edit/delete handlers installed.');
        }, 0);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
