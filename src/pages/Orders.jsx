import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Space, Select, message, Tag, Input, Card, Row, Col, Typography,
  Modal, Form, InputNumber, Divider, Collapse, Switch, Popconfirm, Dropdown,
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, OrderedListOutlined,
  EyeOutlined, EditOutlined, PlusOutlined, DeleteOutlined, MoreOutlined,
  FilePdfOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { generateInvoicePDF } from '../utilities/invoicepdf'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Panel } = Collapse
const { Option } = Select

export default function Orders() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)
  const [downloadingInvoice, setDownloadingInvoice] = useState(false)

  // Status modal
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [newStatus, setNewStatus] = useState('')

  // Create order modal
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])

  const [orderItems, setOrderItems] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' })
  const [shippingAddress, setShippingAddress] = useState({
    full_name: '', line1: '', city: '', state: '', postal_code: '', country: 'IN', phone: ''
  })
  const [orderMeta, setOrderMeta] = useState({ shipping: 0, discount: 0, notes: '' })

  // Tax lines (editable)
  const [taxLines, setTaxLines] = useState([
    { tax_type: 'CGST', rate: 1.5 },
    { tax_type: 'SGST', rate: 1.5 }
  ])

  // Fetch orders
  const fetchOrders = async () => {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select(`*, customers ( name ), order_items ( quantity, unit_price )`)
      .order('created_at', { ascending: false })
    if (statusFilter) query = query.eq('status', statusFilter)
    const { data, error } = await query
    if (error) { message.error('Failed to load orders'); setLoading(false); return }
    const enriched = data.map(order => ({
      ...order,
      total_items: order.order_items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
    }))
    setOrders(enriched)
    setLoading(false)
  }

  useEffect(() => { fetchOrders() }, [statusFilter])

  // Status update
  const handleStatusUpdate = async () => {
    if (!newStatus || !selectedOrder) return
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', selectedOrder.id)
    if (error) message.error('Update failed')
    else { message.success('Status updated'); setStatusModalOpen(false); fetchOrders() }
  }

  // Delete order
  const handleDelete = async (id) => {
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) message.error('Delete failed')
    else { message.success('Order deleted'); fetchOrders() }
  }

  // Load customers & products
  useEffect(() => {
    supabase.from('customers').select('id, name').then(({ data }) => setCustomers(data || []))
    supabase.from('products').select('id, title, sku, price, item_no').then(({ data }) => setProducts(data || []))
  }, [])

  // Auto‑fetch customer address
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
        line2: addr.line2 || '',
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

  // Add product with pricing breakdown
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

    const defaultBreakdown = {
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

    setOrderItems(prev => [...prev, {
      product_id: prod.id,
      title: prod.title,
      sku: prod.sku,
      quantity: 1,
      unit_price: basePrice,
      breakdown: defaultBreakdown
    }])
  }

  // Update breakdown
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

  // Totals
  const subtotal = orderItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
  const totalTax = orderItems.reduce((sum, i) => sum + i.breakdown.tax_amount * i.quantity, 0)
  const finalGrandTotal = subtotal + totalTax + (orderMeta.shipping || 0) - (orderMeta.discount || 0)

  // Create offline order
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
      tax_amount: item.breakdown.tax_amount * item.quantity,
      metadata: {
        breakdown: item.breakdown,
        show_breakdown_to_customer: item.breakdown.show_breakdown_to_customer
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
    setCreateModalOpen(false)
    setOrderItems([])
    setSelectedCustomerId(null)
    setNewCustomer({ name: '', email: '', phone: '' })
    setShippingAddress({ full_name: '', line1: '', city: '', state: '', postal_code: '', country: 'IN', phone: '' })
    setOrderMeta({ shipping: 0, discount: 0, notes: '' })
    setTaxLines([{ tax_type: 'CGST', rate: 1.5 }, { tax_type: 'SGST', rate: 1.5 }])
    fetchOrders()
  }

  // ---- Download Invoice handler (enriched with product details) ----
  const handleDownloadInvoice = async (order) => {
    setDownloadingInvoice(true)
    try {
      // 1. Fetch organisation
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('slug', 'minal-gems')
        .single()

      // 2. Fetch full order with customer and invoice
      const { data: fullOrder } = await supabase
        .from('orders')
        .select('*, customers(name, email, phone), invoices(*)')
        .eq('id', order.id)
        .single()

      const invoice = fullOrder?.invoices?.[0]
      if (!invoice) {
        message.error('No invoice found for this order')
        setDownloadingInvoice(false)
        return
      }

      // 3. Fetch order items
      const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', order.id)

      // 4. Enrich each item with product details & diamonds
      const enrichedItems = await Promise.all(
        (items || []).map(async (item) => {
          const prodId = item.product_id
          if (!prodId) return item

          const [{ data: product }, { data: diamonds }] = await Promise.all([
            supabase.from('products').select('*').eq('id', prodId).maybeSingle(),  // .maybeSingle() instead of .single()
            supabase.from('product_diamonds').select('*').eq('product_id', prodId),
          ])

          return {
            ...item,
            product_details: {
              ...(product || {}),
              diamonds: diamonds || [],
            },
          }
        })
      )

      // 5. Fetch tax lines & payments
      const [{ data: taxLines }, { data: payments }] = await Promise.all([
        supabase.from('order_tax_lines').select('*').eq('order_id', order.id),
        supabase.from('order_payments').select('*').eq('order_id', order.id),
      ])

      // 6. Generate PDF
      generateInvoicePDF({
        organization: org,
        invoice: {
          ...invoice,
          customer_name: fullOrder.customers?.name,
          shipping_address: fullOrder.shipping_address,
          order_number: fullOrder.order_number,
          created_at: invoice.created_at,
        },
        items: enrichedItems,
        taxLines: taxLines || [],
        payments: payments || [],
      })

      message.success('Invoice PDF generated')
    } catch (err) {
      message.error('Failed to generate invoice')
      console.error(err)
    } finally {
      setDownloadingInvoice(false)
    }
  }

  const statusColors = {
    pending: 'gold', confirmed: 'blue', paid: 'green', processing: 'cyan',
    shipped: 'purple', delivered: 'green', cancelled: 'red', returned: 'orange'
  }

  // Responsive columns
  const columns = [
    {
      title: 'Order #',
      dataIndex: 'order_number',
      key: 'order_number',
      sorter: (a, b) => a.order_number.localeCompare(b.order_number),
      render: t => <strong>{t}</strong>,
    },
    {
      title: 'Customer',
      key: 'customer',
      responsive: ['sm'],
      render: (_, rec) => rec.customers?.name || rec.shipping_address?.full_name || '-',
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      responsive: ['md'],
      render: d => dayjs(d).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Items',
      dataIndex: 'total_items',
      key: 'total_items',
      responsive: ['md'],
    },
    {
      title: 'Total',
      dataIndex: 'grand_total',
      key: 'grand_total',
      sorter: (a, b) => a.grand_total - b.grand_total,
      render: v => `₹${v?.toLocaleString()}`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: s => <Tag color={statusColors[s]}>{s?.toUpperCase()}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => {
        const menu = {
          items: [
            { key: 'view', icon: <EyeOutlined />, label: 'View', onClick: () => navigate(`/orders/${record.id}`) },
            { key: 'invoice', icon: <FilePdfOutlined />, label: 'Download Invoice', onClick: () => handleDownloadInvoice(record) },
            { key: 'status', icon: <EditOutlined />, label: 'Update Status', onClick: () => { setSelectedOrder(record); setNewStatus(record.status); setStatusModalOpen(true) } },
            { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: () => { Modal.confirm({ title: 'Delete this order?', onOk: () => handleDelete(record.id) }) } },
          ],
        }
        return (
          <>
            <Space className="desktop-actions" style={{ display: 'none' }}>
              <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/orders/${record.id}`)}>View</Button>
              <Button icon={<FilePdfOutlined />} size="small" loading={downloadingInvoice} onClick={() => handleDownloadInvoice(record)}>Invoice</Button>
              <Button icon={<EditOutlined />} size="small" onClick={() => { setSelectedOrder(record); setNewStatus(record.status); setStatusModalOpen(true) }}>Status</Button>
              <Popconfirm title="Delete this order?" onConfirm={() => handleDelete(record.id)} okText="Yes">
                <Button danger icon={<DeleteOutlined />} size="small">Delete</Button>
              </Popconfirm>
            </Space>
            <Dropdown menu={menu} className="mobile-actions">
              <Button icon={<MoreOutlined />} size="small" />
            </Dropdown>
            <style jsx>{`
              @media (max-width: 575px) {
                .desktop-actions { display: none !important; }
                .mobile-actions { display: inline-block !important; }
              }
              @media (min-width: 576px) {
                .desktop-actions { display: inline-flex !important; }
                .mobile-actions { display: none !important; }
              }
            `}</style>
          </>
        )
      },
    },
  ]

  const filtered = orders.filter(o => {
    const t = searchText.toLowerCase()
    return (
      o.order_number?.toLowerCase().includes(t) ||
      o.customers?.name?.toLowerCase().includes(t) ||
      o.shipping_address?.full_name?.toLowerCase().includes(t)
    )
  })

  return (
    <div>
      {/* Header */}
      <Row justify="space-between" align="middle" gutter={[8, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Title level={3} style={{ margin: 0 }}>
            <OrderedListOutlined style={{ marginRight: 12 }} />Orders Management
          </Title>
        </Col>
        <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchOrders}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              Create Offline Order
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Search & Filter Card */}
      <Card
        title={
          <Space wrap style={{ width: '100%' }}>
            <Input
              placeholder="Search by order # or customer"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
              style={{ width: '100%', maxWidth: 280 }}
            />
            <Select placeholder="Status" allowClear style={{ width: 160 }} onChange={setStatusFilter}>
              <Option value="pending">Pending</Option>
              <Option value="confirmed">Confirmed</Option>
              <Option value="paid">Paid</Option>
              <Option value="processing">Processing</Option>
              <Option value="shipped">Shipped</Option>
              <Option value="delivered">Delivered</Option>
              <Option value="cancelled">Cancelled</Option>
              <Option value="returned">Returned</Option>
            </Select>
          </Space>
        }
        bodyStyle={{ padding: 0 }}
      >
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, responsive: true }}
          scroll={{ x: 'max-content' }}
          size="small"
        />
      </Card>

      {/* Status Modal */}
      <Modal
        title="Update Status"
        open={statusModalOpen}
        onOk={handleStatusUpdate}
        onCancel={() => setStatusModalOpen(false)}
        okText="Update"
        destroyOnClose
      >
        <p>Order: <strong>{selectedOrder?.order_number}</strong></p>
        <Select value={newStatus} onChange={setNewStatus} style={{ width: '100%' }}>
          <Option value="pending">Pending</Option>
          <Option value="confirmed">Confirmed</Option>
          <Option value="paid">Paid</Option>
          <Option value="processing">Processing</Option>
          <Option value="shipped">Shipped</Option>
          <Option value="delivered">Delivered</Option>
          <Option value="cancelled">Cancelled</Option>
          <Option value="returned">Returned</Option>
        </Select>
      </Modal>

      {/* Create Offline Order Modal */}
      <Modal
        title="Create Offline Order"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
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
                  {customers.map(c => (
                    <Option key={c.id} value={c.id}>{c.name}</Option>
                  ))}
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
              <Option
                key={p.id}
                value={p.id}
                label={`${p.item_no ? p.item_no + ' | ' : ''}${p.title} (SKU: ${p.sku})`}
              >
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
                    <Button danger size="small" onClick={() => removeProductFromOrder(item.product_id)}>
                      Remove
                    </Button>
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

                  <Col span={24}>
                    <Text strong>🏷️ Final Selling Price (before tax): ₹{item.unit_price?.toLocaleString()}</Text>
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
    </div>
  )
}