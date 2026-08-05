// Register the cloud-data service worker once.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('./service-worker.js', { scope: './' })
    .catch(console.error);
}

import { supabase } from './supabase-client.js';

export function normalizePhone(countryCode, phone) {
  return `${countryCode.replace(/[^\d+]/g, '')}${phone
    .replace(/\D/g, '')
    .replace(/^0+/, '')}`;
}

export async function sendPhoneOtp({
  phone,
  fullName = '',
  country = 'العراق',
  address = '',
  email = '',
}) {
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

export async function signInWithPhone(phone, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    phone,
    password,
  });

  if (error) {
    throw new Error(error.message || 'تعذر تسجيل الدخول برقم الهاتف.');
  }

  return data;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message || 'تعذر تسجيل الدخول بالبريد الإلكتروني.');
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
    throw new Error(error.message);
  }

  return data;
}

export function saveLegacySession(profile) {
  const session = {
    id: profile.id,
    name: profile.full_name || '',
    username: profile.full_name || '',
    phone: profile.phone || '',
    email: profile.email || '',
    country: profile.country || 'العراق',
    address: profile.address || '',
    role: profile.role || 'customer',
  };

  // Session compatibility only; business data remains in Supabase.
  localStorage.setItem('loggedInUser', JSON.stringify(session));

  if (session.role === 'branch') {
    localStorage.setItem('loggedBranchName', session.name);
  } else {
    localStorage.removeItem('loggedBranchName');
  }

  return session;
}

export async function syncLegacySession() {
  const profile = await getCurrentProfile();

  if (profile) {
    saveLegacySession(profile);
  }

  return profile;
}

export function getDashboardPath(profile) {
  const role = profile?.role || 'customer';

  const paths = {
    admin: 'admin-dashboard.html',
    employee: 'employee-dashboard.html',
    delivery: 'delivery-dashboard.html',
    branch: 'branch-dashboard.html',
    customer: 'dashboard.html',
  };

  return paths[role] || paths.customer;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }

  localStorage.removeItem('loggedInUser');
  localStorage.removeItem('loggedBranchName');
  localStorage.removeItem('adminImpersonatingCustomer');
  localStorage.removeItem('viewedBy');
  localStorage.removeItem('isEmployeeViewing');

  window.location.href = 'login.html';
}
