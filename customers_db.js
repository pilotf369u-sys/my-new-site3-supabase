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