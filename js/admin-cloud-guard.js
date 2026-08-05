(function () {
  'use strict';

  if (!location.pathname.endsWith('admin-dashboard.html')) return;

  let repairing = false;
  let lastCustomerSignature = '';
  let lastOrderSignature = '';

  function customerSignature() {
    return JSON.stringify((window.cloudAdminCustomers || []).map(item => [
      item.dbId,
      item.name,
      item.phone,
      item.code,
      (item.orders || []).length,
    ]));
  }

  function orderSignature() {
    return JSON.stringify((window.cloudAdminOrders || []).map(item => [
      item.dbId,
      item.id,
      item.status,
      item.customer_id,
      item.customer_phone,
    ]));
  }

  function repaint() {
    if (repairing) return;
    repairing = true;

    try {
      const nextCustomers = customerSignature();
      const nextOrders = orderSignature();

      if (
        nextCustomers !== lastCustomerSignature ||
        document.querySelectorAll('#custTableBody tr').length !== (window.cloudAdminCustomers || []).length
      ) {
        window.loadCustomers?.();
        lastCustomerSignature = nextCustomers;
      }

      if (
        nextOrders !== lastOrderSignature ||
        document.querySelectorAll('#adminOrdersTableBody tr').length !== (window.cloudAdminOrders || []).length
      ) {
        window.loadAdminOrders?.();
        lastOrderSignature = nextOrders;
      }
    } finally {
      setTimeout(() => { repairing = false; }, 0);
    }
  }

  function observeTable(id) {
    const body = document.getElementById(id);
    if (!body) return;

    const observer = new MutationObserver(() => {
      if (!repairing) queueMicrotask(repaint);
    });

    observer.observe(body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  async function start() {
    await (window.cloudDbReady || Promise.resolve());
    await window.reloadAdminCloudData?.();

    observeTable('custTableBody');
    observeTable('adminOrdersTableBody');
    repaint();

    // A small reconciliation interval protects against delayed legacy timers.
    setInterval(repaint, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => start().catch(console.error), { once: true });
  } else {
    start().catch(console.error);
  }
})();
