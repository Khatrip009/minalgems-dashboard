import { useEffect, useState } from 'react'
import {
  Table, Button, Space, Select, message, Tag, Input, Card, Row, Col, Typography,
  Modal, Form, DatePicker, Popconfirm, Dropdown, Timeline, Descriptions, Drawer,
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, EditOutlined, EyeOutlined,
  SwapOutlined, MoreOutlined, ClockCircleOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Option } = Select

export default function Returns() {
  const [returns, setReturns] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)
  const [typeFilter, setTypeFilter] = useState(null)

  // Status update modal
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState(null)
  const [newStatus, setNewStatus] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [statusForm] = Form.useForm()

  // Detail drawer
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [detailReturn, setDetailReturn] = useState(null)
  const [events, setEvents] = useState([])

  // Fetch returns with related order and customer info
  const fetchReturns = async () => {
    setLoading(true)
    let query = supabase
      .from('returns')
      .select(`
        *,
        orders ( order_number, grand_total, customers ( name ) ),
        order_items ( product_title, product_sku ),
        invoices ( invoice_number ),
        order_payments ( payment_method, transaction_id )
      `)
      .order('created_at', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)
    if (typeFilter) query = query.eq('type', typeFilter)

    const { data, error } = await query
    if (error) {
      message.error('Failed to load returns')
      setLoading(false)
      return
    }
    setReturns(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchReturns()
  }, [statusFilter, typeFilter])

  // Status update with event log
  const handleStatusUpdate = async () => {
    if (!newStatus || !selectedReturn) return

    const { error } = await supabase
      .from('returns')
      .update({ status: newStatus })
      .eq('id', selectedReturn.id)

    if (error) {
      message.error('Update failed')
      return
    }

    // Add event log
    if (statusNote) {
      await supabase.from('return_events').insert([{
        return_id: selectedReturn.id,
        event_type: newStatus,
        notes: statusNote,
      }])
    }

    message.success('Return status updated')
    setStatusModalOpen(false)
    setStatusNote('')
    fetchReturns()
  }

  // Open detail drawer and fetch events
  const handleViewDetail = async (record) => {
    setDetailReturn(record)
    setDetailDrawerOpen(true)

    const { data: eventData } = await supabase
      .from('return_events')
      .select('*')
      .eq('return_id', record.id)
      .order('created_at', { ascending: true })

    setEvents(eventData || [])
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('returns').delete().eq('id', id)
    if (error) message.error('Delete failed')
    else { message.success('Return deleted'); fetchReturns() }
  }

  const statusColors = {
    requested: 'gold',
    approved: 'blue',
    rejected: 'red',
    received: 'cyan',
    inspected: 'purple',
    refunded: 'green',
    completed: 'green',
    cancelled: 'default',
  }

  const typeColors = {
    return: 'orange',
    exchange: 'purple',
    repair: 'cyan',
  }

  const columns = [
    {
      title: 'Return ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      responsive: ['md'],
      render: (id) => id?.substring(0, 8),
    },
    {
      title: 'Order #',
      key: 'order',
      render: (_, rec) => rec.orders?.order_number || '-',
    },
    {
      title: 'Customer',
      key: 'customer',
      responsive: ['sm'],
      render: (_, rec) => rec.orders?.customers?.name || '-',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      filters: [
        { text: 'Return', value: 'return' },
        { text: 'Exchange', value: 'exchange' },
        { text: 'Repair', value: 'repair' },
      ],
      render: (v) => <Tag color={typeColors[v]}>{v?.toUpperCase()}</Tag>,
    },
    {
      title: 'Reason',
      dataIndex: 'reason_code',
      key: 'reason_code',
      responsive: ['md'],
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={statusColors[s]}>{s?.toUpperCase()}</Tag>,
    },
    {
      title: 'Refund Amt',
      dataIndex: 'refund_amount',
      key: 'refund_amount',
      responsive: ['lg'],
      render: (v) => v ? `₹${v.toLocaleString()}` : '-',
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      responsive: ['md'],
      render: (d) => dayjs(d).format('DD/MM/YYYY'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => {
        const menu = {
          items: [
            {
              key: 'view',
              icon: <EyeOutlined />,
              label: 'View Details',
              onClick: () => handleViewDetail(record),
            },
            {
              key: 'status',
              icon: <EditOutlined />,
              label: 'Update Status',
              onClick: () => {
                setSelectedReturn(record)
                setNewStatus(record.status)
                setStatusNote('')
                setStatusModalOpen(true)
              },
            },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              label: 'Delete',
              danger: true,
              onClick: () => {
                Modal.confirm({
                  title: 'Delete this return?',
                  onOk: () => handleDelete(record.id),
                })
              },
            },
          ],
        }

        return (
          <>
            <Space className="desktop-actions" style={{ display: 'none' }}>
              <Button
                icon={<EyeOutlined />}
                size="small"
                onClick={() => handleViewDetail(record)}
              >
                View
              </Button>
              <Button
                icon={<EditOutlined />}
                size="small"
                onClick={() => {
                  setSelectedReturn(record)
                  setNewStatus(record.status)
                  setStatusNote('')
                  setStatusModalOpen(true)
                }}
              >
                Status
              </Button>
              <Popconfirm
                title="Delete this return?"
                onConfirm={() => handleDelete(record.id)}
                okText="Yes"
                cancelText="No"
              >
                <Button danger icon={<DeleteOutlined />} size="small">
                  Delete
                </Button>
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

  const filtered = returns.filter((r) => {
    const term = searchText.toLowerCase()
    return (
      r.id?.toLowerCase().includes(term) ||
      r.orders?.order_number?.toLowerCase().includes(term) ||
      r.orders?.customers?.name?.toLowerCase().includes(term) ||
      r.reason_code?.toLowerCase().includes(term)
    )
  })

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[8, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Title level={3} style={{ margin: 0 }}>
            <SwapOutlined style={{ marginRight: 12 }} />
            Returns & Refunds
          </Title>
        </Col>
        <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchReturns}>
              Refresh
            </Button>
          </Space>
        </Col>
      </Row>

      <Card
        title={
          <Space wrap style={{ width: '100%' }}>
            <Input
              placeholder="Search by order #, customer, reason..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ width: '100%', maxWidth: 300 }}
            />
            <Select
              placeholder="Status"
              allowClear
              style={{ width: 150 }}
              onChange={setStatusFilter}
            >
              <Option value="requested">Requested</Option>
              <Option value="approved">Approved</Option>
              <Option value="rejected">Rejected</Option>
              <Option value="received">Received</Option>
              <Option value="inspected">Inspected</Option>
              <Option value="refunded">Refunded</Option>
              <Option value="completed">Completed</Option>
              <Option value="cancelled">Cancelled</Option>
            </Select>
            <Select
              placeholder="Type"
              allowClear
              style={{ width: 130 }}
              onChange={setTypeFilter}
            >
              <Option value="return">Return</Option>
              <Option value="exchange">Exchange</Option>
              <Option value="repair">Repair</Option>
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

      {/* Status Update Modal */}
      <Modal
        title="Update Return Status"
        open={statusModalOpen}
        onOk={handleStatusUpdate}
        onCancel={() => setStatusModalOpen(false)}
        okText="Update"
        destroyOnClose
      >
        <p>
          Return ID: <strong>{selectedReturn?.id?.substring(0, 8)}</strong>
        </p>
        <Form form={statusForm} layout="vertical">
          <Form.Item label="New Status">
            <Select value={newStatus} onChange={setNewStatus} style={{ width: '100%' }}>
              <Option value="requested">Requested</Option>
              <Option value="approved">Approved</Option>
              <Option value="rejected">Rejected</Option>
              <Option value="received">Received</Option>
              <Option value="inspected">Inspected</Option>
              <Option value="refunded">Refunded</Option>
              <Option value="completed">Completed</Option>
              <Option value="cancelled">Cancelled</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Note (optional)">
            <Input.TextArea
              rows={2}
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder="Add a note for this status change"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail Drawer */}
      <Drawer
        title="Return Details"
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        width={480}
      >
        {detailReturn && (
          <>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 24 }}>
              <Descriptions.Item label="Return ID">
                {detailReturn.id.substring(0, 8)}
              </Descriptions.Item>
              <Descriptions.Item label="Order #">
                {detailReturn.orders?.order_number}
              </Descriptions.Item>
              <Descriptions.Item label="Customer">
                {detailReturn.orders?.customers?.name}
              </Descriptions.Item>
              <Descriptions.Item label="Product">
                {detailReturn.order_items?.product_title}
              </Descriptions.Item>
              <Descriptions.Item label="Type">
                <Tag color={typeColors[detailReturn.type]}>
                  {detailReturn.type?.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Reason Code">
                {detailReturn.reason_code}
              </Descriptions.Item>
              <Descriptions.Item label="Reason Notes">
                {detailReturn.reason_notes || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={statusColors[detailReturn.status]}>
                  {detailReturn.status?.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Refund Amount">
                {detailReturn.refund_amount
                  ? `₹${detailReturn.refund_amount.toLocaleString()}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Invoice">
                {detailReturn.invoices?.invoice_number || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Payment Method">
                {detailReturn.order_payments?.payment_method || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Requested Date">
                {dayjs(detailReturn.created_at).format('DD/MM/YYYY HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            <Title level={5}>
              <ClockCircleOutlined style={{ marginRight: 8 }} />
              Event Timeline
            </Title>
            {events.length > 0 ? (
              <Timeline
                items={events.map((event) => ({
                  children: (
                    <div>
                      <Text strong>{event.event_type?.toUpperCase()}</Text>
                      <br />
                      <Text type="secondary">{event.notes || '-'}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(event.created_at).format('DD/MM/YYYY HH:mm')}
                      </Text>
                    </div>
                  ),
                }))}
              />
            ) : (
              <Text type="secondary">No events recorded</Text>
            )}
          </>
        )}
      </Drawer>
    </div>
  )
}