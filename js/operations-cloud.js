import { supabase } from './supabase-client.js';

const text = value => String(value ?? '').trim();
const money = value => Number(value || 0);
const payloadOf = row => row?.payload && typeof row.payload === 'object' ? row.payload : {};

export async function requireStaff() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) location.replace('login.html');
  return user;
}

export async function listBranches() {
  const { data, error } = await supabase.from('branches').select('*').order('created_at');
  if (error) throw error;
  return data || [];
}

export async function saveBranch({ id = null, name, phone, password, address }) {
  const row = { name: text(name), phone: text(phone), status: 'active', payload: { address: text(address), password: text(password) } };
  const query = id ? supabase.from('branches').update(row).eq('id', id) : supabase.from('branches').insert(row);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteBranch(id) {
  const { error } = await supabase.from('branches').delete().eq('id', id);
  if (error) throw error;
}

export async function listDeliveries() {
  const { data, error } = await supabase.from('staff').select('*').eq('role', 'delivery').order('created_at');
  if (error) throw error;
  return data || [];
}

export async function listOrders() {
  const { data, error } = await supabase.from('orders').select('*, customers(id,name,phone,address)').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({ ...row, payload: payloadOf(row) }));
}

export async function listSettlements() {
  const { data, error } = await supabase.from('settlement_reports').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function setOrderCollection(orderId, collected) {
  const { data: current, error: readError } = await supabase.from('orders').select('payload').eq('id', orderId).single();
  if (readError) throw readError;
  const payload = { ...payloadOf(current), branchFinancialStatus: collected ? 'تم التوريد للخزينة' : 'معلق', branchCollectDate: collected ? new Date().toISOString() : null, isSettled: collected };
  const { error } = await supabase.from('orders').update({ payload, updated_at: new Date().toISOString() }).eq('id', orderId);
  if (error) throw error;
}

export function orderAmount(order) {
  const payload = payloadOf(order);
  if (payload.numericPrice != null) return money(payload.numericPrice);
  return Number(String(payload.price || '0').replace(/[^0-9.]/g, '')) || 0;
}

export function orderBranch(order) { return text(payloadOf(order).assignedBranch || order.branch_name); }
export function orderDelivery(order) { return text(payloadOf(order).assignedDelivery || order.delivery_name); }
export function orderLabel(order) { return text(payloadOf(order).id || order.legacy_id || order.id); }
export function customerName(order) { return text(order.customers?.name || payloadOf(order).customerName); }
export function customerPhone(order) { return text(order.customers?.phone || order.customer_phone); }
export function customerAddress(order) { return text(order.customers?.address || payloadOf(order).address); }

export async function listStaffOrders(role, name) {
  const orders = await listOrders();
  return orders.filter(order => role === 'branch' ? orderBranch(order) === name : orderDelivery(order) === name);
}

export async function updateOrderStatus(id, status) {
  const { error } = await supabase.from('orders').update({ status: text(status), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
