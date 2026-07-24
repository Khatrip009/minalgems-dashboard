import { useEffect, useState } from 'react'
import {
  Table, Button, Space, Select, message, Tag, Input, Card, Row, Col, Typography,
  Modal, Form, InputNumber, DatePicker
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, DollarOutlined,
  PlusOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { checkAndMarkOrderPaid } from '../utilities/orderHelpers'  // ✅ added
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Option } = Select

export default function Payments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [orders, setOrders] = useState([])
  const [form] = Form.useForm()

  const fetchPayments = async () => {
    setLoading(true)
    let query = supabase
      .from('order_payments')
      .select(`
        *,
        orders ( order_number, grand_total, customers ( name ) )
      `)
      .order('created_at', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)

    const { data, error } = await query
    if (error) {
      message.error('Failed to load payments')
      setLoading(false)
      return
    }

    setPayments(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchPayments()
  }, [statusFilter])

  // Load orders for add payment modal
  useEffect(() => {
    supabase
      .from('orders')
      .select('id, order_number, grand_total, status')
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders(data || []))
  }, [])

  // ✅ Updated handleAddPayment
  const handleAddPayment = async () => {
    const values = await form.validateFields()
    const payload = {
      ...values,
      paid_at: values.paid_at ? values.paid_at.toISOString() : null,
      currency: 'INR'
    }

    const { error } = await supabase.from('order_payments').insert([payload])
    if (error) {
      message.error('Failed to add payment')
    } else {
      message.success('Payment added')

      // 🔥 Automatically check if order is now fully paid
      await checkAndMarkOrderPaid(values.order_id)

      setAddModalOpen(false)
      form.resetFields()
      fetchPayments()
    }
  }

  const statusColors = {
    pending: 'gold',
    completed: 'green',
    failed: 'red',
    refunded: 'purple',
    partially_refunded: 'orange'
  }

  const columns = [
    {
      title: 'Transaction ID',
      dataIndex: 'transaction_id',
      key: 'transaction_id',
      ellipsis: true,
      responsive: ['sm'],   // hidden on phones
      render: (text) => text || '-'
    },
    {
      title: 'Order #',
      key: 'order',
      render: (_, record) => (
        <span>{record.orders?.order_number || '-'}</span>
      )
    },
    {
      title: 'Customer',
      key: 'customer',
      responsive: ['md'],   // visible on medium+ screens
      render: (_, record) => record.orders?.customers?.name || '-'
    },
    {
      title: 'Method',
      dataIndex: 'payment_method',
      key: 'payment_method',
      responsive: ['lg'],   // visible on large+ screens
      render: (method) => <Tag>{method?.toUpperCase()}</Tag>
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      sorter: (a, b) => a.amount - b.amount,
      render: (v) => `₹${v?.toLocaleString()}`
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={statusColors[status]}>{status?.toUpperCase()}</Tag>
      )
    },
    {
      title: 'Date',
      dataIndex: 'paid_at',
      key: 'paid_at',
      sorter: (a, b) => new Date(a.paid_at) - new Date(b.paid_at),
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '-'
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      responsive: ['md'],   // hidden on small screens
      render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm')
    }
  ]

  const filtered = payments.filter(p => {
    const term = searchText.toLowerCase()
    return (
      p.transaction_id?.toLowerCase().includes(term) ||
      p.orders?.order_number?.toLowerCase().includes(term) ||
      p.orders?.customers?.name?.toLowerCase().includes(term)
    )
  })

  return (
    <div>
      {/* Header – stacks on mobile */}
      <Row justify="space-between" align="middle" gutter={[8, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Title level={3} style={{ margin: 0 }}>
            <DollarOutlined style={{ marginRight: 12 }} />
            Payments
          </Title>
        </Col>
        <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchPayments}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
              Add Payment
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Search & Filter Card */}
      <Card
        title={
          <Space wrap style={{ width: '100%' }}>
            <Input
              placeholder="Search by transaction ID, order # or customer"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ width: '100%', maxWidth: 320 }}
            />
            <Select
              placeholder="Filter by status"
              allowClear
              style={{ width: 200 }}
              onChange={setStatusFilter}
            >
              <Option value="pending">Pending</Option>
              <Option value="completed">Completed</Option>
              <Option value="failed">Failed</Option>
              <Option value="refunded">Refunded</Option>
              <Option value="partially_refunded">Partially Refunded</Option>
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
          pagination={{ pageSize: 20, showSizeChanger: true, responsive: true }}
          scroll={{ x: 'max-content' }}
          size="small"
        />
      </Card>

      {/* Add Payment Modal – form already vertical, fully responsive */}
      <Modal
        title="Add New Payment"
        open={addModalOpen}
        onOk={handleAddPayment}
        onCancel={() => setAddModalOpen(false)}
        okText="Add Payment"
        destroyOnClose
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="order_id"
            label="Order"
            rules={[{ required: true, message: 'Please select an order' }]}
          >
            <Select
              showSearch
              placeholder="Select order"
              optionFilterProp="children"
            >
              {orders.map((o) => (
                <Option key={o.id} value={o.id}>
                  {o.order_number} – ₹{o.grand_total?.toLocaleString()} ({o.status})
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="payment_method"
            label="Payment Method"
            rules={[{ required: true }]}
          >
            <Select>
              <Option value="razorpay">Razorpay</Option>
              <Option value="bank_transfer">Bank Transfer</Option>
              <Option value="cash">Cash</Option>
              <Option value="cheque">Cheque</Option>
              <Option value="other">Other</Option>
            </Select>
          </Form.Item>
          <Form.Item name="transaction_id" label="Transaction ID">
            <Input />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Amount"
            rules={[{ required: true, message: 'Please enter amount' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="Status" initialValue="completed">
            <Select>
              <Option value="pending">Pending</Option>
              <Option value="completed">Completed</Option>
              <Option value="failed">Failed</Option>
            </Select>
          </Form.Item>
          <Form.Item name="paid_at" label="Payment Date">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}