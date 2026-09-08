import { useState, useEffect } from 'react'
import {
  Modal, Form, Input, InputNumber, Select, Button, Row, Col, Divider,
  Collapse, Switch, Tag, Space, Typography, message, Radio, Spin
} from 'antd'
import { supabase } from '../lib/supabase'

const { Text } = Typography
const { Panel } = Collapse
const { Option } = Select

// Currency configuration
const CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'د.إ'
}

// Fallback exchange rates (1 INR = X currency) – updated periodically
const FALLBACK_RATES = {
  INR: 1,
  USD: 0.012,
  EUR: 0.011,
  GBP: 0.0095,
  AED: 0.044
}

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
  const [orderCurrency, setOrderCurrency] = useState('INR')
  const [exchangeRate, setExchangeRate] = useState(1)
  const [rateLoading, setRateLoading] = useState(false)
  const [rateSource, setRateSource] = useState('default') // 'api' | 'fallback' | 'manual'

  // Helper to format currency
  const formatCurrency = (amount, currency = orderCurrency) => {
    const symbol = CURRENCY_SYMBOLS[currency] || currency + ' '
    return `${symbol}${Number(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  // Load customers & products
  useEffect(() => {
    supabase.from('customers').select('id, name').then(({ data, error }) => {
      if (error) message.error('Failed to load customers')
      else setCustomers(data || [])
    })
    supabase.from('products').select('id, title, sku, price, item_no, currency, metal_rate, labour, profit_percent, gold_weight, metal_type, gold_carat').then(({ data, error }) => {
      if (error) message.error('Failed to load products')
      else setProducts(data || [])
    })
  }, [])

  // Fetch exchange rate with multi-source fallback
  const fetchExchangeRate = async () => {
    if (orderCurrency === 'INR') {
      setExchangeRate(1)
      setRateSource('default')
      return
    }

    setRateLoading(true)
    setRateSource('loading')

    const endpoints = [
      `https://api.frankfurter.app/latest?from=INR&to=${orderCurrency}`,
      `https://open.er-api.com/v6/latest/INR`,
      `https://api.exchangerate.host/latest?base=INR&symbols=${orderCurrency}`
    ]

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint)
        if (!res.ok) continue
        const data = await res.json()
        let rate = null
        if (data.rates) {
          // Handle different response formats
          if (endpoint.includes('frankfurter')) {
            rate = data.rates[orderCurrency]
          } else if (endpoint.includes('open.er-api')) {
            rate = data.rates[orderCurrency]
          } else if (endpoint.includes('exchangerate.host')) {
            rate = data.rates[orderCurrency]
          }
        }
        if (rate && !isNaN(rate)) {
          setExchangeRate(rate)
          setRateSource('api')
          setRateLoading(false)
          return
        }
      } catch (err) {
        // continue to next endpoint
        console.warn('Exchange rate fetch failed:', endpoint, err)
      }
    }

    // Fallback to hardcoded rate
    const fallback = FALLBACK_RATES[orderCurrency]
    if (fallback) {
      setExchangeRate(fallback)
      setRateSource('fallback')
      message.warning(`Using offline fallback rate: 1 INR = ${fallback} ${orderCurrency}`)
    } else {
      setExchangeRate(1)
      setRateSource('fallback')
      message.error('No fallback rate available, please enter manually')
    }
    setRateLoading(false)
  }

  useEffect(() => {
    fetchExchangeRate()
  }, [orderCurrency])

  // Customer address
  const handleCustomerSelect = async (customerId) => {
    setSelectedCustomerId(customerId)
    setNewCustomer({ name: '', email: '', phone: '' })
    if (!customerId) {
      setShippingAddress({ full_name: '', line1: '', city: '', state: '', postal_code: '', country: 'IN', phone: '' })
      return
    }
    const { data: addrs, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_default_shipping', { ascending: false })
      .limit(1)
    if (error) {
      message.error('Failed to fetch address')
      return
    }
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
      const customer = customers.find(c => c.id === customerId)
      setShippingAddress(prev => ({ ...prev, full_name: customer?.name || '', line1: '', city: '', state: '', postal_code: '', country: 'IN', phone: '' }))
    }
  }

  // Add product to order
  const addProduct = async (productId) => {
    const prod = products.find(p => p.id === productId)
    if (!prod) return

    if (orderItems.some(item => item.product_id === productId)) {
      message.warning('Product already in order. Increase quantity instead.')
      return
    }

    const { data: diamonds } = await supabase
      .from('product_diamonds')
      .select('*')
      .eq('product_id', productId)

    const conv = exchangeRate
    const metalWeight = prod.gold_weight || 0
    const metalPurity = prod.gold_carat || 18
    const metalRate = (prod.metal_rate || 0) * conv
    const labour = (prod.labour || 0) * conv
    const profitPercent = prod.profit_percent || 0

    const diamondTotal = diamonds?.reduce((sum, d) => sum + Number(d.total_price), 0) || 0
    const diamondWeight = diamonds?.reduce((sum, d) => sum + Number(d.carat), 0) || 0
    const diamondRate = diamondWeight > 0 ? diamondTotal / diamondWeight : 0
    const convertedDiamondTotal = diamondTotal * conv
    const convertedDiamondRate = diamondRate * conv

    const metalTotal = metalWeight * metalRate
    const cost = metalTotal + convertedDiamondTotal + labour
    const profitAmount = cost * (profitPercent / 100)
    const basePrice = cost + profitAmount

    const breakdown = {
      diamond_weight: diamondWeight,
      diamond_rate: convertedDiamondRate,
      diamond_total: convertedDiamondTotal,
      metal_weight: metalWeight,
      metal_purity: metalPurity,
      metal_rate: metalRate,
      metal_total: metalTotal,
      labour: labour,
      profit_percent: profitPercent,
      profit_amount: profitAmount,
      show_breakdown_to_customer: true,
      currency: orderCurrency
    }

    const productSnapshot = {
      id: prod.id,
      title: prod.title,
      sku: prod.sku,
      item_no: prod.item_no,
      metal_type: prod.metal_type,
      gold_carat: prod.gold_carat,
      gold_weight: prod.gold_weight,
      metal_rate: metalRate,
      labour: labour,
      profit_percent: profitPercent,
      profit_amount: profitAmount,
      total_diamond_pcs: prod.total_diamond_pcs || null,
      total_diamond_carat: prod.total_diamond_carat || null,
      total_diamond_price: convertedDiamondTotal,
      diamonds: diamonds?.map(d => ({ ...d, rate: d.rate * conv, total_price: d.total_price * conv })) || []
    }

    setOrderItems(prev => [...prev, {
      product_id: prod.id,
      title: prod.title,
      sku: prod.sku,
      quantity: 1,
      price_mode: 'auto',
      unit_price: basePrice,
      breakdown,
      product_snapshot: productSnapshot,
      currency: orderCurrency
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
      return { ...item, unit_price: finalPrice, breakdown: bd }
    }))
  }

  const updateItemQuantity = (id, qty) => {
    setOrderItems(prev => prev.map(i => i.product_id === id ? { ...i, quantity: qty || 1 } : i))
  }

  const removeProductFromOrder = (id) => {
    setOrderItems(prev => prev.filter(i => i.product_id !== id))
  }

  // Toggle price mode
  const togglePriceMode = (productId, mode) => {
    setOrderItems(prev => prev.map(item => {
      if (item.product_id !== productId) return item
      if (mode === 'auto') {
        const bd = { ...item.breakdown }
        const cost = bd.metal_total + bd.diamond_total + bd.labour
        const profitAmount = cost * (bd.profit_percent / 100)
        const finalPrice = cost + profitAmount
        return { ...item, price_mode: 'auto', unit_price: finalPrice, breakdown: bd }
      } else {
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

  // Totals
  const subtotal = orderItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
  const totalTax = taxLines
    .filter(tl => tl.tax_type && tl.rate > 0)
    .reduce((sum, tl) => sum + (subtotal * tl.rate / 100), 0)
  const finalGrandTotal = subtotal + totalTax + (orderMeta.shipping || 0) - (orderMeta.discount || 0)

  // Create order
  const handleCreateOrder = async () => {
    if (orderItems.length === 0) { message.error('Add at least one product'); return }
    if (!selectedCustomerId && !newCustomer.name) { message.error('Select or enter a customer'); return }

    try {
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
        currency: orderCurrency,
        exchange_rate: exchangeRate,
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
        currency: orderCurrency,
        discount_amount: 0,
        tax_amount: 0,
        metadata: {
          price_mode: item.price_mode,
          breakdown: item.breakdown,
          show_breakdown_to_customer: item.breakdown.show_breakdown_to_customer,
          product_snapshot: item.product_snapshot
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
          tax_amount: subtotal * tl.rate / 100,
          currency: orderCurrency
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
        currency: orderCurrency
      }])

      message.success('Offline order created')
      // Reset
      setOrderItems([])
      setSelectedCustomerId(null)
      setNewCustomer({ name: '', email: '', phone: '' })
      setShippingAddress({ full_name: '', line1: '', city: '', state: '', postal_code: '', country: 'IN', phone: '' })
      setOrderMeta({ shipping: 0, discount: 0, notes: '' })
      setTaxLines([{ tax_type: 'CGST', rate: 1.5 }, { tax_type: 'SGST', rate: 1.5 }])
      setOrderCurrency('INR')
      setExchangeRate(1)
      onSuccess()
      onClose()
    } catch (err) {
      console.error(err)
      message.error('Failed to create order: ' + err.message)
    }
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
        {/* Currency and exchange rate */}
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Currency">
              <Select
                value={orderCurrency}
                onChange={(val) => {
                  setOrderCurrency(val)
                  if (val === 'INR') setExchangeRate(1)
                }}
                style={{ width: '100%' }}
              >
                <Option value="INR">₹ INR – Indian Rupee</Option>
                <Option value="USD">$ USD – US Dollar</Option>
                <Option value="EUR">€ EUR – Euro</Option>
                <Option value="GBP">£ GBP – British Pound</Option>
                <Option value="AED">د.إ AED – UAE Dirham</Option>
              </Select>
            </Form.Item>
          </Col>
          {orderCurrency !== 'INR' && (
            <Col xs={24} sm={12}>
              <Form.Item
                label={
                  <Space>
                    <span>Exchange Rate (1 INR = ? {orderCurrency})</span>
                    {rateLoading && <Spin size="small" />}
                    {rateSource === 'fallback' && <Tag color="orange">offline</Tag>}
                    {rateSource === 'api' && <Tag color="green">live</Tag>}
                    {rateSource === 'manual' && <Tag color="blue">manual</Tag>}
                  </Space>
                }
              >
                <InputNumber
                  min={0}
                  step={0.0001}
                  value={exchangeRate}
                  onChange={val => {
                    setExchangeRate(val || 1)
                    setRateSource('manual')
                  }}
                  style={{ width: '100%' }}
                  disabled={rateLoading}
                />
                <Button size="small" onClick={fetchExchangeRate} style={{ marginTop: 4 }}>
                  Refresh Rate
                </Button>
              </Form.Item>
            </Col>
          )}
        </Row>

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
              header={`${item.title} (${item.sku}) – Qty: ${item.quantity} – ${formatCurrency(item.unit_price, orderCurrency)}`}
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
                <Col xs={24} sm={6}>
                  <Form.Item label="Quantity">
                    <InputNumber min={1} value={item.quantity}
                      onChange={val => updateItemQuantity(item.product_id, val)} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>

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

                {item.price_mode === 'manual' && (
                  <Col xs={24} sm={8}>
                    <Form.Item label={`Final Price (${orderCurrency})`}>
                      <InputNumber
                        min={0}
                        value={item.unit_price}
                        onChange={val => updateManualPrice(item.product_id, val)}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                )}

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
                      <Form.Item label={`Rate / Carat (${orderCurrency})`}>
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
                      <Form.Item label={`Rate / g (${orderCurrency})`}>
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
                      <Form.Item label={`Labour Amount (${orderCurrency})`}>
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
                  </>
                )}

                <Col span={24}>
                  <Text strong>🏷️ Final Selling Price (before tax): {formatCurrency(item.unit_price, orderCurrency)}</Text>
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
              Grand Total: {formatCurrency(finalGrandTotal, orderCurrency)}
            </Text>
          </Col>
        </Row>

        {/* Tax Breakdown */}
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