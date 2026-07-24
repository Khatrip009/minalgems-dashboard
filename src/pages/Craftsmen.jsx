import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Checkbox,
  message,
  Popconfirm,
  Tag,
  Tooltip,
  Typography,
  Card,
  Row,
  Col,
  Dropdown,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  DollarOutlined,
  GoldOutlined,
  ToolOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'

const { Title } = Typography

export default function Craftsmen() {
  const [craftsmen, setCraftsmen] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [form] = Form.useForm()
  const navigate = useNavigate()

  // Fetch craftsmen with gold & labour balances
  const fetchCraftsmen = async () => {
    setLoading(true)
    const { data: crafts, error } = await supabase
      .from('craftsmen')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      message.error('Failed to fetch craftsmen')
      setLoading(false)
      return
    }

    const enriched = await Promise.all(
      crafts.map(async (c) => {
        const [issues, returns, consumptions, payments] = await Promise.all([
          supabase.from('craftsman_gold_issues').select('quantity_24kt').eq('craftsman_id', c.id),
          supabase.from('craftsman_gold_returns').select('quantity_24kt').eq('craftsman_id', c.id),
          supabase.from('craftsman_gold_consumptions').select('final_gold_24kt, labour_amount').eq('craftsman_id', c.id),
          supabase.from('craftsman_cash_payments').select('amount').eq('craftsman_id', c.id),
        ])

        const totalIssued = (issues.data || []).reduce((sum, r) => sum + Number(r.quantity_24kt), 0)
        const totalReturned = (returns.data || []).reduce((sum, r) => sum + Number(r.quantity_24kt), 0)
        const totalConsumed = (consumptions.data || []).reduce((sum, r) => sum + Number(r.final_gold_24kt), 0)
        const totalLabour = (consumptions.data || []).reduce((sum, r) => sum + Number(r.labour_amount), 0)
        const totalPaid = (payments.data || []).reduce((sum, r) => sum + Number(r.amount), 0)

        return {
          ...c,
          gold_balance: totalIssued - totalReturned - totalConsumed,
          labour_balance: totalLabour - totalPaid,
        }
      })
    )

    setCraftsmen(enriched)
    setLoading(false)
  }

  useEffect(() => {
    fetchCraftsmen()
  }, [])

  // Open modal for adding
  const handleAdd = () => {
    setEditingId(null)
    form.resetFields()
    setModalOpen(true)
  }

  // Open modal for editing
  const handleEdit = (record) => {
    setEditingId(record.id)
    form.setFieldsValue(record)
    setModalOpen(true)
  }

  // Delete craftsman
  const handleDelete = async (id) => {
    const { error } = await supabase.from('craftsmen').delete().eq('id', id)
    if (error) {
      message.error('Delete failed: ' + error.message)
    } else {
      message.success('Craftsman deleted')
      fetchCraftsmen()
    }
  }

  // Submit form (add or update)
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingId) {
        const { error } = await supabase.from('craftsmen').update(values).eq('id', editingId)
        if (error) throw error
        message.success('Craftsman updated')
      } else {
        const { error } = await supabase.from('craftsmen').insert([values])
        if (error) throw error
        message.success('Craftsman added')
      }
      setModalOpen(false)
      form.resetFields()
      fetchCraftsmen()
    } catch (err) {
      message.error(err.message || 'Validation failed')
    }
  }

  // Filter by search text
  const filteredData = craftsmen.filter((c) => {
    const term = searchText.toLowerCase()
    return (
      (c.name && c.name.toLowerCase().includes(term)) ||
      (c.code && c.code.toLowerCase().includes(term)) ||
      (c.contact?.phone && c.contact.phone.includes(term))
    )
  })

  // Columns definition with responsive visibility
  const columns = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      responsive: ['sm'],                // hidden on extra‑small screens
      sorter: (a, b) => (a.code || '').localeCompare(b.code || ''),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: 'Contact',
      key: 'contact',
      responsive: ['md'],                // hidden on small devices
      render: (_, record) => {
        const contact = record.contact || {}
        return (
          <Space direction="vertical" size={0}>
            {contact.phone && <span>{contact.phone}</span>}
            {contact.email && <span style={{ color: '#888' }}>{contact.email}</span>}
            {!contact.phone && !contact.email && '-'}
          </Space>
        )
      },
    },
    {
      title: 'Gold Balance',
      dataIndex: 'gold_balance',
      key: 'gold_balance',
      sorter: (a, b) => a.gold_balance - b.gold_balance,
      render: (val) => (
        <Tooltip title="Issued - Returned - Consumed">
          <Tag color={val > 0 ? 'orange' : 'green'}>
            <GoldOutlined /> {val?.toFixed(3)} g
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: 'Labour Balance',
      dataIndex: 'labour_balance',
      key: 'labour_balance',
      responsive: ['md'],                // still visible on tablets, hidden on very small
      sorter: (a, b) => a.labour_balance - b.labour_balance,
      render: (val) => (
        <Tooltip title="Labour charged - Cash paid">
          <Tag color={val > 0 ? 'blue' : 'green'}>
            <DollarOutlined /> ₹{val?.toFixed(2)}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: 'In‑House',
      dataIndex: 'is_inhouse',
      key: 'is_inhouse',
      responsive: ['lg'],                // visible on large screens and above
      render: (val) => (val ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => {
        // Dropdown menu items for mobile
        const menu = {
          items: [
            {
              key: 'manage',
              icon: <ToolOutlined />,
              label: 'Manage',
              onClick: () => navigate(`/craftsmen/${record.id}`),
            },
            {
              key: 'edit',
              icon: <EditOutlined />,
              label: 'Edit',
              onClick: () => handleEdit(record),
            },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              label: 'Delete',
              danger: true,
              onClick: () => {
                Modal.confirm({
                  title: 'Delete this craftsman?',
                  onOk: () => handleDelete(record.id),
                })
              },
            },
          ],
        }

        return (
          <>
            {/* Desktop buttons */}
            <Space className="desktop-actions" style={{ display: 'none' }}>
              <Button type="link" onClick={() => navigate(`/craftsmen/${record.id}`)}>
                Manage
              </Button>
              <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)}>
                Edit
              </Button>
              <Popconfirm title="Delete?" onConfirm={() => handleDelete(record.id)}>
                <Button danger icon={<DeleteOutlined />} size="small">
                  Delete
                </Button>
              </Popconfirm>
            </Space>

            {/* Mobile dropdown */}
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

  return (
    <div>
      {/* Header – stacks on mobile */}
      <Row justify="space-between" align="middle" gutter={[8, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Title level={3} style={{ margin: 0 }}>
            <ToolOutlined style={{ marginRight: 12 }} />
            Craftsman Management
          </Title>
        </Col>
        <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchCraftsmen}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              Add Craftsman
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Search & Table Card */}
      <Card
        title={
          <Input
            placeholder="Search by name, code or phone"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: '100%', maxWidth: 320 }}
          />
        }
        bodyStyle={{ padding: 0 }}
      >
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true, responsive: true }}
          scroll={{ x: 'max-content' }}
          size="small"
        />
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        title={editingId ? 'Edit Craftsman' : 'Add New Craftsman'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editingId ? 'Update' : 'Create'}
        width={640}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ is_inhouse: false, contact: {} }}
        >
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="code"
                label="Code"
                rules={[{ required: true, message: 'Please enter code' }]}
              >
                <Input placeholder="e.g. CRF-001" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="name"
                label="Name"
                rules={[{ required: true, message: 'Please enter name' }]}
              >
                <Input placeholder="Full name" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name={['contact', 'phone']}
                label="Phone"
              >
                <Input placeholder="Phone number" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name={['contact', 'email']}
                label="Email"
              >
                <Input placeholder="Email address" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name={['contact', 'address']}
            label="Address"
          >
            <Input.TextArea rows={2} placeholder="Full address" />
          </Form.Item>

          <Form.Item
            name="is_inhouse"
            valuePropName="checked"
          >
            <Checkbox>In‑House Craftsman</Checkbox>
          </Form.Item>

          <Form.Item
            name={['kyc', 'pan']}
            label="PAN Number"
          >
            <Input placeholder="PAN" />
          </Form.Item>
          <Form.Item
            name={['kyc', 'aadhar']}
            label="Aadhar Number"
          >
            <Input placeholder="Aadhar" />
          </Form.Item>
          <Form.Item
            name={['kyc', 'bank_account']}
            label="Bank Account"
          >
            <Input placeholder="Account number" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}