(function () {
  'use strict';

  const URL = 'https://hsmmbloouskqdnptiiad.supabase.co';
  const KEY = 'sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const db = window.supabase.createClient(URL, KEY);
  const mem = new Map();
  let queue = Promise.resolve();

  const parse = (value, fallback = null) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  const stringify = value => (value == null ? null : JSON.stringify(value));
  const normalizePhone = value => String(value || '').replace(/\s+/g, '');

  function reportQueryError(table, error) {
    if (!error) return;
    console.error(`[Supabase] Failed to load ${table}:`, {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      error,
    });
  }

  async function loadTable(table, queryBuilder) {
    try {
      const result = await queryBuilder;
      if (result.error) {
        reportQueryError(table, result.error);
        return [];
      }
      console.info(`[Supabase] Loaded ${result.data?.length || 0} rows from ${table}`);
      return result.data || [];
    } catch (error) {
      reportQueryError(table, error);
      return [];
    }
  }

  async function load() {
    const { data: authData, error: authError } = await db.auth.getUser();
    if (authError) console.error('[Supabase] auth.getUser failed:', authError);

    const user = authData?.user || null;
    let profile = null;

    if (user) {
      const profileResult = await db
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileResult.error) {
        reportQueryError('profiles', profileResult.error);
      } else {
        profile = profileResult.data;
      }

      if (profile) {
        mem.set(
          'loggedInUser',
          stringify({
            id: profile.id,
            name: profile.full_name || '',
            username: profile.full_name || '',
            phone: profile.phone || '',
            email: profile.email || '',
            country: profile.country || 'العراق',
            address: profile.address || '',
            role: profile.role || 'customer',
          }),
        );
      }
    }

    // Direct cloud SELECT queries. Errors are printed separately so one failed
    // table never hides successful results from the other tables.
    const customersRows = await loadTable(
      'customers',
      db.from('customers').select('*').order('created_at', { ascending: true }),
    );

    const ordersRows = await loadTable(
      'orders',
      db.from('orders').select('*').order('created_at', { ascending: true }),
    );

    const staffRows = await loadTable(
      'staff',
      db.from('staff').select('*').order('created_at', { ascending: true }),
    );

    const branchRows = await loadTable(
      'branches',
      db.from('branches').select('*').order('created_at', { ascending: true }),
    );

    const settingsRows = await loadTable(
      'app_settings',
      db.from('app_settings').select('*'),
    );

    const reportRows = await loadTable(
      'settlement_reports',
      db.from('settlement_reports').select('*').order('created_at', { ascending: true }),
    );

    const customers = customersRows.map(row => ({
      ...(row.payload || {}),
      dbId: row.id,
      id: row.payload?.code || row.id,
      code: row.payload?.code || '',
      name: row.name || row.payload?.name || '',
      phone: row.phone || row.payload?.phone || '',
      email: row.email || row.payload?.email || '',
      country: row.country || row.payload?.country || '',
      state: row.payload?.state || '',
      address: row.address || row.payload?.address || '',
      status: row.status || 'active',
      balance: Number(row.balance || 0),
      orders: [],
    }));

    const customersById = new Map(customers.map(customer => [customer.dbId, customer]));
    const customersByPhone = new Map(
      customers.map(customer => [normalizePhone(customer.phone), customer]),
    );

    for (const row of ordersRows) {
      const customer =
        customersById.get(row.customer_id) ||
        customersByPhone.get(normalizePhone(row.customer_phone));

      if (!customer) {
        console.warn('[Supabase] Order has no matching customer:', row);
        continue;
      }

      const payload = row.payload || {};
      customer.orders.push({
        ...payload,
        dbId: row.id,
        id: payload.id || row.legacy_id || row.id,
        legacyId: row.legacy_id || null,
        status: row.status || payload.status || 'new',
        price: payload.price || '$0.00',
        numericPrice: payload.numericPrice ?? null,
        currency: payload.currency || '$',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    mem.set('adminCustomersList', stringify(customers));

    mem.set(
      'employeesList',
      stringify(
        staffRows
          .filter(row => row.role === 'employee')
          .map(row => ({
            ...(row.payload || {}),
            id: row.id,
            name: row.name,
            phone: row.phone,
            status: row.status,
          })),
      ),
    );

    mem.set(
      'deliveryList',
      stringify(
        staffRows
          .filter(row => row.role === 'delivery')
          .map(row => ({
            ...(row.payload || {}),
            id: row.id,
            name: row.name,
            phone: row.phone,
            status: row.status,
          })),
      ),
    );

    mem.set(
      'branchList',
      stringify(
        branchRows.map(row => ({
          ...(row.payload || {}),
          id: row.id,
          name: row.name,
          phone: row.phone,
          status: row.status,
        })),
      ),
    );

    mem.set(
      'branchSettlementReports',
      stringify(
        reportRows.map(row => ({
          ...(row.payload || {}),
          id: row.id,
          type: row.report_type,
          createdAt: row.created_at,
        })),
      ),
    );

    for (const row of settingsRows) {
      mem.set(row.key, stringify(row.value));
    }

    console.info('[Supabase] Admin cloud data ready:', {
      customers: customers.length,
      orders: ordersRows.length,
      staff: staffRows.length,
      branches: branchRows.length,
    });

    return { customers, orders: ordersRows };
  }

  async function saveCustomers(raw) {
    const list = parse(raw, []);
    for (const customer of Array.isArray(list) ? list : []) {
      const customerPhone = normalizePhone(customer.phone || customer.mobile);
      if (!customerPhone) continue;

      const payload = { ...customer };
      delete payload.orders;
      delete payload.dbId;

      const customerResult = await db
        .from('customers')
        .upsert(
          {
            phone: customerPhone,
            name: customer.name || customer.full_name || '',
            email: customer.email || null,
            country: customer.country || null,
            address: customer.address || null,
            status: customer.status || 'active',
            balance: Number(customer.balance || 0),
            payload,
          },
          { onConflict: 'phone' },
        )
        .select('id')
        .single();

      if (customerResult.error) throw customerResult.error;

      for (let index = 0; index < (customer.orders || []).length; index += 1) {
        const order = customer.orders[index];
        const legacyId = String(
          order.legacyId || order.id || order.orderId || `${customerPhone}-${index}`,
        );
        const orderPayload = { ...order };
        delete orderPayload.dbId;

        const orderResult = await db.from('orders').upsert(
          {
            legacy_id: legacyId,
            customer_id: customerResult.data.id,
            customer_phone: customerPhone,
            status: order.status || 'new',
            payload: orderPayload,
          },
          { onConflict: 'legacy_id' },
        );

        if (orderResult.error) throw orderResult.error;
      }
    }
  }

  async function saveStaff(raw, role) {
    for (const item of parse(raw, []) || []) {
      const staffPhone = normalizePhone(item.phone || item.mobile);
      if (!staffPhone) continue;
      const result = await db.from('staff').upsert(
        {
          role,
          phone: staffPhone,
          name: item.name || '',
          status: item.status || 'active',
          payload: item,
        },
        { onConflict: 'role,phone' },
      );
      if (result.error) throw result.error;
    }
  }

  async function persist(key, value) {
    if (key === 'adminCustomersList') return saveCustomers(value);
    if (key === 'employeesList') return saveStaff(value, 'employee');
    if (key === 'deliveryList') return saveStaff(value, 'delivery');

    if (key === 'branchList') {
      for (const item of parse(value, []) || []) {
        const name = String(item.name || item.branchName || '').trim();
        if (!name) continue;
        const result = await db.from('branches').upsert(
          {
            name,
            phone: item.phone || null,
            status: item.status || 'active',
            payload: item,
          },
          { onConflict: 'name' },
        );
        if (result.error) throw result.error;
      }
      return;
    }

    if (key === 'branchSettlementReports') {
      let index = 0;
      for (const item of parse(value, []) || []) {
        const result = await db.from('settlement_reports').upsert(
          {
            legacy_id: String(item.id || item.reportId || `report-${index++}`),
            report_type: item.type || 'branch',
            payload: item,
          },
          { onConflict: 'legacy_id' },
        );
        if (result.error) throw result.error;
      }
      return;
    }

    if (
      [
        'loggedInUser',
        'selectedCustomerPhone',
        'selectedCustomerName',
        'isEmployeeViewing',
        'isAdminViewing',
        'viewingCustomerIndex',
        'viewedBy',
        'loggedBranchName',
        'loggedDeliveryName',
      ].includes(key)
    ) {
      return;
    }

    const result = await db.from('app_settings').upsert(
      { key, value: parse(value, value) },
      { onConflict: 'key' },
    );
    if (result.error) throw result.error;
  }

  const cloudStorage = {
    get length() {
      return mem.size;
    },
    key: index => Array.from(mem.keys())[index] ?? null,
    getItem: key => (mem.has(String(key)) ? mem.get(String(key)) : null),
    setItem(key, value) {
      key = String(key);
      value = String(value);
      mem.set(key, value);
      queue = queue
        .then(() => persist(key, value))
        .catch(error => console.error('Supabase sync failed', key, error));
    },
    removeItem: key => mem.delete(String(key)),
    clear: () => mem.clear(),
  };

  function refreshLegacyAdminViews() {
    const functions = [
      'loadAdminOrders',
      'loadCustomers',
      'loadEmployees',
      'loadDelivery',
      'loadBranches',
    ];

    for (const functionName of functions) {
      if (typeof window[functionName] === 'function') {
        try {
          window[functionName]();
        } catch (error) {
          console.error(`[Admin UI] ${functionName} failed:`, error);
        }
      }
    }
  }

  window.cloudDbReady = load()
    .then(result => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: cloudStorage,
      });

      window.cloudStorage = cloudStorage;
      window.cloudDb = {
        client: db,
        flush: () => queue,
        reload: async () => {
          const reloaded = await load();
          refreshLegacyAdminViews();
          return reloaded;
        },
        lastLoad: result,
      };

      // Legacy page functions are evaluated after cloudDbReady by the service
      // worker. Delay one tick so they exist, then draw the Supabase rows.
      setTimeout(refreshLegacyAdminViews, 0);
      setTimeout(refreshLegacyAdminViews, 250);

      return result;
    })
    .catch(error => {
      console.error('Cloud database initialization failed:', error);
      window.cloudStorage = cloudStorage;
      window.cloudDb = {
        client: db,
        flush: () => queue,
        reload: load,
      };
      throw error;
    });
})();
