import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Card,
  Row,
  Col,
  Typography,
  Tag,
  Dropdown,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  TeamOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'

const { Title } = Typography

export default function Customers() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [form] = Form.useForm()

  const fetchCustomers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        customer_addresses ( id, line1, city, country, is_default_shipping, is_default_billing )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      message.error('Failed to load customers')
      setLoading(false)
      return
    }

    const enriched = data.map((cust) => {
      const defaultAddr =
        cust.customer_addresses?.find(
          (addr) => addr.is_default_shipping || addr.is_default_billing
        ) || cust.customer_addresses?.[0]
      return {
        ...cust,
        default_address: defaultAddr
          ? `${defaultAddr.line1}, ${defaultAddr.city}, ${defaultAddr.country}`
          : '-',
      }
    })

    setCustomers(enriched)
    setLoading(false)
  }

  useEffect(() => {
    fetchCustomers()
  }, [])

  const handleAdd = () => {
    setEditingId(null)
    form.resetFields()
    setModalOpen(true)
  }

  const handleEdit = (record) => {
    setEditingId(record.id)
    form.setFieldsValue({
      name: record.name,
      email: record.email,
      phone: record.phone,
      company: record.company,
      country: record.country,
      notes: record.notes,
    })
    setModalOpen(true)
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) {
      message.error('Delete failed')
    } else {
      message.success('Customer deleted')
      fetchCustomers()
    }
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    if (editingId) {
      const { error } = await supabase.from('customers').update(values).eq('id', editingId)
      if (error) return message.error('Update failed')
      message.success('Customer updated')
    } else {
      const { error } = await supabase.from('customers').insert([values])
      if (error) return message.error('Insert failed')
      message.success('Customer added')
    }
    setModalOpen(false)
    fetchCustomers()
  }

  const filteredData = customers.filter((c) => {
    const term = searchText.toLowerCase()
    return (
      (c.name && c.name.toLowerCase().includes(term)) ||
      (c.email && c.email.toLowerCase().includes(term)) ||
      (c.phone && c.phone.includes(term))
    )
  })

  // Columns with responsive visibility
  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      responsive: ['md'],              // hidden on small screens
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      responsive: ['sm'],              // hidden on extra-small screens
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      responsive: ['lg'],              // visible on large screens and up
      render: (val) => val || '-',
    },
    {
      title: 'Default Address',
      dataIndex: 'default_address',
      key: 'default_address',
      ellipsis: true,
      responsive: ['md'],              // visible on medium+ screens
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => {
        const menu = {
          items: [
            {
              key: 'manage',
              icon: <TeamOutlined />,
              label: 'Manage',
              onClick: () => navigate(`/customers/${record.id}`),
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
                  title: 'Delete this customer?',
                  onOk: () => handleDelete(record.id),
                })
              },
            },
          ],
        }

        return (
          <>
            <Space className="desktop-actions" style={{ display: 'none' }}>
              <Button type="link" onClick={() => navigate(`/customers/${record.id}`)}>
                Manage
              </Button>
              <Button
                icon={<EditOutlined />}
                size="small"
                onClick={() => handleEdit(record)}
              />
              <Popconfirm
                title="Delete this customer?"
                onConfirm={() => handleDelete(record.id)}
                okText="Yes"
                cancelText="No"
              >
                <Button danger icon={<DeleteOutlined />} size="small" />
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

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[8, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Title level={3} style={{ margin: 0 }}>
            <TeamOutlined style={{ marginRight: 12 }} />
            Customer Management
          </Title>
        </Col>
        <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchCustomers}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              Add Customer
            </Button>
          </Space>
        </Col>
      </Row>

      <Card
        title={
          <Input
            placeholder="Search by name, email or phone"
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

      <Modal
        title={editingId ? 'Edit Customer' : 'Add New Customer'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editingId ? 'Update' : 'Create'}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Full Name"
            rules={[{ required: true, message: 'Please enter name' }]}
          >
            <Input placeholder="Customer full name" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="email" label="Email">
                <Input placeholder="Email address" type="email" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="phone" label="Phone">
                <Input placeholder="Phone number" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="company" label="Company">
            <Input placeholder="Company name" />
          </Form.Item>
          <Form.Item name="country" label="Country">
            <Input placeholder="Country" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} placeholder="Internal notes" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}