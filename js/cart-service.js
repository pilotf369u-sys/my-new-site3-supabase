import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth-service.js';

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('يجب تسجيل الدخول أولاً.');
  return user;
}

export async function getOrCreateCart() {
  const user = await requireUser();
  let { data, error } = await supabase.from('carts').select('*').eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;
  const created = await supabase.from('carts').insert({ user_id: user.id, status: 'active' }).select().single();
  if (created.error?.code === '23505') {
    const retry = await supabase.from('carts').select('*').eq('user_id', user.id).eq('status', 'active').single();
    if (retry.error) throw new Error(retry.error.message);
    return retry.data;
  }
  if (created.error) throw new Error(created.error.message);
  return created.data;
}

export async function addProductToCart({ productId, quantity, unitPrice, color = '', size = '', weight = '' }) {
  const cart = await getOrCreateCart();
  const { data, error } = await supabase.from('cart_items').insert({
    cart_id: cart.id, product_id: productId, quantity, unit_price: unitPrice,
    color: color || null, size: size || null, weight: weight || null
  }).select().single();
  if (error?.code === '23505') throw new Error('هذا المنتج موجود في السلة بنفس الخيارات.');
  if (error) throw new Error('تعذر إضافة المنتج إلى السلة: ' + error.message);
  return data;
}
