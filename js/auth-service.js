import { supabase } from './supabase-client.js?v=20260806-cloud';

const CUSTOMER_TOKEN_KEY = 'customerPortalToken';

export async function removeLegacyServiceWorkers() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }
}

removeLegacyServiceWorkers().catch(console.error);

export function normalizePhone(_countryCode, phone) {
  return String(phone || '').replace(/\D/g, '');
}

export async function sendPhoneOtp({ phone, fullName = '', country = 'العراق', address = '', email = '' }) {
  const { data, error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: true, data: { full_name: fullName, country, address, email } },
  });
  if (error) throw new Error(error.message || 'تعذر إرسال رمز التحقق.');
  return data;
}

export async function verifyPhoneOtp(phone, token) {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw new Error(error.message || 'رمز التحقق غير صحيح.');
  return data;
}

export async function signInWithPhone(phone, password) {
  const normalized = String(phone || '').replace(/\D/g, '');
  const { data, error } = await supabase.auth.signInWithPassword({ phone: `+${normalized}`, password });
  if (error) throw new Error(error.message || 'تعذر تسجيل الدخول برقم الهاتف.');
  return data;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message || 'تعذر تسجيل الدخول بالبريد الإلكتروني.');
  return data;
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  return user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw new Error(error.message);
  return data;
}

export function getCustomerPortalToken() {
  return localStorage.getItem(CUSTOMER_TOKEN_KEY) || '';
}

export async function getCustomerPortalData() {
  const token = getCustomerPortalToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc('customer_portal_data_v2', { p_token: token });
  if (error) throw new Error(error.message || 'تعذر تحميل بيانات العميل.');
  if (!data?.ok) return null;
  return data;
}

export async function syncLegacySession() {
  return getCurrentProfile();
}

export function getDashboardPath(profile) {
  const paths = {
    admin: 'admin.html?v=20260806-cloud',
    employee: 'employee-dashboard.html',
    delivery: 'delivery-dashboard.html',
    branch: 'branch-dashboard.html',
    customer: 'dashboard.html',
  };
  return paths[profile?.role || 'customer'] || paths.customer;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  window.location.href = 'login.html';
}
