import { useState, useEffect } from 'react'
import {
  Modal, Form, Input, InputNumber, Select, Button, Row, Col, Divider,
  Collapse, Switch, Tag, Space, Typography, message, Radio
} from 'antd'
import { supabase } from '../lib/supabase'

const { Text } = Typography
const { Panel } = Collapse
const { Option } = Select

export default function CreateOrderModal({ open, onClose, onSuccess, user }) {
  // State
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [orderItems, setOrderItems] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' })
  const [shippingAddress, setShippingAddress] = useState({
    full_name: '', line1: '', city: '', state: '', postal_code: '', country: 'IN', phone: ''
  })
  const [orderMeta, setOrderMeta] = useState({ shipping: 0, discount: 0, notes: '' })
  const [taxLines, setTaxLines] = useState([
    { tax_type: 'CGST', rate: 1.5 },
    { tax_type: 'SGST', rate: 1.5 }
  ])

  // Load customers & products
  useEffect(() => {
    supabase.from('customers').select('id, name').then(({ data }) => setCustomers(data || []))
    supabase.from('products').select('id, title, sku, price, item_no').then(({ data }) => setProducts(data || []))
  }, [])

  // Customer address
  const handleCustomerSelect = async (customerId) => {
    setSelectedCustomerId(customerId)
    setNewCustomer({ name: '', email: '', phone: '' })
    if (!customerId) {
      setShippingAddress({ full_name: '', line1: '', city: '', state: '', postal_code: '', country: 'IN', phone: '' })
      return
    }
    const { data: addrs } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_default_shipping', { ascending: false })
      .limit(1)
    if (addrs && addrs.length > 0) {
      const addr = addrs[0]
      setShippingAddress({
        full_name: addr.full_name || '',
        line1: addr.line1 || '',
        city: addr.city || '',
        state: addr.state || '',
        postal_code: addr.postal_code || '',
        country: addr.country || 'IN',
        phone: addr.phone || ''
      })
    } else {
      setShippingAddress({ full_name: '', line1: '', city: '', state: '', postal_code: '', country: 'IN', phone: '' })
    }
  }

  // Add product to order
  const addProduct = async (productId) => {
    const prod = products.find(p => p.id === productId)
    if (!prod) return

    const [{ data: diamonds }, { data: productDetail }] = await Promise.all([
      supabase.from('product_diamonds').select('*').eq('product_id', productId),
      supabase.from('products').select('*').eq('id', productId).single()
    ])

    const metalWeight = productDetail?.gold_weight || 0
    const metalPurity = productDetail?.gold_carat || 18
    const metalRate = productDetail?.metal_rate || 0
    const labour = productDetail?.labour || 0
    const profitPercent = productDetail?.profit_percent || 0

    const diamondTotal = diamonds?.reduce((sum, d) => sum + Number(d.total_price), 0) || 0
    const diamondWeight = diamonds?.reduce((sum, d) => sum + Number(d.carat), 0) || 0
    const diamondRate = diamondWeight > 0 ? diamondTotal / diamondWeight : 0

    const metalTotal = metalWeight * metalRate
    const cost = metalTotal + diamondTotal + labour
    const profitAmount = cost * (profitPercent / 100)
    const basePrice = cost + profitAmount

    const breakdown = {
      diamond_weight: diamondWeight,
      diamond_rate: diamondRate,
      diamond_total: diamondTotal,
      metal_weight: metalWeight,
      metal_purity: metalPurity,
      metal_rate: metalRate,
      metal_total: metalTotal,
      labour: labour,
      profit_percent: profitPercent,
      profit_amount: profitAmount,
      tax_category_id: productDetail?.tax_category_id,
      tax_rate: 0,
      tax_amount: 0,
      show_breakdown_to_customer: true
    }

    // Build full product snapshot (to be stored in order_items.metadata)
    const productSnapshot = {
      id: productDetail?.id,
      title: productDetail?.title,
      sku: productDetail?.sku,
      item_no: productDetail?.item_no,
      metal_type: productDetail?.metal_type,
      gold_carat: productDetail?.gold_carat,
      gold_weight: productDetail?.gold_weight,
      metal_rate: productDetail?.metal_rate,
      labour: productDetail?.labour,
      profit_percent: productDetail?.profit_percent,
      profit_amount: productDetail?.profit_amount,
      total_diamond_pcs: productDetail?.total_diamond_pcs,
      total_diamond_carat: productDetail?.total_diamond_carat,
      total_diamond_price: productDetail?.total_diamond_price,
      diamonds: diamonds || []
    }

    setOrderItems(prev => [...prev, {
      product_id: prod.id,
      title: prod.title,
      sku: prod.sku,
      quantity: 1,
      price_mode: 'auto',
      unit_price: basePrice,
      breakdown,
      product_snapshot: productSnapshot   // stored in metadata on submission
    }])
  }

  // Update breakdown fields (only used in auto mode)
  const updateBreakdown = (productId, field, value) => {
    setOrderItems(prev => prev.map(item => {
      if (item.product_id !== productId) return item
      const bd = { ...item.breakdown, [field]: value }
      if (['diamond_weight', 'diamond_rate'].includes(field)) {
        bd.diamond_total = bd.diamond_weight * bd.diamond_rate
      }
      if (['metal_weight', 'metal_rate'].includes(field)) {
        bd.metal_total = bd.metal_weight * bd.metal_rate
      }
      const cost = bd.metal_total + bd.diamond_total + bd.labour
      bd.profit_amount = cost * (bd.profit_percent / 100)
      const finalPrice = cost + bd.profit_amount
      bd.tax_amount = finalPrice * ((bd.tax_rate || 0) / 100)
      return { ...item, unit_price: finalPrice, breakdown: bd }
    }))
  }

  const updateItemQuantity = (id, qty) => {
    setOrderItems(prev => prev.map(i => i.product_id === id ? { ...i, quantity: qty } : i))
  }

  const removeProductFromOrder = (id) => {
    setOrderItems(prev => prev.filter(i => i.product_id !== id))
  }

  // Toggle price mode
  const togglePriceMode = (productId, mode) => {
    setOrderItems(prev => prev.map(item => {
      if (item.product_id !== productId) return item
      if (mode === 'auto') {
        // Recalculate unit price from breakdown
        const bd = { ...item.breakdown }
        const cost = bd.metal_total + bd.diamond_total + bd.labour
        const profitAmount = cost * (bd.profit_percent / 100)
        const finalPrice = cost + profitAmount
        bd.tax_amount = finalPrice * ((bd.tax_rate || 0) / 100)
        return { ...item, price_mode: 'auto', unit_price: finalPrice, breakdown: bd }
      } else {
        // Switch to manual; keep current unit_price
        return { ...item, price_mode: 'manual' }
      }
    }))
  }

  // Manual price input
  const updateManualPrice = (productId, value) => {
    setOrderItems(prev => prev.map(item =>
      item.product_id === productId ? { ...item, unit_price: value || 0 } : item
    ))
  }

  // Totals (per item tax = 0 for manual items; auto items still compute)
  const subtotal = orderItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
  const totalTax = orderItems.reduce((sum, i) => sum + (i.price_mode === 'auto' ? i.breakdown.tax_amount : 0) * i.quantity, 0)
  const finalGrandTotal = subtotal + totalTax + (orderMeta.shipping || 0) - (orderMeta.discount || 0)

  // Create order
  const handleCreateOrder = async () => {
    if (orderItems.length === 0) { message.error('Add at least one product'); return }
    if (!selectedCustomerId && !newCustomer.name) { message.error('Select or enter a customer'); return }

    let customerId = selectedCustomerId
    if (!customerId && newCustomer.name) {
      const { data: newCust, error: custErr } = await supabase.from('customers').insert([{
        name: newCustomer.name, email: newCustomer.email, phone: newCustomer.phone,
        country: shippingAddress.country || 'IN'
      }]).select().single()
      if (custErr) { message.error('Failed to create customer'); return }
      customerId = newCust.id
    }

    const orderNumber = 'OFF-' + Date.now().toString(36).toUpperCase()
    const { data: orderData, error: orderErr } = await supabase.from('orders').insert([{
      order_number: orderNumber,
      user_id: user?.id,
      customer_id: customerId,
      status: 'confirmed',
      subtotal,
      shipping_cost: orderMeta.shipping,
      tax_amount: totalTax,
      discount_amount: orderMeta.discount,
      grand_total: finalGrandTotal,
      currency: 'INR',
      shipping_address: shippingAddress,
      billing_address: shippingAddress,
      customer_note: orderMeta.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]).select().single()
    if (orderErr) { message.error('Failed to create order'); return }

    const itemsToInsert = orderItems.map(item => ({
      order_id: orderData.id,
      product_id: item.product_id,
      product_title: item.title,
      product_sku: item.sku,
      product_slug: '',
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.quantity * item.unit_price,
      currency: 'INR',
      discount_amount: 0,
      tax_amount: item.price_mode === 'auto' ? item.breakdown.tax_amount * item.quantity : 0,
      metadata: {
        price_mode: item.price_mode,
        breakdown: item.breakdown,
        show_breakdown_to_customer: item.breakdown.show_breakdown_to_customer,
        product_snapshot: item.product_snapshot   // ← full product details stored here
      }
    }))
    await supabase.from('order_items').insert(itemsToInsert)

    const validTaxLines = taxLines.filter(tl => tl.tax_type && tl.rate > 0)
    if (validTaxLines.length > 0) {
      const taxRows = validTaxLines.map(tl => ({
        order_id: orderData.id,
        tax_type: tl.tax_type,
        tax_rate: tl.rate,
        taxable_amount: subtotal,
        tax_amount: subtotal * tl.rate / 100
      }))
      await supabase.from('order_tax_lines').insert(taxRows)
    }

    const invoiceNumber = 'INV-' + orderNumber + '-' + Math.random().toString(36).substring(2, 6)
    await supabase.from('invoices').insert([{
      order_id: orderData.id,
      invoice_number: invoiceNumber,
      status: 'unpaid',
      subtotal,
      tax_amount: totalTax,
      shipping_cost: orderMeta.shipping,
      total: finalGrandTotal,
      currency: 'INR'
    }])

    message.success('Offline order created')
    // Reset
    setOrderItems([])
    setSelectedCustomerId(null)
    setNewCustomer({ name: '', email: '', phone: '' })
    setShippingAddress({ full_name: '', line1: '', city: '', state: '', postal_code: '', country: 'IN', phone: '' })
    setOrderMeta({ shipping: 0, discount: 0, notes: '' })
    setTaxLines([{ tax_type: 'CGST', rate: 1.5 }, { tax_type: 'SGST', rate: 1.5 }])
    onSuccess()
    onClose()
  }

  return (
    <Modal
      title="Create Offline Order"
      open={open}
      onCancel={onClose}
      onOk={handleCreateOrder}
      width="100%"
      style={{ maxWidth: 1000 }}
      okText="Create Order"
      destroyOnClose
    >
      <Form layout="vertical">
        {/* Customer selection */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Form.Item label="Existing Customer">
              <Select
                allowClear
                placeholder="Select"
                value={selectedCustomerId}
                onChange={handleCustomerSelect}
                showSearch
                optionFilterProp="children"
              >
                {customers.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Text type="secondary">— or new customer —</Text>
            <Input placeholder="Name" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} style={{ marginBottom: 8 }} />
            <Input placeholder="Email" value={newCustomer.email} onChange={e => setNewCustomer({...newCustomer, email: e.target.value})} style={{ marginBottom: 8 }} />
            <Input placeholder="Phone" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} />
          </Col>
        </Row>

        {/* Shipping address */}
        <Divider>Shipping Address</Divider>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Input placeholder="Full Name" value={shippingAddress.full_name}
              onChange={e => setShippingAddress({...shippingAddress, full_name: e.target.value})} />
          </Col>
          <Col xs={24} sm={12}>
            <Input placeholder="Phone" value={shippingAddress.phone}
              onChange={e => setShippingAddress({...shippingAddress, phone: e.target.value})} />
          </Col>
        </Row>
        <Input placeholder="Address Line 1" value={shippingAddress.line1}
          onChange={e => setShippingAddress({...shippingAddress, line1: e.target.value})}
          style={{ marginTop: 8 }} />
        <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
          <Col xs={24} sm={8}>
            <Input placeholder="City" value={shippingAddress.city}
              onChange={e => setShippingAddress({...shippingAddress, city: e.target.value})} />
          </Col>
          <Col xs={24} sm={8}>
            <Input placeholder="State" value={shippingAddress.state}
              onChange={e => setShippingAddress({...shippingAddress, state: e.target.value})} />
          </Col>
          <Col xs={24} sm={8}>
            <Input placeholder="Postal Code" value={shippingAddress.postal_code}
              onChange={e => setShippingAddress({...shippingAddress, postal_code: e.target.value})} />
          </Col>
        </Row>
        <Input placeholder="Country" value={shippingAddress.country}
          onChange={e => setShippingAddress({...shippingAddress, country: e.target.value})}
          style={{ marginTop: 8 }} />

        {/* Products */}
        <Divider>Products</Divider>
        <Select
          showSearch
          placeholder="Search by Item No, SKU, or Product Name"
          filterOption={(input, option) => {
            const term = input.toLowerCase()
            const prod = products.find(p => p.id === option.value)
            if (!prod) return false
            return (
              (prod.item_no && prod.item_no.toLowerCase().includes(term)) ||
              prod.title?.toLowerCase().includes(term) ||
              prod.sku?.toLowerCase().includes(term)
            )
          }}
          onSelect={addProduct}
          style={{ width: '100%', marginBottom: 16 }}
          optionLabelProp="label"
        >
          {products.map(p => (
            <Option key={p.id} value={p.id} label={`${p.item_no ? p.item_no + ' | ' : ''}${p.title} (SKU: ${p.sku})`}>
              <Space>
                {p.item_no && <Tag color="blue">{p.item_no}</Tag>}
                <span>{p.title}</span>
                <Text type="secondary">({p.sku})</Text>
              </Space>
            </Option>
          ))}
        </Select>

        <Collapse accordion>
          {orderItems.map(item => (
            <Panel
              key={item.product_id}
              header={`${item.title} (${item.sku}) – Qty: ${item.quantity} – ₹${item.unit_price?.toLocaleString()}`}
              extra={
                <Space wrap>
                  <Switch
                    checkedChildren="Show"
                    unCheckedChildren="Hide"
                    checked={item.breakdown.show_breakdown_to_customer}
                    onChange={checked => updateBreakdown(item.product_id, 'show_breakdown_to_customer', checked)}
                  />
                  <Button danger size="small" onClick={() => removeProductFromOrder(item.product_id)}>Remove</Button>
                </Space>
              }
            >
              <Row gutter={[12, 12]}>
                {/* Quantity */}
                <Col xs={24} sm={6}>
                  <Form.Item label="Quantity">
                    <InputNumber min={1} value={item.quantity}
                      onChange={val => updateItemQuantity(item.product_id, val)} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>

                {/* Price Mode */}
                <Col xs={24} sm={10}>
                  <Form.Item label="Price Mode">
                    <Radio.Group
                      value={item.price_mode}
                      onChange={(e) => togglePriceMode(item.product_id, e.target.value)}
                      optionType="button"
                      buttonStyle="solid"
                    >
                      <Radio.Button value="auto">Auto Calculate</Radio.Button>
                      <Radio.Button value="manual">Manual Price</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                </Col>

                {/* Manual Price Input (only when manual) */}
                {item.price_mode === 'manual' && (
                  <Col xs={24} sm={8}>
                    <Form.Item label="Final Price (₹)">
                      <InputNumber
                        min={0}
                        value={item.unit_price}
                        onChange={val => updateManualPrice(item.product_id, val)}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                )}

                {/* Breakdown only when auto */}
                {item.price_mode === 'auto' && (
                  <>
                    <Col span={24}><Text strong>💎 Diamonds</Text></Col>
                    <Col xs={24} sm={8}>
                      <Form.Item label="Total Carat">
                        <InputNumber value={item.breakdown.diamond_weight}
                          onChange={val => updateBreakdown(item.product_id, 'diamond_weight', val)} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item label="Rate / Carat">
                        <InputNumber value={item.breakdown.diamond_rate}
                          onChange={val => updateBreakdown(item.product_id, 'diamond_rate', val)} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item label="Diamond Total">
                        <InputNumber value={item.breakdown.diamond_total} readOnly style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>

                    <Col span={24}><Text strong>🔨 Metal</Text></Col>
                    <Col xs={24} sm={6}>
                      <Form.Item label="Weight (g)">
                        <InputNumber value={item.breakdown.metal_weight}
                          onChange={val => updateBreakdown(item.product_id, 'metal_weight', val)} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={6}>
                      <Form.Item label="Purity (K)">
                        <InputNumber value={item.breakdown.metal_purity}
                          onChange={val => updateBreakdown(item.product_id, 'metal_purity', val)} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={6}>
                      <Form.Item label="Rate / g">
                        <InputNumber value={item.breakdown.metal_rate}
                          onChange={val => updateBreakdown(item.product_id, 'metal_rate', val)} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={6}>
                      <Form.Item label="Metal Total">
                        <InputNumber value={item.breakdown.metal_total} readOnly style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>

                    <Col span={24}><Text strong>🧰 Labour</Text></Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Labour Amount">
                        <InputNumber value={item.breakdown.labour}
                          onChange={val => updateBreakdown(item.product_id, 'labour', val)} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>

                    <Col span={24}><Text strong>📈 Profit</Text></Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Profit %">
                        <InputNumber value={item.breakdown.profit_percent}
                          onChange={val => updateBreakdown(item.product_id, 'profit_percent', val)} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Profit Amount">
                        <InputNumber value={item.breakdown.profit_amount} readOnly style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>

                    <Col xs={24} sm={12}>
                      <Form.Item label="Tax Rate (%)">
                        <InputNumber value={item.breakdown.tax_rate}
                          onChange={val => updateBreakdown(item.product_id, 'tax_rate', val)} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Tax Amount">
                        <InputNumber value={item.breakdown.tax_amount} readOnly style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </>
                )}

                <Col span={24}>
                  <Text strong>🏷️ Final Selling Price (before tax): ₹{item.unit_price?.toLocaleString()}</Text>
                </Col>
              </Row>
            </Panel>
          ))}
        </Collapse>

        {/* Order Totals */}
        <Divider>Order Totals</Divider>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={6}>
            <Form.Item label="Subtotal">
              <InputNumber value={subtotal} readOnly style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item label="Shipping">
              <InputNumber min={0} value={orderMeta.shipping}
                onChange={val => setOrderMeta({...orderMeta, shipping: val || 0})} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item label="Discount">
              <InputNumber min={0} value={orderMeta.discount}
                onChange={val => setOrderMeta({...orderMeta, discount: val || 0})} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item label="Total Tax">
              <InputNumber value={totalTax} readOnly style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Row>
          <Col span={24} style={{ textAlign: 'right', marginTop: 12 }}>
            <Text strong style={{ fontSize: 18, color: '#B8860B' }}>
              Grand Total: ₹{finalGrandTotal.toLocaleString()}
            </Text>
          </Col>
        </Row>

        {/* Tax Breakdown (applies to whole order) */}
        <Divider>Tax Breakdown</Divider>
        {taxLines.map((tl, idx) => (
          <Row gutter={[8, 8]} key={idx} style={{ marginBottom: 8 }}>
            <Col xs={24} sm={8}>
              <Select
                value={tl.tax_type}
                onChange={val => { const newTL = [...taxLines]; newTL[idx].tax_type = val; setTaxLines(newTL) }}
                style={{ width: '100%' }}
              >
                <Option value="CGST">CGST</Option>
                <Option value="SGST">SGST</Option>
                <Option value="IGST">IGST</Option>
                <Option value="UTGST">UTGST</Option>
                <Option value="cess">Cess</Option>
              </Select>
            </Col>
            <Col xs={24} sm={8}>
              <InputNumber
                placeholder="Rate %"
                value={tl.rate}
                onChange={val => { const newTL = [...taxLines]; newTL[idx].rate = val; setTaxLines(newTL) }}
                style={{ width: '100%' }}
                min={0}
                max={100}
              />
            </Col>
            <Col xs={24} sm={8}>
              <Button danger block onClick={() => setTaxLines(taxLines.filter((_, i) => i !== idx))}>
                Remove
              </Button>
            </Col>
          </Row>
        ))}
        <Button type="dashed" onClick={() => setTaxLines([...taxLines, { tax_type: 'CGST', rate: 0 }])} style={{ marginBottom: 16 }}>
          + Add Tax Line
        </Button>

        <Form.Item label="Notes" style={{ marginTop: 16 }}>
          <Input.TextArea rows={2} value={orderMeta.notes} onChange={e => setOrderMeta({...orderMeta, notes: e.target.value})} />
        </Form.Item>
      </Form>
    </Modal>
  )
}