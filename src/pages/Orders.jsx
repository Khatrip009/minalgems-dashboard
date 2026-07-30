import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Space, Select, message, Tag, Input, Card, Row, Col, Typography,
  Modal, Popconfirm, Dropdown,
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
import CreateOrderModal from '../components/CreateOrderModal'

const { Title, Text } = Typography
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

  // Create order modal open state
  const [createModalOpen, setCreateModalOpen] = useState(false)

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
            supabase.from('products').select('*').eq('id', prodId).maybeSingle(),
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

      {/* Create Offline Order Modal Component */}
      <CreateOrderModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={fetchOrders}
        user={user}
      />
    </div>
  )
}