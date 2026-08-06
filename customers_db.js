// عند دخول الأدمن إلى حساب عميل من لوحة الإدارة، يتم اعتماد الجلسة المحلية
// ثم التوجيه مباشرة إلى الصفحة الرئيسية للمتجر دون طلب كلمة مرور أو OTP.
(function handleAdminCustomerAccess() {
    const viewedBy = localStorage.getItem('viewedBy');
    const isAdminImpersonation = viewedBy === 'admin';

    if (!isAdminImpersonation) return;

    try {
        const storedUser = JSON.parse(localStorage.getItem('loggedInUser') || '{}');
        const customerSession = {
            ...storedUser,
            role: 'customer',
            adminImpersonation: true,
        };

        localStorage.setItem('loggedInUser', JSON.stringify(customerSession));
        localStorage.setItem('adminImpersonatingCustomer', 'true');
        localStorage.removeItem('isEmployeeViewing');
        localStorage.removeItem('viewingCustomerIndex');
        localStorage.removeItem('viewedBy');

        if (!window.location.pathname.endsWith('/index.html')) {
            window.location.replace('index.html');
        }
    } catch (error) {
        console.error('تعذر فتح حساب العميل من لوحة الإدارة:', error);
    }
})();

// مزامنة جلسة العميل القادمة من Supabase مع القائمة المحلية التي تعتمد عليها
// لوحة dashboard.html القديمة. يمنع هذا ظهور "خطأ في تحديد العميل" بعد نجاح الدخول.
(function syncAuthenticatedCustomerForDashboard() {
    if (!window.location.pathname.endsWith('/dashboard.html')) return;

    const normalizePhone = value => String(value ?? '').replace(/\D/g, '');

    try {
        const loggedInUser = JSON.parse(localStorage.getItem('loggedInUser') || 'null');
        if (!loggedInUser || loggedInUser.role !== 'customer') return;

        const sessionPhone = normalizePhone(loggedInUser.phone);
        const sessionId = String(loggedInUser.id ?? '').trim();
        const sessionName = String(loggedInUser.name ?? loggedInUser.username ?? '').trim();

        if (!sessionPhone && !sessionId && !sessionName) return;

        let customers = [];
        try {
            const parsed = JSON.parse(localStorage.getItem('adminCustomersList') || '[]');
            customers = Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('[Customer Dashboard] Invalid local customer list; rebuilding it.', error);
        }

        const existingIndex = customers.findIndex(customer => {
            const customerPhone = normalizePhone(customer?.phone);
            const customerId = String(customer?.dbId ?? customer?.cloudId ?? customer?.id ?? '').trim();
            const customerName = String(customer?.name ?? customer?.username ?? '').trim();

            if (sessionId && customerId && sessionId === customerId) return true;
            if (sessionPhone && customerPhone && sessionPhone === customerPhone) return true;
            return Boolean(sessionName && customerName && sessionName === customerName);
        });

        const current = existingIndex >= 0 ? customers[existingIndex] : {};
        const syncedCustomer = {
            ...current,
            ...loggedInUser,
            dbId: loggedInUser.id ?? current.dbId ?? current.cloudId ?? null,
            cloudId: loggedInUser.id ?? current.cloudId ?? current.dbId ?? null,
            name: sessionName || current.name || current.username || 'عزيزي العميل',
            phone: String(loggedInUser.phone ?? current.phone ?? '').trim(),
            customer_code: loggedInUser.code ?? loggedInUser.customer_code ?? current.customer_code ?? current.code ?? null,
            code: loggedInUser.code ?? loggedInUser.customer_code ?? current.code ?? current.customer_code ?? null,
            country: loggedInUser.country ?? current.country ?? '',
            address: loggedInUser.address ?? current.address ?? '',
            role: 'customer',
            orders: Array.isArray(current.orders)
                ? current.orders
                : (Array.isArray(loggedInUser.orders) ? loggedInUser.orders : []),
            rewardsLog: Array.isArray(current.rewardsLog) ? current.rewardsLog : [],
        };

        if (existingIndex >= 0) customers[existingIndex] = syncedCustomer;
        else customers.unshift(syncedCustomer);

        localStorage.setItem('adminCustomersList', JSON.stringify(customers));
        localStorage.removeItem('selectedCustomerPhone');
        localStorage.removeItem('selectedCustomerName');
        sessionStorage.removeItem('selectedCustomerPhone');

        console.info('[Customer Dashboard] Authenticated customer synchronized.', {
            id: syncedCustomer.dbId,
            phone: syncedCustomer.phone,
            name: syncedCustomer.name,
        });
    } catch (error) {
        console.error('[Customer Dashboard] Failed to synchronize authenticated customer:', error);
    }
})();

// هذا الملف يحتوي على بيانات العملاء المسجلين وقائمة طلباتهم
const customersDB = [
    {
        name: "Omar al Jammas",
        phone: "905378240430",
        password: "1234",
        country: "العراق",
        address: "بغداد، حي المنصور، شارع 14 رمضان",
        orders: [
            { id: "#MW-9014", status: "في انتظار الدفع", price: "$85.50" },
            { id: "#MW-8821", status: "قيد المعالجة", price: "$120.00" }
        ]
    },
    {
        name: "عبد العزيز",
        phone: "9647772279773",
        password: "123",
        country: "العراق",
        address: "بغداد، حي العدل، شارع 14",
        orders: [
            { id: "#MW-5520", status: "تم التوصيل", price: "$200.00" },
            { id: "#MW-8821", status: "قيد المعالجة", price: "$120.00" }
        ]
    },
    {
        name: "عمار الحمداني",
        phone: "9647774366640",
        password: "123",
        country: "العراق",
        address: "اربيل، سوق، شارع",
        orders: []
    },
    {
        name: "اسيل",
        phone: "9647718303382",
        password: "123",
        country: "العراق",
        address: "تركيا، انقرة، كيجوران",
        orders: [
            { id: "#MW-3312", status: "قيد الشحن", price: "$45.00" }
        ]
    }
];