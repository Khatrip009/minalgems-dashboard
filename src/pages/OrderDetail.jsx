import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Row, Col, Typography, Descriptions, Table, Tag, Space, Button,
  Divider, message, Modal, Form, Input, InputNumber, Select, DatePicker, Popconfirm,
  Dropdown
} from 'antd'
import {
  ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined,
  MoreOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Option } = Select

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [orderItems, setOrderItems] = useState([])
  const [payments, setPayments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [taxLines, setTaxLines] = useState([])
  const [shipments, setShipments] = useState([])
  const [loading, setLoading] = useState(true)

  // Edit mode flags
  const [editItems, setEditItems] = useState(false)
  const [editedItems, setEditedItems] = useState([])
  const [products, setProducts] = useState([])

  const [paymentModal, setPaymentModal] = useState(false)
  const [shipmentModal, setShipmentModal] = useState(false)

  // Fetch all data
  const fetchOrder = async () => {
    try {
      const { data: orderData } = await supabase
        .from('orders')
        .select(`*, customers ( name, email, phone )`)
        .eq('id', id)
        .single()
      if (!orderData) { message.error('Order not found'); navigate('/orders'); return }
      setOrder(orderData)
      const [itemsRes, pmtsRes, invsRes, taxesRes, shpsRes] = await Promise.all([
        supabase.from('order_items').select('*').eq('order_id', id),
        supabase.from('order_payments').select('*').eq('order_id', id).order('created_at', { ascending: false }),
        supabase.from('invoices').select('*').eq('order_id', id),
        supabase.from('order_tax_lines').select('*').eq('order_id', id),
        supabase.from('shipments').select('*').eq('order_id', id)
      ])
      setOrderItems(itemsRes.data || [])
      setPayments(pmtsRes.data || [])
      setInvoices(invsRes.data || [])
      setTaxLines(taxesRes.data || [])
      setShipments(shpsRes.data || [])
      setEditedItems(JSON.parse(JSON.stringify(itemsRes.data || [])))
    } catch (err) {
      message.error('Failed to load order')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrder()
    supabase.from('products').select('id, title, sku, price').then(({ data }) => setProducts(data || []))
  }, [id])

  // Edit items handlers
  const handleSaveItems = async () => {
    // Delete all existing items and re-insert
    await supabase.from('order_items').delete().eq('order_id', id)
    const itemsToInsert = editedItems.map(item => ({
      order_id: id,
      product_id: item.product_id,
      product_title: item.product_title,
      product_sku: item.product_sku,
      product_slug: item.product_slug || '',
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.quantity * item.unit_price,
      currency: 'INR',
      discount_amount: item.discount_amount || 0,
      tax_amount: item.tax_amount || 0,
      metadata: item.metadata || {}
    }))
    await supabase.from('order_items').insert(itemsToInsert)
    // Recalculate order totals
    const newSubtotal = editedItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0)
    await supabase.from('orders').update({
      subtotal: newSubtotal,
      grand_total: newSubtotal + (order.tax_amount || 0) + (order.shipping_cost || 0) - (order.discount_amount || 0)
    }).eq('id', id)
    message.success('Items updated')
    setEditItems(false)
    fetchOrder()
  }

  const addItem = (productId) => {
    const prod = products.find(p => p.id === productId)
    if (!prod) return
    setEditedItems([...editedItems, {
      product_id: prod.id,
      product_title: prod.title,
      product_sku: prod.sku,
      product_slug: '',
      quantity: 1,
      unit_price: prod.price,
      discount_amount: 0,
      tax_amount: 0,
      metadata: {}
    }])
  }

  const removeItem = (index) => setEditedItems(editedItems.filter((_, i) => i !== index))

  const updateItemField = (index, field, value) => {
    const items = [...editedItems]
    items[index][field] = value
    setEditedItems(items)
  }

  // Add payment
  const handleAddPayment = async (values) => {
    const { error } = await supabase.from('order_payments').insert([{ ...values, order_id: id }])
    if (error) message.error('Failed to add payment')
    else { message.success('Payment added'); setPaymentModal(false); fetchOrder() }
  }

  // Add shipment
  const handleAddShipment = async (values) => {
    const { error } = await supabase.from('shipments').insert([{ ...values, order_id: id }])
    if (error) message.error('Failed to add shipment')
    else { message.success('Shipment added'); setShipmentModal(false); fetchOrder() }
  }

  // Item table columns (responsive: hide SKU on small)
  const itemColumns = [
    { title: 'Product', dataIndex: 'product_title', key: 'product_title' },
    { title: 'SKU', dataIndex: 'product_sku', key: 'product_sku', responsive: ['sm'] },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity' },
    { title: 'Unit Price', dataIndex: 'unit_price', key: 'unit_price', render: v => `₹${v?.toLocaleString()}` },
    { title: 'Total', dataIndex: 'total_price', key: 'total_price', render: v => `₹${v?.toLocaleString()}` },
  ]

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}>Loading…</div>

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/orders')} type="link" style={{ marginBottom: 16, paddingLeft: 0 }}>
        Back to Orders
      </Button>

      {order && (
        <>
          {/* Order summary card */}
          <Card
            title={<Title level={4} style={{ margin: 0 }}>Order {order.order_number}</Title>}
            extra={
              <Space wrap>
                <Tag color="blue">{order.status?.toUpperCase()}</Tag>
                <Button icon={<EditOutlined />} onClick={() => setEditItems(!editItems)}>
                  {editItems ? 'Cancel Edit' : 'Edit Items'}
                </Button>
              </Space>
            }
            style={{ marginBottom: 24 }}
          >
            <Descriptions bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="Customer">{order.customers?.name || order.shipping_address?.full_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Email">{order.customers?.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">₹{order.subtotal?.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Tax">₹{order.tax_amount?.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Discount">₹{order.discount_amount?.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Shipping">₹{order.shipping_cost?.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Grand Total" span={2}>
                <Text strong style={{ fontSize: 18, color: '#B8860B' }}>
                  ₹{order.grand_total?.toLocaleString()}
                </Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Order Items Card */}
          <Card
            title="Order Items"
            extra={
              editItems && (
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveItems}>
                  Save Items
                </Button>
              )
            }
            style={{ marginBottom: 24 }}
          >
            {editItems ? (
              <>
                <Select
                  showSearch
                  placeholder="Add product"
                  onSelect={addItem}
                  style={{ width: '100%', maxWidth: 300, marginBottom: 16 }}
                  optionFilterProp="children"
                >
                  {products.map(p => (
                    <Option key={p.id} value={p.id}>{p.title} (₹{p.price})</Option>
                  ))}
                </Select>

                {editedItems.map((item, idx) => (
                  <Row gutter={[8, 8]} key={idx} style={{ marginBottom: 12 }}>
                    {/* On mobile stack each field full width */}
                    <Col xs={24} sm={8}>
                      <Input
                        value={item.product_title}
                        onChange={e => updateItemField(idx, 'product_title', e.target.value)}
                        placeholder="Title"
                      />
                    </Col>
                    <Col xs={12} sm={4}>
                      <InputNumber
                        value={item.quantity}
                        min={1}
                        onChange={val => updateItemField(idx, 'quantity', val)}
                        style={{ width: '100%' }}
                        placeholder="Qty"
                      />
                    </Col>
                    <Col xs={12} sm={4}>
                      <InputNumber
                        value={item.unit_price}
                        min={0}
                        onChange={val => updateItemField(idx, 'unit_price', val)}
                        style={{ width: '100%' }}
                        placeholder="Price"
                      />
                    </Col>
                    <Col xs={16} sm={6}>
                      <Text strong>₹{(item.quantity * item.unit_price).toLocaleString()}</Text>
                    </Col>
                    <Col xs={8} sm={2}>
                      <Button danger size="small" onClick={() => removeItem(idx)} block>
                        Remove
                      </Button>
                    </Col>
                  </Row>
                ))}
              </>
            ) : (
              <Table
                columns={itemColumns}
                dataSource={orderItems}
                rowKey="id"
                pagination={false}
                scroll={{ x: 'max-content' }}
                size="small"
              />
            )}
          </Card>

          {/* Payments Card */}
          <Card
            title="Payments"
            extra={
              <Button icon={<PlusOutlined />} onClick={() => setPaymentModal(true)}>
                Add Payment
              </Button>
            }
            style={{ marginBottom: 24 }}
          >
            <Table
              dataSource={payments}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              size="small"
            >
              <Table.Column title="Method" dataIndex="payment_method" />
              <Table.Column title="Transaction ID" dataIndex="transaction_id" ellipsis responsive={['sm']} />
              <Table.Column title="Amount" dataIndex="amount" render={v => `₹${v?.toLocaleString()}`} />
              <Table.Column title="Status" dataIndex="status" render={s => <Tag>{s?.toUpperCase()}</Tag>} />
              <Table.Column title="Date" dataIndex="paid_at" render={d => d ? dayjs(d).format('DD/MM/YYYY') : '-'} responsive={['md']} />
            </Table>
          </Card>

          {/* Shipments Card */}
          <Card
            title="Shipments"
            extra={
              <Button icon={<PlusOutlined />} onClick={() => setShipmentModal(true)}>
                Add Shipment
              </Button>
            }
          >
            <Table
              dataSource={shipments}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              size="small"
            >
              <Table.Column title="Carrier" dataIndex="carrier" />
              <Table.Column title="Tracking #" dataIndex="tracking_number" responsive={['sm']} />
              <Table.Column title="Status" dataIndex="status" render={s => <Tag>{s?.toUpperCase()}</Tag>} />
              <Table.Column title="Shipped" dataIndex="shipped_at" render={d => d ? dayjs(d).format('DD/MM/YYYY') : '-'} responsive={['md']} />
            </Table>
          </Card>
        </>
      )}

      {/* Payment Modal – fields stack on mobile */}
      <Modal
        title="Add Payment"
        open={paymentModal}
        onCancel={() => setPaymentModal(false)}
        onOk={() => document.getElementById('payment-form').requestSubmit()}
        destroyOnClose
      >
        <Form id="payment-form" layout="vertical" onFinish={handleAddPayment}>
          <Form.Item name="payment_method" label="Method" rules={[{ required: true }]}>
            <Select>
              <Option value="razorpay">Razorpay</Option>
              <Option value="bank_transfer">Bank Transfer</Option>
              <Option value="cash">Cash</Option>
            </Select>
          </Form.Item>
          <Form.Item name="transaction_id" label="Transaction ID">
            <Input />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="Status" initialValue="completed">
            <Select>
              <Option value="completed">Completed</Option>
              <Option value="pending">Pending</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Shipment Modal – fields stack on mobile */}
      <Modal
        title="Add Shipment"
        open={shipmentModal}
        onCancel={() => setShipmentModal(false)}
        onOk={() => document.getElementById('shipment-form').requestSubmit()}
        destroyOnClose
      >
        <Form id="shipment-form" layout="vertical" onFinish={handleAddShipment}>
          <Form.Item name="carrier" label="Carrier">
            <Input />
          </Form.Item>
          <Form.Item name="tracking_number" label="Tracking Number">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="Status" initialValue="shipped">
            <Select>
              <Option value="pending">Pending</Option>
              <Option value="shipped">Shipped</Option>
              <Option value="delivered">Delivered</Option>
            </Select>
          </Form.Item>
          <Form.Item name="shipped_at" label="Shipped Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}