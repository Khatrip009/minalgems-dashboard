import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Typography,
  Descriptions,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Checkbox,
  Space,
  message,
  Popconfirm,
  Dropdown,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  SaveOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'

const { Title } = Typography

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(false)
  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [addressForm] = Form.useForm()
  const [editCustomerForm] = Form.useForm()
  const [customerEditMode, setCustomerEditMode] = useState(false)

  const fetchCustomer = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()
    setCustomer(data)
    if (data) {
      editCustomerForm.setFieldsValue(data)
    }
  }

  const fetchAddresses = async () => {
    const { data } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
    setAddresses(data || [])
  }

  useEffect(() => {
    fetchCustomer()
    fetchAddresses()
  }, [id])

  const handleSaveCustomer = async () => {
    const values = await editCustomerForm.validateFields()
    const { error } = await supabase.from('customers').update(values).eq('id', id)
    if (error) return message.error('Update failed')
    message.success('Customer updated')
    setCustomerEditMode(false)
    fetchCustomer()
  }

  // Address management
  const openAddAddress = () => {
    setEditingAddressId(null)
    addressForm.resetFields()
    setAddressModalOpen(true)
  }

  const openEditAddress = (record) => {
    setEditingAddressId(record.id)
    addressForm.setFieldsValue(record)
    setAddressModalOpen(true)
  }

  const deleteAddress = async (addressId) => {
    const { error } = await supabase
      .from('customer_addresses')
      .delete()
      .eq('id', addressId)
    if (error) return message.error('Delete failed')
    message.success('Address deleted')
    fetchAddresses()
  }

  const handleAddressSubmit = async () => {
    const values = await addressForm.validateFields()
    const payload = {
      ...values,
      customer_id: id,
    }

    if (editingAddressId) {
      const { error } = await supabase
        .from('customer_addresses')
        .update(payload)
        .eq('id', editingAddressId)
      if (error) return message.error('Update failed')
      message.success('Address updated')
    } else {
      const { error } = await supabase
        .from('customer_addresses')
        .insert([payload])
      if (error) return message.error('Insert failed')
      message.success('Address added')
    }
    setAddressModalOpen(false)
    fetchAddresses()
  }

  // Address table columns with responsive visibility
  const addressColumns = [
    {
      title: 'Label',
      dataIndex: 'label',
      key: 'label',
      responsive: ['sm'],                      // hidden on phones
    },
    {
      title: 'Full Name',
      dataIndex: 'full_name',
      key: 'full_name',
    },
    {
      title: 'Address',
      key: 'address',
      render: (_, record) => (
        <span>
          {record.line1}
          {record.line2 ? `, ${record.line2}` : ''}, {record.city}, {record.state}{' '}
          {record.postal_code}, {record.country}
        </span>
      ),
    },
    {
      title: 'Default',
      key: 'default',
      responsive: ['sm'],                      // hidden on phones
      render: (_, record) => (
        <Space>
          {record.is_default_shipping && <span>🚚 Shipping</span>}
          {record.is_default_billing && <span>💳 Billing</span>}
          {!record.is_default_shipping && !record.is_default_billing && '-'}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_, record) => {
        // Dropdown for mobile, buttons for desktop
        const menu = {
          items: [
            {
              key: 'edit',
              icon: <EditOutlined />,
              label: 'Edit',
              onClick: () => openEditAddress(record),
            },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              label: 'Delete',
              danger: true,
              onClick: () => {
                Modal.confirm({
                  title: 'Delete this address?',
                  onOk: () => deleteAddress(record.id),
                })
              },
            },
          ],
        }

        return (
          <>
            <Space className="desktop-actions" style={{ display: 'none' }}>
              <Button
                icon={<EditOutlined />}
                size="small"
                onClick={() => openEditAddress(record)}
              />
              <Popconfirm
                title="Delete this address?"
                onConfirm={() => deleteAddress(record.id)}
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
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/customers')}
        type="link"
        style={{ marginBottom: 16, paddingLeft: 0 }}
      >
        Back to Customers
      </Button>

      {customer && (
        <>
          <Card
            title={
              <Title level={4} style={{ margin: 0 }}>
                {customer.name}
              </Title>
            }
            extra={
              !customerEditMode ? (
                <Button
                  icon={<EditOutlined />}
                  onClick={() => setCustomerEditMode(true)}
                >
                  Edit
                </Button>
              ) : (
                <Button
                  icon={<SaveOutlined />}
                  type="primary"
                  onClick={handleSaveCustomer}
                >
                  Save
                </Button>
              )
            }
            style={{ marginBottom: 24 }}
          >
            {customerEditMode ? (
              <Form form={editCustomerForm} layout="vertical">
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="name" label="Full Name" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="email" label="Email">
                      <Input type="email" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="phone" label="Phone">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="company" label="Company">
                      <Input />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="country" label="Country">
                  <Input />
                </Form.Item>
                <Form.Item name="notes" label="Notes">
                  <Input.TextArea rows={3} />
                </Form.Item>
              </Form>
            ) : (
              <Descriptions bordered column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Email">{customer.email || '-'}</Descriptions.Item>
                <Descriptions.Item label="Phone">{customer.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="Company">{customer.company || '-'}</Descriptions.Item>
                <Descriptions.Item label="Country">{customer.country || '-'}</Descriptions.Item>
                <Descriptions.Item label="Notes" span={2}>
                  {customer.notes || '-'}
                </Descriptions.Item>
              </Descriptions>
            )}
          </Card>

          <Card
            title="Addresses"
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={openAddAddress}>
                Add Address
              </Button>
            }
          >
            <Table
              columns={addressColumns}
              dataSource={addresses}
              rowKey="id"
              pagination={false}
              loading={loading}
              scroll={{ x: 'max-content' }}
              size="small"
            />
          </Card>

          {/* Address Modal – all fields stack on mobile */}
          <Modal
            title={editingAddressId ? 'Edit Address' : 'Add New Address'}
            open={addressModalOpen}
            onCancel={() => setAddressModalOpen(false)}
            onOk={handleAddressSubmit}
            okText={editingAddressId ? 'Update' : 'Create'}
            width={600}
            destroyOnClose
          >
            <Form form={addressForm} layout="vertical">
              <Form.Item name="label" label="Label (e.g., Home, Office)">
                <Input />
              </Form.Item>
              <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
              <Form.Item name="line1" label="Address Line 1" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="line2" label="Address Line 2">
                <Input />
              </Form.Item>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="city" label="City" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="state" label="State">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="postal_code" label="Postal Code">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="country" label="Country" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="is_default_shipping" valuePropName="checked">
                    <Checkbox>Default Shipping</Checkbox>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="is_default_billing" valuePropName="checked">
                    <Checkbox>Default Billing</Checkbox>
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Modal>
        </>
      )}
    </div>
  )
}