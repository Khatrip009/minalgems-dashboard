import { useEffect, useState } from 'react'
import {
  Tabs, Card, Table, Button, Modal, Form, Input, InputNumber, Select, Switch,
  message, Space, Descriptions, Tag, Popconfirm, Row, Col, Typography, Dropdown
} from 'antd'
import {
  SettingOutlined, BankOutlined, PercentageOutlined, CarOutlined,
  PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, MoreOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'

const { Title } = Typography
const { Option } = Select

export default function Settings() {
  // ---------- Organization ----------
  const [org, setOrg] = useState(null)
  const [orgForm] = Form.useForm()
  const [orgEdit, setOrgEdit] = useState(false)

  const fetchOrg = async () => {
    const { data } = await supabase.from('organizations').select('*').eq('slug', 'minal-gems').single()
    setOrg(data)
    orgForm.setFieldsValue(data)
  }

  const saveOrg = async () => {
    const values = await orgForm.validateFields()
    await supabase.from('organizations').update(values).eq('id', org.id)
    message.success('Organization updated')
    setOrgEdit(false)
    fetchOrg()
  }

  // ---------- Tax Categories & Rates ----------
  const [taxCategories, setTaxCategories] = useState([])
  const [taxModalOpen, setTaxModalOpen] = useState(false)
  const [editingTaxCat, setEditingTaxCat] = useState(null)
  const [taxCatForm] = Form.useForm()
  const [ratesModalOpen, setRatesModalOpen] = useState(false)
  const [selectedTaxCatId, setSelectedTaxCatId] = useState(null)
  const [editingRate, setEditingRate] = useState(null)
  const [rateForm] = Form.useForm()

  const fetchTaxData = async () => {
    const { data: cats } = await supabase.from('tax_categories').select('*, tax_rates(*)')
    setTaxCategories(cats || [])
  }

  const openTaxCatModal = (cat = null) => {
    setEditingTaxCat(cat)
    taxCatForm.resetFields()
    if (cat) taxCatForm.setFieldsValue(cat)
    setTaxModalOpen(true)
  }

  const saveTaxCat = async () => {
    const values = await taxCatForm.validateFields()
    if (editingTaxCat) {
      await supabase.from('tax_categories').update(values).eq('id', editingTaxCat.id)
    } else {
      await supabase.from('tax_categories').insert([values])
    }
    message.success('Tax category saved')
    setTaxModalOpen(false)
    fetchTaxData()
  }

  const deleteTaxCat = async (id) => {
    await supabase.from('tax_categories').delete().eq('id', id)
    message.success('Tax category deleted')
    fetchTaxData()
  }

  const openRatesModal = (catId, rate = null) => {
    setSelectedTaxCatId(catId)
    setEditingRate(rate)
    rateForm.resetFields()
    if (rate) rateForm.setFieldsValue(rate)
    setRatesModalOpen(true)
  }

  const saveRate = async () => {
    const values = await rateForm.validateFields()
    const payload = { ...values, category_id: selectedTaxCatId }
    if (editingRate) {
      await supabase.from('tax_rates').update(payload).eq('id', editingRate.id)
    } else {
      await supabase.from('tax_rates').insert([payload])
    }
    message.success('Tax rate saved')
    setRatesModalOpen(false)
    fetchTaxData()
  }

  const deleteRate = async (id) => {
    await supabase.from('tax_rates').delete().eq('id', id)
    message.success('Tax rate deleted')
    fetchTaxData()
  }

  // ---------- Shipping Rules ----------
  const [shippingRules, setShippingRules] = useState([])
  const [shipModalOpen, setShipModalOpen] = useState(false)
  const [editingShip, setEditingShip] = useState(null)
  const [shipForm] = Form.useForm()

  const fetchShipping = async () => {
    const { data } = await supabase.from('shipping_rules').select('*').order('created_at')
    setShippingRules(data || [])
  }

  const openShipModal = (rule = null) => {
    setEditingShip(rule)
    shipForm.resetFields()
    if (rule) shipForm.setFieldsValue(rule)
    setShipModalOpen(true)
  }

  const saveShip = async () => {
    const values = await shipForm.validateFields()
    if (editingShip) {
      await supabase.from('shipping_rules').update(values).eq('id', editingShip.id)
    } else {
      await supabase.from('shipping_rules').insert([values])
    }
    message.success('Shipping rule saved')
    setShipModalOpen(false)
    fetchShipping()
  }

  const deleteShip = async (id) => {
    await supabase.from('shipping_rules').delete().eq('id', id)
    message.success('Shipping rule deleted')
    fetchShipping()
  }

  useEffect(() => {
    fetchOrg()
    fetchTaxData()
    fetchShipping()
  }, [])

  // ---------- Helper for responsive actions ----------
  const renderActions = (type, record, handlers) => {
    const items = []
    if (type === 'taxCat') {
      items.push({ key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => handlers.openEdit(record) })
      items.push({ key: 'addRate', icon: <PlusOutlined />, label: 'Add Rate', onClick: () => handlers.openRate(record) })
      items.push({ key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: () => {
        Modal.confirm({ title: 'Delete?', onOk: () => handlers.delete(record.id) })
      }})
    } else if (type === 'rate') {
      items.push({ key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => handlers.openEdit(record) })
      items.push({ key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: () => {
        Modal.confirm({ title: 'Delete?', onOk: () => handlers.delete(record.id) })
      }})
    } else if (type === 'ship') {
      items.push({ key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => handlers.openEdit(record) })
      items.push({ key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: () => {
        Modal.confirm({ title: 'Delete?', onOk: () => handlers.delete(record.id) })
      }})
    }
    const menu = { items }

    return (
      <>
        {/* Desktop actions */}
        <Space className="desktop-actions" style={{ display: 'none' }}>
          {type === 'taxCat' && (
            <>
              <Button icon={<EditOutlined />} size="small" onClick={() => handlers.openEdit(record)}>Edit</Button>
              <Button icon={<PlusOutlined />} size="small" onClick={() => handlers.openRate(record)}>Add Rate</Button>
              <Popconfirm title="Delete?" onConfirm={() => handlers.delete(record.id)}>
                <Button danger icon={<DeleteOutlined />} size="small">Delete</Button>
              </Popconfirm>
            </>
          )}
          {type === 'rate' && (
            <>
              <Button icon={<EditOutlined />} size="small" onClick={() => handlers.openEdit(record)}>Edit</Button>
              <Popconfirm title="Delete?" onConfirm={() => handlers.delete(record.id)}>
                <Button danger icon={<DeleteOutlined />} size="small">Delete</Button>
              </Popconfirm>
            </>
          )}
          {type === 'ship' && (
            <>
              <Button icon={<EditOutlined />} size="small" onClick={() => handlers.openEdit(record)}>Edit</Button>
              <Popconfirm title="Delete?" onConfirm={() => handlers.delete(record.id)}>
                <Button danger icon={<DeleteOutlined />} size="small">Delete</Button>
              </Popconfirm>
            </>
          )}
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
  }

  // ---------- Columns with responsive visibility ----------
  const taxCatColumns = [
    { title: 'Code', dataIndex: 'code', key: 'code' },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Active',
      dataIndex: 'is_active',
      key: 'is_active',
      responsive: ['md'],
      render: v => v ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag>
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, rec) => renderActions('taxCat', rec, {
        openEdit: (r) => openTaxCatModal(r),
        openRate: (r) => openRatesModal(r.id),
        delete: deleteTaxCat
      })
    }
  ]

  const rateColumns = [
    { title: 'Type', dataIndex: 'tax_type', key: 'tax_type' },
    { title: 'Rate (%)', dataIndex: 'rate', key: 'rate' },
    { title: 'Country', dataIndex: 'country', key: 'country', responsive: ['md'] },
    { title: 'State', dataIndex: 'state', key: 'state', responsive: ['md'] },
    { title: 'HSN', dataIndex: 'hsn_code', key: 'hsn_code', responsive: ['lg'] },
    { title: 'Effective From', dataIndex: 'effective_from', key: 'effective_from', responsive: ['lg'] },
    { title: 'Active', dataIndex: 'is_active', key: 'is_active', responsive: ['md'], render: v => v ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag> },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, rec) => renderActions('rate', rec, {
        openEdit: (r) => openRatesModal(r.category_id, r),
        delete: deleteRate
      })
    }
  ]

  const shipColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'type', key: 'type', render: v => <Tag>{v}</Tag> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: v => `₹${v}` },
    { title: 'Min Order', dataIndex: 'min_order_value', key: 'min_order_value', responsive: ['md'], render: v => v ? `₹${v}` : '-' },
    { title: 'Max Order', dataIndex: 'max_order_value', key: 'max_order_value', responsive: ['lg'], render: v => v ? `₹${v}` : '-' },
    {
      title: 'Active',
      dataIndex: 'active',
      key: 'active',
      responsive: ['sm'],
      render: v => v ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag>
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, rec) => renderActions('ship', rec, {
        openEdit: (r) => openShipModal(r),
        delete: deleteShip
      })
    }
  ]

  // ---------- Organization tab content (responsive) ----------
  const orgContent = (
    <Card
      title="Organization Details"
      extra={!orgEdit ? <Button icon={<EditOutlined />} onClick={() => setOrgEdit(true)}>Edit</Button>
        : <Button type="primary" icon={<SaveOutlined />} onClick={saveOrg}>Save</Button>}
    >
      {orgEdit ? (
        <Form form={orgForm} layout="vertical">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}><Form.Item label="Name" name="name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item label="Legal Name" name="legal_name"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}><Form.Item label="GSTIN" name="gstin"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item label="PAN" name="pan"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}><Form.Item label="LUT Number" name="lut_number"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item label="Email" name="email"><Input /></Form.Item></Col>
          </Row>
          <Form.Item label="Phone" name="phone"><Input /></Form.Item>
          <Form.Item label="Business Address" name={['business_address', 'line1']}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      ) : (
        org && (
          <Descriptions bordered column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Name">{org.name}</Descriptions.Item>
            <Descriptions.Item label="Legal Name">{org.legal_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="GSTIN">{org.gstin || '-'}</Descriptions.Item>
            <Descriptions.Item label="PAN">{org.pan || '-'}</Descriptions.Item>
            <Descriptions.Item label="LUT Number">{org.lut_number || '-'}</Descriptions.Item>
            <Descriptions.Item label="Email">{org.email || '-'}</Descriptions.Item>
            <Descriptions.Item label="Phone">{org.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="Address" span={2}>{org.business_address?.line1 || '-'}</Descriptions.Item>
          </Descriptions>
        )
      )}
    </Card>
  )

  // ---------- Tax tab content (responsive) ----------
  const taxContent = (
    <Card
      title="Tax Categories & Rates"
      extra={<Button icon={<PlusOutlined />} onClick={() => openTaxCatModal()}>Add Category</Button>}
    >
      <Table
        columns={taxCatColumns}
        dataSource={taxCategories}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        size="small"
        expandable={{
          expandedRowRender: (rec) => (
            <div style={{ padding: '0 24px' }}>
              <div style={{ marginBottom: 8 }}>
                <Button icon={<PlusOutlined />} size="small" onClick={() => openRatesModal(rec.id)}>Add Rate</Button>
              </div>
              <Table
                columns={rateColumns}
                dataSource={rec.tax_rates || []}
                rowKey="id"
                pagination={false}
                size="small"
                scroll={{ x: 'max-content' }}
              />
            </div>
          ),
          rowExpandable: () => true
        }}
      />
    </Card>
  )

  // ---------- Shipping tab content (responsive) ----------
  const shippingContent = (
    <Card
      title="Shipping Rules"
      extra={<Button icon={<PlusOutlined />} onClick={() => openShipModal()}>Add Rule</Button>}
    >
      <Table
        columns={shipColumns}
        dataSource={shippingRules}
        rowKey="id"
        pagination={false}
        scroll={{ x: 'max-content' }}
        size="small"
      />
    </Card>
  )

  const tabItems = [
    { key: 'org', label: <span><BankOutlined /> Organization</span>, children: orgContent },
    { key: 'tax', label: <span><PercentageOutlined /> Tax Rules</span>, children: taxContent },
    { key: 'shipping', label: <span><CarOutlined /> Shipping Rules</span>, children: shippingContent },
  ]

  return (
    <div>
      <Title level={3}><SettingOutlined style={{ marginRight: 12 }} />Settings</Title>
      <Tabs items={tabItems} />

      {/* Tax Category Modal */}
      <Modal
        title={editingTaxCat ? 'Edit Tax Category' : 'Add Tax Category'}
        open={taxModalOpen}
        onOk={saveTaxCat}
        onCancel={() => setTaxModalOpen(false)}
        destroyOnClose
      >
        <Form form={taxCatForm} layout="vertical">
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Tax Rate Modal */}
      <Modal
        title={editingRate ? 'Edit Tax Rate' : 'Add Tax Rate'}
        open={ratesModalOpen}
        onOk={saveRate}
        onCancel={() => setRatesModalOpen(false)}
        destroyOnClose
      >
        <Form form={rateForm} layout="vertical">
          <Form.Item name="tax_type" label="Tax Type" rules={[{ required: true }]}>
            <Select>
              <Option value="CGST">CGST</Option>
              <Option value="SGST">SGST</Option>
              <Option value="IGST">IGST</Option>
              <Option value="UTGST">UTGST</Option>
              <Option value="cess">Cess</Option>
            </Select>
          </Form.Item>
          <Form.Item name="rate" label="Rate (%)" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Form.Item name="country" label="Country"><Input /></Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="state" label="State"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="hsn_code" label="HSN Code"><Input /></Form.Item>
          <Form.Item name="effective_from" label="Effective From">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Shipping Rule Modal (already included, but ensure responsive fields) */}
      <Modal
        title={editingShip ? 'Edit Shipping Rule' : 'Add Shipping Rule'}
        open={shipModalOpen}
        onOk={saveShip}
        onCancel={() => setShipModalOpen(false)}
        destroyOnClose
      >
        <Form form={shipForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select>
              <Option value="flat">Flat</Option>
              <Option value="weight">Weight</Option>
              <Option value="order_value">Order Value</Option>
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Form.Item name="min_order_value" label="Min Order Value">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="max_order_value" label="Max Order Value">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Form.Item name="min_weight" label="Min Weight">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="max_weight" label="Max Weight">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}