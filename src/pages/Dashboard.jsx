import { useEffect, useState } from 'react'
import { Card, Row, Col, Typography, Table, Tag, Statistic } from 'antd'
import {
  ShoppingOutlined,
  OrderedListOutlined,
  DollarOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'

const { Title, Text } = Typography

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      const { data, error } = await supabase.rpc('get_dashboard_stats')
      if (!error) setStats(data)
      setLoading(false)
    }
    fetchStats()
  }, [])

  // Status tag colours
  const statusColors = {
    pending: 'gold',
    confirmed: 'blue',
    processing: 'cyan',
    shipped: 'purple',
    delivered: 'green',
    cancelled: 'red',
    returned: 'orange',
  }

  // Recent‑orders table columns
  const orderColumns = [
    {
      title: 'Order #',
      dataIndex: 'order_number',
      key: 'order_number',
      width: 120,
    },
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      key: 'customer_name',
      ellipsis: true,
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      render: (v) => `₹${v?.toLocaleString()}`,
      width: 100,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={statusColors[s]}>{s?.toUpperCase()}</Tag>,
      width: 110,
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (d) => dayjs(d).format('DD/MM/YYYY'),
      width: 110,
    },
  ]

  // Format currency for chart tooltip
  const formatCurrency = (value) => `₹${Number(value).toLocaleString()}`

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          Dashboard
        </Title>
        <Text type="secondary">
          {dayjs().format('dddd, DD MMMM YYYY')}
        </Text>
      </div>

      {/* Statistic Cards – responsive grid */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          {
            title: 'Total Products',
            value: stats?.total_products || 0,
            icon: <ShoppingOutlined />,
            col: { xs: 12, sm: 8, lg: 6, xl: 4 },
          },
          {
            title: 'Total Orders',
            value: stats?.total_orders || 0,
            icon: <OrderedListOutlined />,
            col: { xs: 12, sm: 8, lg: 6, xl: 4 },
          },
          {
            title: 'Total Revenue',
            value: stats?.total_revenue || 0,
            icon: <DollarOutlined />,
            col: { xs: 24, sm: 8, lg: 6, xl: 5 },
            precision: 2,
            formatter: (v) => `₹${Number(v).toLocaleString()}`,
          },
          {
            title: 'Customers',
            value: stats?.total_customers || 0,
            icon: <TeamOutlined />,
            col: { xs: 12, sm: 8, lg: 6, xl: 4 },
          },
          {
            title: 'Craftsmen',
            value: stats?.total_craftsmen || 0,
            icon: <ToolOutlined />,
            col: { xs: 12, sm: 8, lg: 6, xl: 5 },
          },
        ].map((stat, index) => (
          <Col key={index} {...stat.col}>
            <Card
              loading={loading}
              hoverable
              style={{
                borderRadius: 8,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <Statistic
                title={stat.title}
                value={stat.value}
                prefix={stat.icon}
                precision={stat.precision}
                formatter={stat.formatter}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Charts and Table Section */}
      <Row gutter={[16, 16]}>
        {/* Monthly Revenue Chart */}
        <Col xs={24} lg={14}>
          <Card
            title="Monthly Revenue (Last 6 Months)"
            loading={loading}
            style={{ borderRadius: 8, height: '100%' }}
          >
            {stats?.monthly_revenue?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={stats.monthly_revenue}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={formatCurrency} />
                  <Tooltip formatter={formatCurrency} />
                  <Bar
                    dataKey="revenue"
                    fill="#1890ff"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  height: 300,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#999',
                }}
              >
                No revenue data available
              </div>
            )}
          </Card>
        </Col>

        {/* Recent Orders */}
        <Col xs={24} lg={10}>
          <Card
            title="Recent Orders"
            loading={loading}
            style={{ borderRadius: 8, height: '100%' }}
          >
            <Table
              columns={orderColumns}
              dataSource={stats?.recent_orders || []}
              rowKey="order_number"
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}   // enables horizontal scroll on mobile
              locale={{ emptyText: 'No recent orders' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}