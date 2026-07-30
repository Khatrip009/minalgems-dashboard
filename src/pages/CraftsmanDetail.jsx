// CraftsmanDetail.jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Tabs,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Space,
  message,
  Popconfirm,
  Tag,
  Card,
  Row,
  Col,
  Typography,
  Descriptions,
  Statistic,
  Dropdown,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  GoldOutlined,
  DollarOutlined,
  ToolOutlined,
  MoreOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { generateStatementPdf } from '../utilities/craftsmanStatementPdf'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

export default function CraftsmanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [craftsman, setCraftsman] = useState(null)
  const [activeTab, setActiveTab] = useState('issues')
  const [loading, setLoading] = useState(false)

  // --- Date range filters ---
  const [dateRange, setDateRange] = useState(null)

  // --- Raw (unfiltered) data from database ---
  const [allIssues, setAllIssues] = useState([])
  const [allReturns, setAllReturns] = useState([])
  const [allConsumptions, setAllConsumptions] = useState([])
  const [allPayments, setAllPayments] = useState([])

  // --- Filtered data used for tables & PDF ---
  const [issues, setIssues] = useState([])
  const [returns, setReturns] = useState([])
  const [consumptions, setConsumptions] = useState([])
  const [payments, setPayments] = useState([])

  // --- Modal state ---
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState('')
  const [editingRecord, setEditingRecord] = useState(null)
  const [form] = Form.useForm()

  const [organization, setOrganization] = useState(null)

  useEffect(() => {
    const fetchOrg = async () => {
      const { data } = await supabase
        .from('organizations')
        .select('*')
        .limit(1)
        .single()
      setOrganization(data)
    }
    fetchOrg()
  }, [])

  // Fetch craftsman details
  const fetchCraftsman = async () => {
    const { data } = await supabase.from('craftsmen').select('*').eq('id', id).single()
    setCraftsman(data)
  }

  // Fetch all raw data (includes sr_no, ordered by sr_no descending)
  const fetchData = async () => {
    setLoading(true)

    const [iss, ret, cons, pay] = await Promise.all([
      supabase
        .from('craftsman_gold_issues')
        .select('id, craftsman_id, issue_date, quantity_24kt, remark, reference_no, created_at, updated_at, sr_no')
        .eq('craftsman_id', id)
        .order('sr_no', { ascending: false }),

      supabase
        .from('craftsman_gold_returns')
        .select('id, craftsman_id, return_date, quantity_24kt, remark, reference_no, created_at, updated_at, sr_no')
        .eq('craftsman_id', id)
        .order('sr_no', { ascending: false }),

      supabase
        .from('craftsman_gold_consumptions')
        .select('id, craftsman_id, consumption_date, gold_weight, labour_amount, remark, reference_no, item_no, carat, conversion_percentage, final_gold_24kt, created_at, updated_at, sr_no')
        .eq('craftsman_id', id)
        .order('sr_no', { ascending: false }),

      supabase
        .from('craftsman_cash_payments')
        .select('id, craftsman_id, payment_date, amount, remark, reference_no, created_at, updated_at, sr_no')
        .eq('craftsman_id', id)
        .order('sr_no', { ascending: false }),
    ])

    const rawIssues = iss.data || []
    const rawReturns = ret.data || []
    const rawConsumptions = cons.data || []
    const rawPayments = pay.data || []

    setAllIssues(rawIssues)
    setAllReturns(rawReturns)
    setAllConsumptions(rawConsumptions)
    setAllPayments(rawPayments)

    setLoading(false)
  }

  useEffect(() => {
    fetchCraftsman()
    fetchData()
  }, [id])

  // Apply date filtering
  useEffect(() => {
    if (!dateRange || dateRange.length !== 2) {
      setIssues(allIssues)
      setReturns(allReturns)
      setConsumptions(allConsumptions)
      setPayments(allPayments)
      return
    }

    const [start, end] = dateRange
    if (!start || !end) {
      setIssues(allIssues)
      setReturns(allReturns)
      setConsumptions(allConsumptions)
      setPayments(allPayments)
      return
    }

    const startStr = start.format('YYYY-MM-DD')
    const endStr = end.format('YYYY-MM-DD')

    const filterByDate = (arr, dateField) =>
      arr.filter((item) => {
        const d = item[dateField]
        return d >= startStr && d <= endStr
      })

    setIssues(filterByDate(allIssues, 'issue_date'))
    setReturns(filterByDate(allReturns, 'return_date'))
    setConsumptions(filterByDate(allConsumptions, 'consumption_date'))
    setPayments(filterByDate(allPayments, 'payment_date'))
  }, [allIssues, allReturns, allConsumptions, allPayments, dateRange])

  // --- PDF export ---
  const handleDownloadStatement = () => {
    const startStr = dateRange?.[0]?.format('YYYY-MM-DD') || ''
    const endStr = dateRange?.[1]?.format('YYYY-MM-DD') || ''
    generateStatementPdf(
      craftsman,
      issues,
      returns,
      consumptions,
      payments,
      startStr,
      endStr,
      organization
    )
  }

  // --- Modal handlers ---
  const openAddModal = (type) => {
    setModalType(type)
    setEditingRecord(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEditModal = (type, record) => {
    setModalType(type)
    setEditingRecord(record)
    form.setFieldsValue({
      ...record,
      issue_date: record.issue_date ? dayjs(record.issue_date) : null,
      return_date: record.return_date ? dayjs(record.return_date) : null,
      consumption_date: record.consumption_date ? dayjs(record.consumption_date) : null,
      payment_date: record.payment_date ? dayjs(record.payment_date) : null,
      sr_no: record.sr_no,
    })
    setModalOpen(true)
  }

  const handleDelete = async (type, recordId) => {
    const tableMap = {
      issue: 'craftsman_gold_issues',
      return: 'craftsman_gold_returns',
      consumption: 'craftsman_gold_consumptions',
      payment: 'craftsman_cash_payments',
    }
    const { error } = await supabase.from(tableMap[type]).delete().eq('id', recordId)
    if (error) message.error('Delete failed')
    else {
      message.success('Deleted')
      fetchData()
    }
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const tableMap = {
      issue: 'craftsman_gold_issues',
      return: 'craftsman_gold_returns',
      consumption: 'craftsman_gold_consumptions',
      payment: 'craftsman_cash_payments',
    }

    // Build payload without craftsman_id initially
    let payload = {}

    // --- sr_no handling ---
    if (values.sr_no !== undefined && values.sr_no !== null) {
      payload.sr_no = values.sr_no
    }

    switch (modalType) {
      case 'issue':
        payload.issue_date = values.issue_date?.format('YYYY-MM-DD')
        payload.quantity_24kt = values.quantity_24kt
        if (values.remark) payload.remark = values.remark
        if (values.reference_no) payload.reference_no = values.reference_no
        break

      case 'return':
        payload.return_date = values.return_date?.format('YYYY-MM-DD')
        payload.quantity_24kt = values.quantity_24kt
        if (values.remark) payload.remark = values.remark
        if (values.reference_no) payload.reference_no = values.reference_no
        break

      case 'consumption':
        payload.consumption_date = values.consumption_date?.format('YYYY-MM-DD')
        payload.gold_weight = values.gold_weight
        payload.carat = values.carat
        payload.conversion_percentage = values.conversion_percentage

        // Only include final_gold_24kt if user gave a non‑null value
        if (values.final_gold_24kt != null) {
          payload.final_gold_24kt = values.final_gold_24kt
        }

        payload.labour_amount = values.labour_amount || 0
        if (values.item_no) payload.item_no = values.item_no
        if (values.remark) payload.remark = values.remark
        if (values.reference_no) payload.reference_no = values.reference_no
        break

      case 'payment':
        payload.payment_date = values.payment_date?.format('YYYY-MM-DD')
        payload.amount = values.amount
        if (values.remark) payload.remark = values.remark
        if (values.reference_no) payload.reference_no = values.reference_no
        break

      default:
        return
    }

    // Only include craftsman_id when inserting (not when updating)
    if (!editingRecord) {
      payload.craftsman_id = id
    }

    if (editingRecord) {
      const { error } = await supabase.from(tableMap[modalType]).update(payload).eq('id', editingRecord.id)
      if (error) return message.error('Update failed')
      message.success('Updated')
    } else {
      const { error } = await supabase.from(tableMap[modalType]).insert([payload])
      if (error) return message.error('Insert failed')
      message.success('Added')
    }
    setModalOpen(false)
    fetchData()
  }

  // --- Balance calculations ---
  const totalIssued = issues.reduce((s, i) => s + Number(i.quantity_24kt), 0)
  const totalReturned = returns.reduce((s, r) => s + Number(r.quantity_24kt), 0)
  const totalConsumed = consumptions.reduce((s, c) => s + Number(c.final_gold_24kt), 0)
  const totalLabour = consumptions.reduce((s, c) => s + Number(c.labour_amount), 0)
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)

  // --- Table columns ---
  const dateColumn = (dataIndex) => ({
    title: 'Date',
    dataIndex,
    key: dataIndex,
    render: (d) => dayjs(d).format('DD/MM/YYYY'),
  })

  const remarkColumn = { title: 'Remark', dataIndex: 'remark', key: 'remark', responsive: ['md'] }
  const referenceColumn = { title: 'Ref No', dataIndex: 'reference_no', key: 'reference_no', responsive: ['lg'] }

  const srNoColumn = {
    title: 'SR No',
    dataIndex: 'sr_no',
    key: 'sr_no',
    width: 80,
    sorter: (a, b) => a.sr_no - b.sr_no,
    defaultSortOrder: 'descend',
  }

  const actionColumn = (type) => ({
    title: 'Actions',
    key: 'actions',
    width: 100,
    render: (_, record) => {
      const menu = {
        items: [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => openEditModal(type, record) },
          { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: () => {
            Modal.confirm({ title: 'Delete?', onOk: () => handleDelete(type, record.id) })
          }},
        ],
      }
      return (
        <>
          <Space className="desktop-actions" style={{ display: 'none' }}>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEditModal(type, record)}>Edit</Button>
            <Popconfirm title="Delete?" onConfirm={() => handleDelete(type, record.id)}>
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
  })

  // Columns – SR No appears first
  const issueColumns = [
    srNoColumn,
    dateColumn('issue_date'),
    { title: 'Qty (24kt)', dataIndex: 'quantity_24kt', key: 'quantity_24kt', render: (v) => `${v} g` },
    remarkColumn,
    referenceColumn,
    actionColumn('issue'),
  ]

  const returnColumns = [
    srNoColumn,
    dateColumn('return_date'),
    { title: 'Qty (24kt)', dataIndex: 'quantity_24kt', key: 'quantity_24kt', render: (v) => `${v} g` },
    remarkColumn,
    referenceColumn,
    actionColumn('return'),
  ]

  const consumptionColumns = [
    srNoColumn,
    dateColumn('consumption_date'),
    { title: 'Gold Wt', dataIndex: 'gold_weight', key: 'gold_weight', render: (v) => `${v} g`, responsive: ['sm'] },
    { title: 'Carat', dataIndex: 'carat', key: 'carat', responsive: ['md'] },
    { title: 'Conv %', dataIndex: 'conversion_percentage', key: 'conversion_percentage', render: (v) => `${v}%`, responsive: ['lg'] },
    { title: 'Final 24kt', dataIndex: 'final_gold_24kt', key: 'final_gold_24kt', render: (v) => `${v} g` },
    { title: 'Labour', dataIndex: 'labour_amount', key: 'labour_amount', render: (v) => `₹${v?.toLocaleString()}`, responsive: ['sm'] },
    { title: 'Item No', dataIndex: 'item_no', key: 'item_no', responsive: ['md'] },
    remarkColumn,
    referenceColumn,
    actionColumn('consumption'),
  ]

  const paymentColumns = [
    srNoColumn,
    dateColumn('payment_date'),
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v) => `₹${v?.toLocaleString()}` },
    remarkColumn,
    referenceColumn,
    actionColumn('payment'),
  ]

  // --- Modal form ---
  const renderForm = () => {
    const commonDate = (name, label) => (
      <Form.Item name={name} label={label} rules={[{ required: true }]}>
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>
    )
    const commonQty = (name, label, required = true) => (
      <Form.Item name={name} label={label} rules={required ? [{ required: true }] : []}>
        <InputNumber min={0} step={0.001} style={{ width: '100%' }} />
      </Form.Item>
    )
    const commonText = (name, label) => (
      <Form.Item name={name} label={label}><Input /></Form.Item>
    )

    const srNoInput = (
      <Form.Item name="sr_no" label="SR No">
        <InputNumber min={1} step={1} style={{ width: '100%' }} placeholder="Auto if empty" />
      </Form.Item>
    )

    switch (modalType) {
      case 'issue':
        return (
          <>
            {commonDate('issue_date', 'Issue Date')}
            {commonQty('quantity_24kt', 'Quantity (24kt)')}
            {commonText('remark', 'Remark')}
            {commonText('reference_no', 'Reference No')}
            {srNoInput}
          </>
        )
      case 'return':
        return (
          <>
            {commonDate('return_date', 'Return Date')}
            {commonQty('quantity_24kt', 'Quantity (24kt)')}
            {commonText('remark', 'Remark')}
            {commonText('reference_no', 'Reference No')}
            {srNoInput}
          </>
        )
      case 'consumption':
        return (
          <>
            {commonDate('consumption_date', 'Consumption Date')}
            <Row gutter={[12, 0]}>
              <Col xs={24} sm={12}>
                {commonQty('gold_weight', 'Gold Weight')}
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="carat" label="Carat" rules={[{ required: true }]}>
                  <InputNumber min={0} max={24} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[12, 0]}>
              <Col xs={24} sm={12}>
                <Form.Item name="conversion_percentage" label="Conversion %" rules={[{ required: true }]}>
                  <InputNumber min={0} max={100} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="final_gold_24kt" label="Final 24kt">
                  <InputNumber min={0} step={0.001} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="labour_amount" label="Labour Amount">
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            {commonText('item_no', 'Item No')}
            {commonText('remark', 'Remark')}
            {commonText('reference_no', 'Reference No')}
            {srNoInput}
          </>
        )
      case 'payment':
        return (
          <>
            {commonDate('payment_date', 'Payment Date')}
            <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            {commonText('remark', 'Remark')}
            {commonText('reference_no', 'Reference No')}
            {srNoInput}
          </>
        )
      default:
        return null
    }
  }

  // --- Tabs ---
  const tabItems = [
    {
      key: 'issues',
      label: 'Gold Issues',
      children: (
        <div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openAddModal('issue')} style={{ marginBottom: 16 }}>
            Add Issue
          </Button>
          <Table
            columns={issueColumns}
            dataSource={issues}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, responsive: true }}
            scroll={{ x: 'max-content' }}
            size="small"
          />
        </div>
      ),
    },
    {
      key: 'returns',
      label: 'Gold Returns',
      children: (
        <div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openAddModal('return')} style={{ marginBottom: 16 }}>
            Add Return
          </Button>
          <Table
            columns={returnColumns}
            dataSource={returns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, responsive: true }}
            scroll={{ x: 'max-content' }}
            size="small"
          />
        </div>
      ),
    },
    {
      key: 'consumptions',
      label: 'Gold Consumptions',
      children: (
        <div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openAddModal('consumption')} style={{ marginBottom: 16 }}>
            Add Consumption
          </Button>
          <Table
            columns={consumptionColumns}
            dataSource={consumptions}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, responsive: true }}
            scroll={{ x: 'max-content' }}
            size="small"
          />
        </div>
      ),
    },
    {
      key: 'payments',
      label: 'Cash Payments',
      children: (
        <div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openAddModal('payment')} style={{ marginBottom: 16 }}>
            Add Payment
          </Button>
          <Table
            columns={paymentColumns}
            dataSource={payments}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, responsive: true }}
            scroll={{ x: 'max-content' }}
            size="small"
          />
        </div>
      ),
    },
  ]

  return (
    <div>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/craftsmen')} type="link" style={{ paddingLeft: 0 }}>
              Back to Craftsmen
            </Button>
          </Space>
        </Col>
        <Col>
          <Space wrap>
            <RangePicker
              allowClear
              format="YYYY-MM-DD"
              value={dateRange}
              onChange={(dates) => setDateRange(dates)}
              placeholder={['Start date', 'End date']}
              style={{ maxWidth: 300 }}
            />
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownloadStatement}
            >
              Download Statement PDF
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Craftsman info */}
      {craftsman && (
        <Card style={{ marginBottom: 24 }}>
          <Descriptions
            title={<Title level={4} style={{ marginBottom: 0 }}>{craftsman.name}</Title>}
            bordered
            column={{ xs: 1, sm: 2, md: 3 }}
          >
            <Descriptions.Item label="Code">{craftsman.code || '-'}</Descriptions.Item>
            <Descriptions.Item label="Phone">{craftsman.contact?.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="Email">{craftsman.contact?.email || '-'}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* Gold Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic title="Gold Issued" value={totalIssued.toFixed(3)} suffix="g" />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic title="Gold Returned" value={totalReturned.toFixed(3)} suffix="g" />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic title="Gold Consumed" value={totalConsumed.toFixed(3)} suffix="g" />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="Outstanding Gold"
              value={(totalIssued - totalReturned - totalConsumed).toFixed(3)}
              suffix="g"
              valueStyle={{ color: totalIssued - totalReturned - totalConsumed > 0 ? '#cf1322' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      {/* Labour / Cash Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Labour Charged" value={`₹${totalLabour.toLocaleString()}`} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Cash Paid" value={`₹${totalPaid.toLocaleString()}`} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Outstanding Labour"
              value={`₹${(totalLabour - totalPaid).toLocaleString()}`}
              valueStyle={{ color: totalLabour - totalPaid > 0 ? '#cf1322' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      {/* Add/Edit Modal */}
      <Modal
        title={`${editingRecord ? 'Edit' : 'Add'} ${modalType.charAt(0).toUpperCase() + modalType.slice(1)}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editingRecord ? 'Update' : 'Create'}
        destroyOnClose
        width={600}
      >
        <Form form={form} layout="vertical">
          {renderForm()}
        </Form>
      </Modal>
    </div>
  )
}