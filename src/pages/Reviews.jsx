import { useEffect, useState } from 'react'
import {
  Table, Button, Space, Input, Select, message, Tag, Card, Row, Col, Typography,
  Modal, Popconfirm, Dropdown, Rate, Drawer, Descriptions, Switch
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, EyeOutlined, EditOutlined,
  DeleteOutlined, StarOutlined, MoreOutlined, CheckOutlined,
  StopOutlined, FlagOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Option } = Select

export default function Reviews() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [publishedFilter, setPublishedFilter] = useState(null)   // true, false, or null (all)
  const [flaggedFilter, setFlaggedFilter] = useState(null)       // true, false, or null (all)

  // Detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedReview, setSelectedReview] = useState(null)

  const fetchReviews = async () => {
    setLoading(true)
    let query = supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })

    if (publishedFilter !== null) query = query.eq('is_published', publishedFilter)
    if (flaggedFilter !== null) query = query.eq('is_flagged', flaggedFilter)

    const { data, error } = await query
    if (error) {
      message.error('Failed to load reviews')
      setLoading(false)
      return
    }

    // Enrich reviews with product name for 'product' type
    const enriched = await Promise.all(
      (data || []).map(async (review) => {
        if (review.about_type === 'product' && review.about_id) {
          const { data: product } = await supabase
            .from('products')
            .select('title')
            .eq('id', review.about_id)
            .single()
          return { ...review, about_name: product?.title || review.about_id }
        }
        // For other types, just show type and ID
        return { ...review, about_name: `${review.about_type} / ${review.about_id?.substring(0, 8)}` }
      })
    )

    setReviews(enriched)
    setLoading(false)
  }

  useEffect(() => {
    fetchReviews()
  }, [publishedFilter, flaggedFilter])

  const togglePublished = async (id, currentValue) => {
    const { error } = await supabase
      .from('reviews')
      .update({ is_published: !currentValue })
      .eq('id', id)
    if (error) message.error('Update failed')
    else {
      message.success(currentValue ? 'Review unpublished' : 'Review published')
      fetchReviews()
    }
  }

  const toggleFlagged = async (id, currentValue) => {
    const { error } = await supabase
      .from('reviews')
      .update({ is_flagged: !currentValue })
      .eq('id', id)
    if (error) message.error('Update failed')
    else {
      message.success(currentValue ? 'Flag removed' : 'Review flagged')
      fetchReviews()
    }
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('reviews').delete().eq('id', id)
    if (error) message.error('Delete failed')
    else {
      message.success('Review deleted')
      fetchReviews()
    }
  }

  const openDetailDrawer = (record) => {
    setSelectedReview(record)
    setDrawerOpen(true)
  }

  const columns = [
    {
      title: 'Author',
      key: 'author',
      render: (_, rec) => (
        <Space direction="vertical" size={0}>
          <Text strong>{rec.author_name || 'Anonymous'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{rec.author_email || ''}</Text>
        </Space>
      ),
    },
    {
      title: 'Rating',
      dataIndex: 'rating',
      key: 'rating',
      width: 80,
      render: (v) => <Rate disabled value={v} style={{ fontSize: 14 }} />,
    },
    {
      title: 'About',
      key: 'about',
      render: (_, rec) => rec.about_name,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      responsive: ['sm'],
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      responsive: ['md'],
      render: (d) => dayjs(d).format('DD/MM/YYYY'),
    },
    {
      title: 'Published',
      dataIndex: 'is_published',
      key: 'is_published',
      width: 90,
      render: (v, rec) => (
        <Tag color={v ? 'green' : 'red'}>
          {v ? 'Yes' : 'No'}
        </Tag>
      ),
    },
    {
      title: 'Flagged',
      dataIndex: 'is_flagged',
      key: 'is_flagged',
      width: 80,
      render: (v) => v ? <Tag color="orange">Flagged</Tag> : <Tag>No</Tag>,
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
              onClick: () => openDetailDrawer(record),
            },
            {
              key: 'publish',
              icon: record.is_published ? <StopOutlined /> : <CheckOutlined />,
              label: record.is_published ? 'Unpublish' : 'Publish',
              onClick: () => togglePublished(record.id, record.is_published),
            },
            {
              key: 'flag',
              icon: <FlagOutlined />,
              label: record.is_flagged ? 'Remove Flag' : 'Flag',
              onClick: () => toggleFlagged(record.id, record.is_flagged),
            },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              label: 'Delete',
              danger: true,
              onClick: () => {
                Modal.confirm({
                  title: 'Delete this review?',
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
                onClick={() => openDetailDrawer(record)}
              />
              <Button
                icon={record.is_published ? <StopOutlined /> : <CheckOutlined />}
                size="small"
                onClick={() => togglePublished(record.id, record.is_published)}
              />
              <Button
                icon={<FlagOutlined />}
                size="small"
                onClick={() => toggleFlagged(record.id, record.is_flagged)}
              />
              <Popconfirm
                title="Delete?"
                onConfirm={() => handleDelete(record.id)}
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

  const filtered = reviews.filter((r) => {
    const term = searchText.toLowerCase()
    return (
      r.author_name?.toLowerCase().includes(term) ||
      r.title?.toLowerCase().includes(term) ||
      r.body?.toLowerCase().includes(term)
    )
  })

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[8, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Title level={3} style={{ margin: 0 }}>
            <StarOutlined style={{ marginRight: 12 }} />
            Reviews
          </Title>
        </Col>
        <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
          <Button icon={<ReloadOutlined />} onClick={fetchReviews}>
            Refresh
          </Button>
        </Col>
      </Row>

      <Card
        title={
          <Space wrap style={{ width: '100%' }}>
            <Input
              placeholder="Search reviews..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ width: '100%', maxWidth: 260 }}
            />
            <Select
              placeholder="Published"
              allowClear
              style={{ width: 140 }}
              value={publishedFilter}
              onChange={(val) => setPublishedFilter(val === undefined ? null : val)}
            >
              <Option value={true}>Published</Option>
              <Option value={false}>Not Published</Option>
            </Select>
            <Select
              placeholder="Flagged"
              allowClear
              style={{ width: 140 }}
              value={flaggedFilter}
              onChange={(val) => setFlaggedFilter(val === undefined ? null : val)}
            >
              <Option value={true}>Flagged</Option>
              <Option value={false}>Not Flagged</Option>
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

      {/* Detail Drawer */}
      <Drawer
        title="Review Details"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
      >
        {selectedReview && (
          <>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 24 }}>
              <Descriptions.Item label="Author">
                {selectedReview.author_name || 'Anonymous'}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {selectedReview.author_email || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Rating">
                <Rate disabled value={selectedReview.rating} />
              </Descriptions.Item>
              <Descriptions.Item label="About">
                {selectedReview.about_name}
              </Descriptions.Item>
              <Descriptions.Item label="Title">
                {selectedReview.title || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Body">
                {selectedReview.body || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Published">
                <Tag color={selectedReview.is_published ? 'green' : 'red'}>
                  {selectedReview.is_published ? 'Yes' : 'No'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Flagged">
                <Tag color={selectedReview.is_flagged ? 'orange' : 'default'}>
                  {selectedReview.is_flagged ? 'Yes' : 'No'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Moderation Notes">
                {selectedReview.moderation_notes || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Date">
                {dayjs(selectedReview.created_at).format('DD/MM/YYYY HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                icon={selectedReview.is_published ? <StopOutlined /> : <CheckOutlined />}
                block
                onClick={() => {
                  togglePublished(selectedReview.id, selectedReview.is_published)
                  setDrawerOpen(false)
                }}
              >
                {selectedReview.is_published ? 'Unpublish' : 'Publish'}
              </Button>
              <Button
                icon={<FlagOutlined />}
                block
                onClick={() => {
                  toggleFlagged(selectedReview.id, selectedReview.is_flagged)
                  setDrawerOpen(false)
                }}
              >
                {selectedReview.is_flagged ? 'Remove Flag' : 'Flag'}
              </Button>
              <Popconfirm
                title="Delete?"
                onConfirm={() => {
                  handleDelete(selectedReview.id)
                  setDrawerOpen(false)
                }}
              >
                <Button danger icon={<DeleteOutlined />} block>
                  Delete
                </Button>
              </Popconfirm>
            </Space>
          </>
        )}
      </Drawer>
    </div>
  )
}