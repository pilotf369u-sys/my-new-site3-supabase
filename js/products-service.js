import { supabase } from './supabase-client.js';

export async function getProducts() {
  const { data, error } = await supabase.from('products')
    .select('id,code,name,price,old_price,price_label,old_price_label,image,description,currency,stock_quantity')
    .eq('is_active', true).order('created_at', { ascending: true });
  if (error) throw new Error('تعذر تحميل المنتجات: ' + error.message);
  return (data || []).map((product) => ({
    ...product,
    image: typeof product.image === 'string'
      ? product.image.replace(/^\/+/, '')
      : product.image,
  }));
}
