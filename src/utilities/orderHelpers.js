import { supabase } from '../lib/supabase'

/**
 * Checks if an order is fully paid and, if so, sets:
 *   - order.status = 'paid'
 *   - all unpaid invoices of that order = 'paid'
 */
export async function checkAndMarkOrderPaid(orderId) {
  // 1. Fetch the order (grand_total and current status)
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('grand_total, status')
    .eq('id', orderId)
    .single()

  if (orderErr || !order) {
    console.error('Failed to fetch order for payment check:', orderErr)
    return
  }

  // 2. Skip if order is already in a final state
  if (['paid', 'cancelled', 'returned'].includes(order.status)) return

  // 3. Sum all payments for this order
  const { data: payments, error: payErr } = await supabase
    .from('order_payments')
    .select('amount')
    .eq('order_id', orderId)

  if (payErr) {
    console.error('Failed to sum payments:', payErr)
    return
  }

  const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0)

  // 4. If total paid >= grand total, mark as paid
  if (totalPaid >= order.grand_total) {
    // Update the order
    await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId)

    // Update all unpaid invoices of this order to 'paid'
    await supabase
      .from('invoices')
      .update({ status: 'paid' })
      .eq('order_id', orderId)
      .eq('status', 'unpaid')   // only update those still unpaid
  }
}