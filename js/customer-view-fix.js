(function () {
  'use strict';

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function afterCloudReady(callback) {
    const ready = window.cloudDbReady || Promise.resolve();
    ready
      .catch(error => {
        console.error('[Customer View] Cloud initialization failed:', error);
      })
      .finally(() => {
        // The legacy inline scripts also run from cloudDbReady. A macrotask
        // guarantees this fix is installed after those scripts finish.
        setTimeout(callback, 0);
      });
  }

  function installAdminCustomerSelector() {
    window.loginAsCustomer = function loginAsCustomer(index) {
      let customers = [];

      try {
        customers = JSON.parse(
          localStorage.getItem('adminCustomersList') || '[]',
        );
      } catch (error) {
        console.error('[Customer View] Failed to parse customers:', error);
      }

      const customer = customers[index];
      if (!customer) {
        alert('العميل غير موجود');
        return;
      }

      const phone = digits(customer.phone);
      if (!phone) {
        alert('رقم هاتف العميل غير موجود');
        return;
      }

      sessionStorage.setItem('selectedCustomerPhone', phone);
      sessionStorage.setItem('selectedCustomerName', customer.name || '');
      sessionStorage.setItem('openedByAdmin', 'true');

      localStorage.setItem('isAdminViewing', 'true');
      localStorage.setItem('viewedBy', 'admin');
      localStorage.setItem('viewingCustomerIndex', String(index));

      window.location.assign(
        `dashboard.html?phone=${encodeURIComponent(phone)}&view=admin`,
      );
    };

    console.info('[Customer View] Admin selector installed after legacy code.');
  }

  function formatDate(value) {
    if (!value) return 'غير محدد';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString('ar');
  }

  function statusStyle(status) {
    const text = String(status || 'قيد المعالجة');

    if (text.includes('تسليم') || text.includes('توصيل')) {
      return ['#d4edda', '#155724'];
    }

    if (text.includes('ملغي') || text.includes('رفض')) {
      return ['#f8d7da', '#721c24'];
    }

    if (
      text.includes('شحن') ||
      text.includes('توزيع') ||
      text.includes('مخزن')
    ) {
      return ['#cce5ff', '#004085'];
    }

    return ['#e0f2fe', '#0369a1'];
  }

  async function loadAdminSelectedCustomer() {
    const params = new URLSearchParams(window.location.search);
    const requestedPhone = digits(
      params.get('phone') || sessionStorage.getItem('selectedCustomerPhone'),
    );
    const isAdminView =
      params.get('view') === 'admin' ||
      sessionStorage.getItem('openedByAdmin') === 'true' ||
      localStorage.getItem('viewedBy') === 'admin';

    if (!requestedPhone || !window.cloudDb?.client) {
      return;
    }

    const client = window.cloudDb.client;

    const { data: customers, error: customerError } = await client
      .from('customers')
      .select('*');

    if (customerError) {
      console.error(
        '[Customer View] Failed to load selected customer:',
        customerError,
      );
      return;
    }

    const customer = (customers || []).find(
      item => digits(item.phone) === requestedPhone,
    );

    if (!customer) {
      console.error(
        '[Customer View] Customer was not found for phone:',
        requestedPhone,
      );
      const body = document.getElementById('customerOrdersTableBody');
      if (body) {
        body.innerHTML =
          '<tr><td colspan="7" style="padding:20px;color:#b00020">تعذر العثور على بيانات العميل المحدد.</td></tr>';
      }
      return;
    }

    const { data: orders, error: ordersError } = await client
      .from('orders')
      .select('*')
      .or(
        `customer_id.eq.${customer.id},customer_phone.eq.${customer.phone}`,
      )
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error(
        '[Customer View] Failed to load customer orders:',
        ordersError,
      );
    }

    const mappedOrders = (orders || []).map(order => ({
      ...(order.payload || {}),
      cloudId: order.id,
      id:
        order.legacy_id ||
        order.payload?.id ||
        order.id,
      status: order.status || order.payload?.status || 'قيد المعالجة',
      createdAt: order.created_at,
      date:
        order.payload?.date ||
        order.payload?.createdAt ||
        order.created_at,
    }));

    window.cloudSelectedCustomer = {
      ...customer,
      ...(customer.payload || {}),
      orders: mappedOrders,
    };
    window.cloudSelectedCustomerOrders = mappedOrders;

    const userName = document.getElementById('userName');
    if (userName) {
      userName.textContent = customer.name || 'عزيزي العميل';
    }

    const address = document.getElementById('userAddress');
    if (address) {
      address.value = customer.address || '';
    }

    const backButton = document.getElementById('backBtn');
    if (backButton && isAdminView) {
      backButton.textContent = 'العودة إلى لوحة الأدمن';
      backButton.href = 'admin-dashboard.html';
      backButton.onclick = null;
    }

    const tableBody = document.getElementById('customerOrdersTableBody');
    if (!tableBody) return;

    if (!mappedOrders.length) {
      tableBody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:20px;color:#777">لا توجد طلبات لهذا العميل.</td></tr>';
      return;
    }

    let total = 0;
    tableBody.innerHTML = mappedOrders
      .map((order, index) => {
        const priceText = String(
          order.price ||
            (order.numericPrice != null
              ? `${order.currency || '$'}${order.numericPrice}`
              : '$0.00'),
        );
        total += Number.parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

        const [background, color] = statusStyle(order.status);

        return `
          <tr>
            <td><b>${escapeHtml(order.id)}</b></td>
            <td style="font-size:13px;color:#555">${escapeHtml(
              formatDate(order.date || order.createdAt),
            )}</td>
            <td><span style="padding:5px 10px;background:${background};color:${color};border-radius:4px;font-size:12px;font-weight:bold;display:inline-block">${escapeHtml(
              order.status,
            )}</span></td>
            <td><b style="color:#003366">${escapeHtml(priceText)}</b></td>
            <td><button class="btn-details" type="button" onclick="openCloudCustomerOrderDetails(${index})"><i class="fa-solid fa-eye"></i> عرض التفاصيل</button></td>
            <td><span style="color:#64748b">—</span></td>
            <td><span style="color:#64748b">—</span></td>
          </tr>`;
      })
      .join('');

    tableBody.insertAdjacentHTML(
      'beforeend',
      `<tr style="font-weight:bold;color:var(--primary-red)"><td colspan="3" style="text-align:left">الإجمالي المطلوب دفعه:</td><td colspan="4" style="text-align:center">$${total.toFixed(
        2,
      )}</td></tr>`,
    );

    console.info('[Customer View] Loaded selected customer:', {
      customer: customer.phone,
      orders: mappedOrders.length,
    });
  }

  window.openCloudCustomerOrderDetails = function (index) {
    const order = window.cloudSelectedCustomerOrders?.[index];
    if (!order) return;

    const modal = document.getElementById('customerOrderDetailsModal');
    const content = document.getElementById('customerOrderDetailsContent');
    if (!modal || !content) return;

    const productUrl = order.productUrl || order.url || '';
    content.innerHTML = `
      <p><strong>رقم الطلب:</strong> ${escapeHtml(order.id)}</p>
      <p><strong>تاريخ الطلب:</strong> ${escapeHtml(
        formatDate(order.date || order.createdAt),
      )}</p>
      <p><strong>السعر:</strong> ${escapeHtml(
        order.price || order.numericPrice || '$0.00',
      )}</p>
      <p><strong>الحالة:</strong> ${escapeHtml(order.status)}</p>
      <p><strong>رابط المنتج:</strong> ${
        productUrl
          ? `<a href="${escapeHtml(
              productUrl,
            )}" target="_blank" rel="noopener">فتح الرابط</a>`
          : 'غير مسجل'
      }</p>
      <p><strong>ملاحظات:</strong> ${escapeHtml(order.notes || 'لا توجد')}</p>`;
    modal.style.display = 'flex';
  };

  const path = window.location.pathname;

  if (path.endsWith('admin-dashboard.html')) {
    afterCloudReady(installAdminCustomerSelector);
  }

  if (path.endsWith('dashboard.html')) {
    afterCloudReady(() => {
      loadAdminSelectedCustomer().catch(error => {
        console.error('[Customer View] Unexpected dashboard error:', error);
      });
    });
  }
})();
