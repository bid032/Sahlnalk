import { supabaseAdmin } from '@/integrations/supabase/client.server';
import crypto from 'crypto';

export interface DeliverCreds {
  account_email?: string | null;
  account_username?: string | null;
  account_password?: string | null;
  extra_notes?: string | null;
  image_url?: string | null;
}

export async function assertStaff(userId: string) {
  const { data: roles, error } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'moderator']);

  if (error || !roles || roles.length === 0) {
    throw new Error('Forbidden');
  }
}

async function markItemDelivered(orderItemId: string) {
  await supabaseAdmin
    .from('order_items')
    .update({ status: 'delivered' })
    .eq('id', orderItemId);
}

/** Emails the customer the credentials for one item. Never throws. */
async function emailCustomer(orderItemId: string): Promise<{ emailSent: boolean; emailError?: string }> {
  try {
    const { sendItemDeliveredEmail } = await import('./notify-order.server');
    const res = await sendItemDeliveredEmail(orderItemId);
    return { emailSent: res.ok === true, emailError: res.ok ? undefined : res.reason };
  } catch (e: any) {
    console.error('[deliver-order] delivery email failed', e);
    return { emailSent: false, emailError: e?.message || 'email_failed' };
  }
}

function combineNotesWithImage(notes?: string | null, imageUrl?: string | null): string | null {
  const cleanNotes = (notes ?? '').trim();
  const cleanImg = (imageUrl ?? '').trim();
  if (!cleanImg) return cleanNotes || null;
  if (!cleanNotes) return `[image]: ${cleanImg}`;
  if (cleanNotes.includes(cleanImg)) return cleanNotes;
  return `${cleanNotes}\n[image]: ${cleanImg}`;
}

export async function deliverManual(userId: string, orderItemId: string, creds: DeliverCreds) {
  await assertStaff(userId);

  const notesWithImg = combineNotesWithImage(creds.extra_notes, creds.image_url);

  // Check if item already has a delivered account record
  const { data: existing } = await supabaseAdmin
    .from('delivered_accounts')
    .select('id')
    .eq('order_item_id', orderItemId)
    .maybeSingle();

  if (existing) {
    // Update existing delivered account record
    const { error } = await supabaseAdmin
      .from('delivered_accounts')
      .update({
        account_email: creds.account_email || null,
        account_username: creds.account_username || null,
        account_password: creds.account_password || null,
        extra_notes: notesWithImg,
        delivered_by: userId,
        delivered_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) throw error;
  } else {
    // Insert new delivered account record
    const id = crypto.randomUUID();
    const { error } = await supabaseAdmin
      .from('delivered_accounts')
      .insert({
        id,
        order_item_id: orderItemId,
        account_email: creds.account_email || null,
        account_username: creds.account_username || null,
        account_password: creds.account_password || null,
        extra_notes: notesWithImg,
        delivered_by: userId,
        delivered_at: new Date().toISOString(),
      });

    if (error) throw error;
  }

  await markItemDelivered(orderItemId);
  return { ok: true as const, ...(await emailCustomer(orderItemId)) };
}

export async function updateDeliveredAccount(userId: string, orderItemId: string, creds: DeliverCreds) {
  return deliverManual(userId, orderItemId, creds);
}

export async function deliverFromStock(userId: string, orderItemId: string, planId: string) {
  await assertStaff(userId);

  const { data: inventoryItem } = await supabaseAdmin
    .from('account_inventory')
    .select('*')
    .eq('plan_id', planId)
    .eq('status', 'available')
    .limit(1)
    .maybeSingle();

  if (!inventoryItem) throw new Error('NO_INVENTORY');

  await supabaseAdmin
    .from('account_inventory')
    .update({
      status: 'delivered',
      delivered_order_item_id: orderItemId,
      delivered_at: new Date().toISOString(),
    })
    .eq('id', inventoryItem.id);

  const deliveredId = crypto.randomUUID();
  const { error } = await supabaseAdmin
    .from('delivered_accounts')
    .insert({
      id: deliveredId,
      order_item_id: orderItemId,
      account_email: inventoryItem.account_email,
      account_username: inventoryItem.account_username,
      account_password: inventoryItem.account_password,
      extra_notes: inventoryItem.extra_notes,
      delivered_by: userId,
      delivered_at: new Date().toISOString(),
    });

  if (error) throw error;

  await markItemDelivered(orderItemId);

  return { ok: true as const, inventoryId: inventoryItem.id, ...(await emailCustomer(orderItemId)) };
}


