import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Row, Col, Table, Button, Space, Typography, DatePicker, Select, Spin
} from 'antd'
import {
  ArrowLeftOutlined, DownloadOutlined, ReloadOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { generateStatementPdf } from '../utilities/craftsmanStatementPdf'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

export default function CraftsmanStatement() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [craftsmen, setCraftsmen] = useState([])
  const [selectedCraftsman, setSelectedCraftsman] = useState(id || null)
  const [dateRange, setDateRange] = useState(null)
  const [organization, setOrganization] = useState(null)

  const [issues, setIssues] = useState([])
  const [returns, setReturns] = useState([])
  const [consumptions, setConsumptions] = useState([])
  const [payments, setPayments] = useState([])

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchOrg = async () => {
      const { data } = await supabase.from('organizations').select('*').limit(1).single()
      setOrganization(data)
    }
    fetchOrg()
  }, [])

  useEffect(() => {
    const fetchCraftsmen = async () => {
      const { data } = await supabase
        .from('craftsmen')
        .select('id, name, code')
        .order('name')
      setCraftsmen(data || [])
    }
    fetchCraftsmen()
  }, [])

  useEffect(() => {
    if (!selectedCraftsman) return

    const fetchData = async () => {
      setLoading(true)

      const start = dateRange?.[0]?.format('YYYY-MM-DD') || null
      const end = dateRange?.[1]?.format('YYYY-MM-DD') || null

      const queries = [
        supabase
          .from('craftsman_gold_issues')
          .select('*')
          .eq('craftsman_id', selectedCraftsman)
          .order('issue_date', { ascending: true })
          .order('sr_no', { ascending: true }),

        supabase
          .from('craftsman_gold_returns')
          .select('*')
          .eq('craftsman_id', selectedCraftsman)
          .order('return_date', { ascending: true })
          .order('sr_no', { ascending: true }),

        supabase
          .from('craftsman_gold_consumptions')
          .select('*')
          .eq('craftsman_id', selectedCraftsman)
          .order('consumption_date', { ascending: true })
          .order('sr_no', { ascending: true }),

        supabase
          .from('craftsman_cash_payments')
          .select('*')
          .eq('craftsman_id', selectedCraftsman)
          .order('payment_date', { ascending: true })
          .order('sr_no', { ascending: true }),
      ]

      if (start && end) {
        queries[0] = queries[0].gte('issue_date', start).lte('issue_date', end)
        queries[1] = queries[1].gte('return_date', start).lte('return_date', end)
        queries[2] = queries[2].gte('consumption_date', start).lte('consumption_date', end)
        queries[3] = queries[3].gte('payment_date', start).lte('payment_date', end)
      }

      const [iss, ret, cons, pay] = await Promise.all(queries)

      setIssues(iss.data || [])
      setReturns(ret.data || [])
      setConsumptions(cons.data || [])
      setPayments(pay.data || [])

      setLoading(false)
    }

    fetchData()
  }, [selectedCraftsman, dateRange])

  const selectedCraftsmanObj = craftsmen.find((c) => c.id === selectedCraftsman)

  // Prepare left table (consumptions)
  const leftEntries = consumptions.map((c) => ({
    sr_no: c.sr_no,
    date: c.consumption_date,
    item_no: c.item_no || '',
    carat: Number(c.carat || 18),
    conversion_percentage: Number(c.conversion_percentage || 100),
    gold_weight: Number(c.gold_weight || 0),
    final_gold_24kt: Number(c.final_gold_24kt || 0),
    labour_amount: Number(c.labour_amount || 0),
  }))

  // Prepare right table entries
  const issueEntries = issues.map((i) => ({
    date: i.issue_date,
    remark: i.remark || 'Issue',
    cash_amount: null,
    quantity_24kt: Number(i.quantity_24kt),
  }))
  const returnEntries = returns.map((r) => ({
    date: r.return_date,
    remark: r.remark || 'Return',
    cash_amount: null,
    quantity_24kt: -Number(r.quantity_24kt),
  }))
  const paymentEntries = payments.map((p) => ({
    date: p.payment_date,
    remark: p.remark || '',
    cash_amount: Number(p.amount || 0),
    quantity_24kt: null,
  }))

  const rightEntries = [...issueEntries, ...returnEntries, ...paymentEntries]
    .sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return 0; // stable sort keeps original order within same date
    })
    .map((entry, index) => ({ ...entry, row_no: index + 1 }));

  // Totals
  let totalGoldWeight = 0, totalLabour = 0, totalEquivalent24kt = 0
  leftEntries.forEach((e) => {
    totalGoldWeight += e.gold_weight
    totalLabour += e.labour_amount
    totalEquivalent24kt += e.final_gold_24kt
  })
  let totalCash = 0, total24ktIssued = 0, total24ktReturned = 0
  rightEntries.forEach((e) => {
    if (e.cash_amount) totalCash += e.cash_amount
    if (e.quantity_24kt) {
      if (e.quantity_24kt > 0) total24ktIssued += e.quantity_24kt
      else total24ktReturned += Math.abs(e.quantity_24kt)
    }
  })
  const netGold = total24ktIssued - total24ktReturned - totalEquivalent24kt
  const netCash = totalLabour - totalCash

  // Left table columns
  const leftColumns = [
    { title: 'SR No', dataIndex: 'sr_no', key: 'sr_no', width: 60, sorter: (a, b) => a.sr_no - b.sr_no },
    { title: 'Date', dataIndex: 'date', key: 'date', width: 100, render: (d) => dayjs(d).format('DD/MM/YYYY'), sorter: (a, b) => new Date(a.date) - new Date(b.date), defaultSortOrder: 'ascend' },
    { title: 'Item No', dataIndex: 'item_no', key: 'item_no', width: 100 },
    { title: 'Carat', dataIndex: 'carat', key: 'carat', width: 70, align: 'center' },
    { title: 'Conv %', dataIndex: 'conversion_percentage', key: 'conversion_percentage', width: 70, align: 'center' },
    { title: 'Gold Weight', dataIndex: 'gold_weight', key: 'gold_weight', width: 100, align: 'right', render: (v) => v.toFixed(3) },
    { title: 'Final 24kt', dataIndex: 'final_gold_24kt', key: 'final_gold_24kt', width: 100, align: 'right', render: (v) => v.toFixed(3) },
    { title: 'Labour', dataIndex: 'labour_amount', key: 'labour_amount', width: 100, align: 'right', render: (v) => v.toFixed(2) },
  ]

  // Right table columns
  const rightColumns = [
    { title: 'SR No', dataIndex: 'row_no', key: 'row_no', width: 60 },
    { title: 'Date', dataIndex: 'date', key: 'date', width: 100, render: (d) => dayjs(d).format('DD/MM/YYYY'), sorter: (a, b) => new Date(a.date) - new Date(b.date), defaultSortOrder: 'ascend' },
    { title: 'Remark', dataIndex: 'remark', key: 'remark', width: 150 },
    { title: 'Cash', dataIndex: 'cash_amount', key: 'cash_amount', width: 100, align: 'right', render: (v) => v ? v.toFixed(2) : '' },
    { title: '24Kt', dataIndex: 'quantity_24kt', key: 'quantity_24kt', width: 80, align: 'right', render: (v) => v != null ? Math.abs(v).toFixed(3) : '' },
  ]

  // Summary data
  const summaryLeft = [
    `${Math.round(totalLabour)} Labour ${selectedCraftsmanObj?.name || ''}`,
    `${Math.round(totalCash)} Office Paid`,
    `${Math.round(netCash)} APVANA`,
  ]
  const summaryRight = [`${total24ktIssued.toFixed(3)} 24kt office Gold`]
  if (total24ktReturned > 0) summaryRight.push(`${total24ktReturned.toFixed(3)} Gold Returned`)
  summaryRight.push(
    `${totalEquivalent24kt.toFixed(3)} ${selectedCraftsmanObj?.name || ''} Labour gold (equiv 24kt)`,
    `${netGold.toFixed(3)} LAVANU`
  )

  const handleDownload = () => {
    if (!selectedCraftsmanObj) return
    generateStatementPdf(
      selectedCraftsmanObj,
      issues,
      returns,
      consumptions,
      payments,
      dateRange?.[0]?.format('YYYY-MM-DD') || '',
      dateRange?.[1]?.format('YYYY-MM-DD') || '',
      organization
    )
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/craftsmen')} type="link" style={{ paddingLeft: 0 }}>
          Back to Craftsmen
        </Button>
      </Space>

      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} sm={8}>
              <Select
                placeholder="Select craftsman"
                style={{ width: '100%' }}
                value={selectedCraftsman}
                onChange={setSelectedCraftsman}
                options={craftsmen.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
                showSearch
                optionFilterProp="label"
              />
            </Col>
            <Col xs={24} sm={8}>
              <RangePicker
                style={{ width: '100%' }}
                value={dateRange}
                onChange={setDateRange}
                format="YYYY-MM-DD"
              />
            </Col>
            <Col xs={24} sm={8} style={{ textAlign: 'right' }}>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={() => { setDateRange(null); setSelectedCraftsman(id || null); }}>
                  Reset
                </Button>
                <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload} disabled={!selectedCraftsmanObj}>
                  Download PDF
                </Button>
              </Space>
            </Col>
          </Row>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
          ) : (
            <>
              <Title level={4} style={{ textAlign: 'center', marginBottom: 0 }}>
                Craftsman Statement: {selectedCraftsmanObj?.name || 'Select a craftsman'}
              </Title>
              <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 20 }}>
                Period: {dateRange?.[0]?.format('DD/MM/YYYY') || 'from start'} to {dateRange?.[1]?.format('DD/MM/YYYY') || 'today'}
              </Text>

              <Row gutter={16}>
                <Col xs={24} lg={14}>
                  <Table
                    size="small"
                    columns={leftColumns}
                    dataSource={leftEntries}
                    rowKey={(record, index) => `left-${index}`}
                    pagination={false}
                    bordered
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={4} />
                        <Table.Summary.Cell index={1} align="right"><Text strong>{totalGoldWeight.toFixed(3)}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right"><Text strong>{totalEquivalent24kt.toFixed(3)}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right"><Text strong>{totalLabour.toFixed(2)}</Text></Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                    scroll={{ x: 'max-content' }}
                  />
                </Col>
                <Col xs={24} lg={10}>
                  <Table
                    size="small"
                    columns={rightColumns}
                    dataSource={rightEntries}
                    rowKey={(record, index) => `right-${index}`}
                    pagination={false}
                    bordered
                    summary={() => {
                      const net24kt = total24ktIssued - total24ktReturned
                      return (
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0} colSpan={2} />
                          <Table.Summary.Cell index={1} align="right"><Text strong>{totalCash.toFixed(2)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={2} align="right"><Text strong>{net24kt.toFixed(3)}</Text></Table.Summary.Cell>
                        </Table.Summary.Row>
                      )
                    }}
                    scroll={{ x: 'max-content' }}
                  />
                </Col>
              </Row>

              <Row gutter={16} style={{ marginTop: 20 }}>
                <Col xs={24} md={12}>
                  <Card size="small" title="Labour Summary">
                    <ul style={{ paddingLeft: 20, margin: 0 }}>
                      {summaryLeft.map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small" title="Gold Summary">
                    <ul style={{ paddingLeft: 20, margin: 0 }}>
                      {summaryRight.map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                  </Card>
                </Col>
              </Row>
            </>
          )}
        </Space>
      </Card>
    </div>
  )
}