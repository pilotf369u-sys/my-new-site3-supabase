(function () {
  'use strict';

  function normalizePhone(value) {
    return String(value || '').replace(/\s+/g, '').trim();
  }

  function installAdminCustomerViewFix() {
    if (!window.location.pathname.endsWith('/admin-dashboard.html') &&
        !window.location.pathname.endsWith('admin-dashboard.html')) {
      return;
    }

    // Override the legacy function after all inline page scripts have loaded.
    window.loginAsCustomer = function loginAsCustomer(index) {
      let customers = [];

      try {
        customers = JSON.parse(localStorage.getItem('adminCustomersList') || '[]');
      } catch (error) {
        console.error('[Customer View] Failed to parse customers list:', error);
      }

      const customer = customers[index];
      if (!customer) {
        alert('العميل غير موجود');
        return;
      }

      const phone = normalizePhone(customer.phone);
      if (!phone) {
        alert('رقم هاتف العميل غير موجود');
        return;
      }

      // Keep compatibility flags, but use the URL as the authoritative selector.
      sessionStorage.setItem('selectedCustomerPhone', phone);
      sessionStorage.setItem('selectedCustomerName', customer.name || '');
      sessionStorage.setItem('openedByAdmin', 'true');

      localStorage.setItem('isAdminViewing', 'true');
      localStorage.setItem('viewedBy', 'admin');
      localStorage.setItem('viewingCustomerIndex', String(index));

      window.location.href = `dashboard.html?phone=${encodeURIComponent(phone)}&view=admin`;
    };

    console.info('[Customer View] Admin customer selector is ready.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installAdminCustomerViewFix, { once: true });
  } else {
    installAdminCustomerViewFix();
  }
})();
