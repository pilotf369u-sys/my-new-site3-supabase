import { supabase } from './supabase-client.js';

export function normalizePhone(countryCode, phone) {
  return `${countryCode.replace(/[^\d+]/g, '')}${phone.replace(/\D/g, '').replace(/^0+/, '')}`;
}

export async function signInWithEmail(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error('أدخل البريد الإلكتروني وكلمة المرور.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw new Error(error.message || 'تعذر تسجيل الدخول بالبريد الإلكتروني.');
  }

  return data;
}

export async function signInWithPhone(phone, password) {
  const normalizedPhone = String(phone || '').trim();

  if (!normalizedPhone || !password) {
    throw new Error('أدخل رقم الهاتف وكلمة المرور.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    phone: normalizedPhone,
    password,
  });

  if (error) {
    throw new Error(error.message || 'تعذر تسجيل الدخول برقم الهاتف.');
  }

  return data;
}

export async function sendPhoneOtp({ phone, fullName = '', country = 'العراق', address = '', email = '' }) {
  const { data, error } = await supabase.auth.signInWithOtp({
    phone,
    options: {
      shouldCreateUser: true,
      data: {
        full_name: fullName,
        country,
        address,
        email,
      },
    },
  });

  if (error) {
    throw new Error(error.message || 'تعذر إرسال رمز التحقق.');
  }

  return data;
}

export async function verifyPhoneOtp(phone, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });

  if (error) {
    throw new Error(error.message || 'رمز التحقق غير صحيح.');
  }

  return data;
}

export async function setCurrentUserPassword(password) {
  if (!password || String(password).length < 6) {
    throw new Error('يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.');
  }

  const { data, error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw new Error(error.message || 'تعذر حفظ كلمة المرور.');
  }

  return data;
}

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  return user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    throw new Error(`تعذر جلب بيانات الحساب: ${error.message}`);
  }

  return data;
}

export function saveLegacySession(profile) {
  localStorage.setItem('loggedInUser', JSON.stringify({
    id: profile.id,
    name: profile.full_name || '',
    username: profile.full_name || '',
    phone: profile.phone || '',
    email: profile.email || '',
    country: profile.country || 'العراق',
    address: profile.address || '',
    role: profile.role || 'customer',
    customer_id: profile.customer_id || null,
  }));
}

export async function syncLegacySession() {
  const profile = await getCurrentProfile();

  if (profile) {
    saveLegacySession(profile);
  }

  return profile;
}

export function getDashboardPath(profile) {
  const role = String(profile?.role || 'customer').trim().toLowerCase();

  if (role === 'admin' || role === 'administrator') {
    return 'admin-dashboard.html';
  }

  if (role === 'customer' || role === 'client' || role === 'user') {
    return 'index.html';
  }

  if (role === 'employee' || role === 'staff') {
    const customerId = profile?.customer_id;

    if (customerId !== null && customerId !== undefined && String(customerId).trim() !== '') {
      return `employee-dashboard.html?customer_id=${encodeURIComponent(String(customerId).trim())}`;
    }

    return 'employee-dashboard.html';
  }

  return 'index.html';
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }

  localStorage.removeItem('loggedInUser');
  localStorage.removeItem('adminImpersonatingCustomer');
  window.location.href = 'login.html';
}
