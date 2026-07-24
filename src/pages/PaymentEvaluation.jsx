import { useEffect, useState } from 'react'
import {
  Table, Button, Space, Card, Row, Col, Typography, message, Modal, Form,
  Input, InputNumber, DatePicker, Tag, Popconfirm, Dropdown, Tabs,
} from 'antd'
import {
  ReloadOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  DollarOutlined, AuditOutlined, MoreOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { TabPane } = Tabs   // Antd v5 still supports this, but we'll use items array

export default function PaymentEvaluation() {
  // ---- Settlements ----
  const [settlements, setSettlements] = useState([])
  const [settleLoading, setSettleLoading] = useState(false)
  const [settleModalOpen, setSettleModalOpen] = useState(false)
  const [editingSettle, setEditingSettle] = useState(null)
  const [settleForm] = Form.useForm()

  // ---- Gateway Logs ----
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logSearch, setLogSearch] = useState('')

  // Fetch settlements
  const fetchSettlements = async () => {
    setSettleLoading(true)
    const { data, error } = await supabase
      .from('payment_settlements')
      .select('*')
      .order('settlement_date', { ascending: false })

    if (error) {
      message.error('Failed to load settlements')
      setSettleLoading(false)
      return
    }
    setSettlements(data || [])
    setSettleLoading(false)
  }

  // Fetch gateway logs
  const fetchLogs = async () => {
    setLogsLoading(true)
    const { data, error } = await supabase
      .from('payment_gateway_logs')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      message.error('Failed to load gateway logs')
      setLogsLoading(false)
      return
    }
    setLogs(data || [])
    setLogsLoading(false)
  }

  useEffect(() => {
    fetchSettlements()
    fetchLogs()
  }, [])

  // ---- Settlement handlers ----
  const handleAddSettle = () => {
    setEditingSettle(null)
    settleForm.resetFields()
    setSettleModalOpen(true)
  }

  const handleEditSettle = (record) => {
    setEditingSettle(record)
    settleForm.setFieldsValue({
      provider: record.provider,
      settlement_date: record.settlement_date ? dayjs(record.settlement_date) : null,
      amount: record.amount,
      transaction_ids: (record.transaction_ids || []).join(', '),
      raw_file: record.raw_file ? JSON.stringify(record.raw_file, null, 2) : '',
    })
    setSettleModalOpen(true)
  }

  const handleDeleteSettle = async (id) => {
    const { error } = await supabase.from('payment_settlements').delete().eq('id', id)
    if (error) {
      message.error('Delete failed')
    } else {
      message.success('Settlement deleted')
      fetchSettlements()
    }
  }

  const handleSaveSettle = async () => {
    try {
      const values = await settleForm.validateFields()
      const payload = {
        provider: values.provider,
        settlement_date: values.settlement_date ? values.settlement_date.format('YYYY-MM-DD') : null,
        amount: values.amount,
        transaction_ids: values.transaction_ids
          ? values.transaction_ids.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        raw_file: values.raw_file ? (() => { try { return JSON.parse(values.raw_file) } catch { return values.raw_file } })() : null,
      }

      if (editingSettle) {
        const { error } = await supabase.from('payment_settlements').update(payload).eq('id', editingSettle.id)
        if (error) throw error
        message.success('Settlement updated')
      } else {
        const { error } = await supabase.from('payment_settlements').insert([payload])
        if (error) throw error
        message.success('Settlement added')
      }
      setSettleModalOpen(false)
      fetchSettlements()
    } catch (err) {
      message.error('Failed: ' + (err.message || 'Validation error'))
    }
  }

  // ---- Gateway Logs (read only) ----
  const logFiltered = logs.filter((log) => {
    const term = logSearch.toLowerCase()
    return (
      (log.event_type && log.event_type.toLowerCase().includes(term)) ||
      (log.status && log.status.toLowerCase().includes(term)) ||
      (log.payment_id && log.payment_id.includes(term))
    )
  })

  // ---- Columns ----
  const settleColumns = [
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
    },
    {
      title: 'Settlement Date',
      dataIndex: 'settlement_date',
      key: 'settlement_date',
      sorter: (a, b) => new Date(a.settlement_date) - new Date(b.settlement_date),
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      sorter: (a, b) => a.amount - b.amount,
      render: (v) => `₹${v?.toLocaleString()}`,
    },
    {
      title: 'Transaction IDs',
      dataIndex: 'transaction_ids',
      key: 'transaction_ids',
      render: (ids) => (ids || []).join(', ') || '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => {
        const menu = {
          items: [
            { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => handleEditSettle(record) },
            { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: () => { Modal.confirm({ title: 'Delete?', onOk: () => handleDeleteSettle(record.id) }) } },
          ],
        }
        return (
          <>
            <Space className="desktop-actions" style={{ display: 'none' }}>
              <Button icon={<EditOutlined />} size="small" onClick={() => handleEditSettle(record)}>Edit</Button>
              <Popconfirm title="Delete?" onConfirm={() => handleDeleteSettle(record.id)}>
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

  const logColumns = [
    {
      title: 'Payment ID',
      dataIndex: 'payment_id',
      key: 'payment_id',
      ellipsis: true,
    },
    {
      title: 'Event Type',
      dataIndex: 'event_type',
      key: 'event_type',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag>{s?.toUpperCase()}</Tag>,
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '-',
    },
    {
      title: 'Payload',
      dataIndex: 'payload',
      key: 'payload',
      ellipsis: true,
      render: (p) => p ? JSON.stringify(p).substring(0, 80) : '-',
    },
  ]

  // ---- Tabs ----
  const tabItems = [
    {
      key: 'settlements',
      label: 'Settlements',
      children: (
        <Card
          title="Payment Settlements"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddSettle}>
              Add Settlement
            </Button>
          }
        >
          <Table
            columns={settleColumns}
            dataSource={settlements}
            rowKey="id"
            loading={settleLoading}
            pagination={{ pageSize: 20, responsive: true }}
            scroll={{ x: 'max-content' }}
            size="small"
          />
        </Card>
      ),
    },
    {
      key: 'logs',
      label: 'Gateway Logs',
      children: (
        <Card
          title="Payment Gateway Logs"
          extra={
            <Input
              placeholder="Search logs..."
              prefix={<AuditOutlined />}
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              allowClear
              style={{ width: 240 }}
            />
          }
        >
          <Table
            columns={logColumns}
            dataSource={logFiltered}
            rowKey="id"
            loading={logsLoading}
            pagination={{ pageSize: 20, responsive: true }}
            scroll={{ x: 'max-content' }}
            size="small"
          />
        </Card>
      ),
    },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        <DollarOutlined style={{ marginRight: 12 }} />
        Payment Evaluation
      </Title>

      <Tabs defaultActiveKey="settlements" items={tabItems} />

      {/* Settlement Modal */}
      <Modal
        title={editingSettle ? 'Edit Settlement' : 'Add Settlement'}
        open={settleModalOpen}
        onOk={handleSaveSettle}
        onCancel={() => setSettleModalOpen(false)}
        okText={editingSettle ? 'Update' : 'Create'}
        destroyOnClose
        width={600}
      >
        <Form form={settleForm} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
                <Input placeholder="e.g., Razorpay, Bank" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="settlement_date" label="Settlement Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="transaction_ids" label="Transaction IDs (comma separated)">
            <Input.TextArea rows={2} placeholder="e.g., txn_abc123, txn_def456" />
          </Form.Item>
          <Form.Item name="raw_file" label="Raw File (JSON)">
            <Input.TextArea rows={4} placeholder='{"bank": "HDFC", "entries": [...]}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}