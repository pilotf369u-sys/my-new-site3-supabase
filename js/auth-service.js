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

export async function sendPhoneOtp({ phone, fullName = '', country = 'العراق', address = '', email = '' }) {
  const { data, error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: true, data: { full_name: fullName, country, address, email } }
  });
  if (error) throw new Error(error.message || 'تعذر إرسال رمز التحقق.');
  return data;
}

export async function verifyPhoneOtp(phone, token) {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw new Error(error.message || 'رمز التحقق غير صحيح.');
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

export function saveLegacySession(profile) {
  localStorage.setItem('loggedInUser', JSON.stringify({
    id: profile.id,
    name: profile.full_name || '',
    username: profile.full_name || '',
    phone: profile.phone || '',
    email: profile.email || '',
    country: profile.country || 'العراق',
    address: profile.address || ''
  }));
}

export async function syncLegacySession() {
  const profile = await getCurrentProfile();
  if (profile) saveLegacySession(profile);
  return profile;
}

export async function signOut() {
  await supabase.auth.signOut();
  localStorage.removeItem('loggedInUser');
  window.location.href = 'login.html';
}
