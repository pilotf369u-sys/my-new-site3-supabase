import { supabase } from './supabase-client.js?v=20260806-cloud';
import { getCustomerPortalToken } from './auth-service.js?v=20260806-cloud';

function requireCustomerToken() {
  const token = getCustomerPortalToken();
  if (!token) throw new Error('يجب تسجيل الدخول أولاً.');
  return token;
}

export async function addProductToCart({
  productId,
  quantity,
  unitPrice,
  color = '',
  size = '',
  weight = '',
}) {
  const token = requireCustomerToken();
  const { data, error } = await supabase.rpc('customer_add_cart_item_v2', {
    p_token: token,
    p_product_id: productId,
    p_quantity: Number(quantity),
    p_unit_price: Number(unitPrice),
    p_color: color || null,
    p_size: size || null,
    p_weight: weight || null,
  });

  if (error) throw new Error('تعذر إضافة المنتج إلى السلة: ' + error.message);
  if (!data?.ok) throw new Error(data?.message || 'تعذر إضافة المنتج إلى السلة.');
  return data;
}

export async function getCartItems() {
  const token = requireCustomerToken();
  const { data, error } = await supabase.rpc('customer_cart_data_v2', { p_token: token });
  if (error) throw new Error(error.message || 'تعذر تحميل السلة.');
  if (!data?.ok) throw new Error(data?.message || 'تعذر تحميل السلة.');
  return data.items || [];
}
