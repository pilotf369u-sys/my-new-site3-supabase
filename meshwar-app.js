// 1. دالة فتح المتاجر في المتصفح الخارجي (تجنباً لمشكلة تسجيل الدخول)
function openExternalStore(url) {
    window.open(url, '_system');
}

// 2. دالة إرسال الطلب للواتساب
function submitOrder() {
    const myNumber = "905521855554"; 
    const name = document.getElementById('pName').value;
    const clientCode = document.getElementById('pCode').value || "غير موجود";
    const url = document.getElementById('pUrl').value;
    const color = document.getElementById('pColor').value;
    const size = document.getElementById('pSize').value;
    const qty = document.getElementById('pQuantity').value;
    const address = document.getElementById('pAddress').value;
    const phone = document.getElementById('pPhone').value;

    if(!name || !url || !address || !phone) { 
        alert('يرجى تعبئة الحقول الأساسية (الاسم، الرابط، العنوان، الهاتف)'); 
        return; 
    }
    
    const fullMsg = `طلب جديد من MeshWar:
    الاسم: ${name}
    كود العميل: ${clientCode}
    الرابط: ${url}
    اللون: ${color}
    المقاس: ${size}
    العدد: ${qty}
    الخط العنوان: ${address}
    الهاتف: ${phone}
    بانتظار ردكم بالسعر النهائي.`;
    
    window.open(`https://wa.me/${myNumber}?text=${encodeURIComponent(fullMsg)}`, '_blank');
    document.getElementById('orderModal').style.display='none';
}

// 3. الكود الذكي لاستقبال الرابط القادم من قائمة المشاركة (Share Target)
window.addEventListener('load', () => {
    const params = new URLSearchParams(window.location.search);
    const sharedLink = params.get('link'); 
    
    if (sharedLink) {
        const urlInput = document.getElementById('pUrl');
        if (urlInput) {
            urlInput.value = sharedLink;
            document.getElementById('orderModal').style.display = 'block';
        }
    }
});