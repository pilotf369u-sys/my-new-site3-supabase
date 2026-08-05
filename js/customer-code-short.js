(function () {
  'use strict';

  if (!location.pathname.endsWith('admin-dashboard.html')) return;

  function makeShortCode() {
    return `CUS-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function ensureShortCode() {
    const input = document.getElementById('custCode');
    const editIndex = Number.parseInt(
      document.getElementById('editCustomerIndex')?.value || '-1',
      10,
    );

    if (!input || editIndex >= 0 || input.value.trim()) return;
    input.value = makeShortCode();
  }

  document.addEventListener('click', event => {
    if (event.target?.closest('#saveCustomerBtn')) ensureShortCode();
  }, true);

  document.addEventListener('submit', event => {
    if (event.target?.closest('#customerForm')) ensureShortCode();
  }, true);
})();
