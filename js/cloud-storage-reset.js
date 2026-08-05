(function () {
  'use strict';

  // Keep Supabase authentication keys intact. Remove only legacy business-data
  // keys that caused F5 to render a different customer/order list.
  const staleKeys = [
    'adminCustomersList',
    'customersList',
    'ordersList',
    'adminOrdersList',
    'allOrders',
    'orders',
  ];

  try {
    const storage = window.localStorage;
    for (const key of staleKeys) storage.removeItem(key);
    console.info('[Cloud Reset] Removed legacy customer/order cache keys.');
  } catch (error) {
    console.error('[Cloud Reset] Could not clear legacy cache:', error);
  }
})();
