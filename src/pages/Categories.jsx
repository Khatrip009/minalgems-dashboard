import { useEffect, useState } from 'react'
import {
  Table, Button, Space, Input, Card, Row, Col, Typography, message, Modal, Form,
  Select, InputNumber, Tag, Popconfirm, Dropdown, Upload,
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined,
  EditOutlined, DeleteOutlined, AppstoreOutlined, MoreOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { uploadFile, getAssetUrl, generateProductFileName } from '../utilities/storage'

const { Title, Text } = Typography
const { Option } = Select

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCat, setEditingCat] = useState(null)
  const [form] = Form.useForm()

  // Separate state for new file and existing image URL
  const [selectedFile, setSelectedFile] = useState(null)       // File object to upload
  const [existingImageUrl, setExistingImageUrl] = useState(null) // current image_url from DB

  const fetchCategories = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*, parent:parent_id ( id, name )')
        .order('sort_order', { ascending: true })

      if (error) throw error
      setCategories(data || [])
    } catch (err) {
      console.error('Fetch categories error:', err)
      message.error('Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const handleAdd = () => {
    setEditingCat(null)
    form.resetFields()
    form.setFieldsValue({ trade_type: 'both', sort_order: 0 })
    setSelectedFile(null)
    setExistingImageUrl(null)
    setModalOpen(true)
  }

  const handleEdit = (record) => {
    setEditingCat(record)
    form.setFieldsValue({
      name: record.name,
      slug: record.slug,
      description: record.description,
      parent_id: record.parent_id,
      trade_type: record.trade_type || 'both',
      sort_order: record.sort_order || 0,
    })
    setSelectedFile(null)
    setExistingImageUrl(record.image_url || null)
    setModalOpen(true)
  }

  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
      message.success('Category deleted')
      fetchCategories()
    } catch (err) {
      console.error('Delete error:', err)
      message.error('Delete failed: category may be in use')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      let imageUrl = null

      // Upload new file if selected
      if (selectedFile) {
        try {
          const newFileName = generateProductFileName(selectedFile.name, values.name || 'category')
          const renamedFile = new File([selectedFile], newFileName, { type: selectedFile.type })
          imageUrl = await uploadFile(renamedFile, 'categories')
        } catch (uploadErr) {
          console.error('Upload error:', uploadErr)
          message.error(`Image upload failed: ${uploadErr.message}`)
          return // stop further processing
        }
      } else if (existingImageUrl) {
        // No new file, keep existing image
        imageUrl = existingImageUrl
      }
      // else imageUrl remains null (no image or removed)

      const payload = { ...values, image_url: imageUrl }

      if (editingCat) {
        const { error } = await supabase.from('categories').update(payload).eq('id', editingCat.id)
        if (error) throw error
        message.success('Category updated')
      } else {
        const { error } = await supabase.from('categories').insert([payload])
        if (error) throw error
        message.success('Category added')
      }

      setModalOpen(false)
      form.resetFields()
      setSelectedFile(null)
      setExistingImageUrl(null)
      fetchCategories()
    } catch (err) {
      console.error('Submit error:', err)
      message.error('Failed to save category. Please check the form and try again.')
    }
  }

  const columns = [
    {
      title: 'Image',
      key: 'image',
      width: 50,
      responsive: ['sm'],
      render: (_, record) => {
        const src = record.image_url ? getAssetUrl(record.image_url) : null
        return (
          <div style={{ width: 32, height: 32, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
            {src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
        )
      },
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      key: 'slug',
      responsive: ['sm'],
      render: (text) => <Tag>{text}</Tag>,
    },
    {
      title: 'Trade Type',
      dataIndex: 'trade_type',
      key: 'trade_type',
      responsive: ['md'],
      filters: [
        { text: 'Both', value: 'both' },
        { text: 'Import', value: 'import' },
        { text: 'Export', value: 'export' },
      ],
      onFilter: (value, record) => record.trade_type === value,
      render: (val) => <Tag color="blue">{val?.toUpperCase()}</Tag>,
    },
    {
      title: 'Parent',
      dataIndex: ['parent', 'name'],
      key: 'parent',
      responsive: ['lg'],
      render: (text) => text || '-',
    },
    {
      title: 'Order',
      dataIndex: 'sort_order',
      key: 'sort_order',
      responsive: ['xl'],
      sorter: (a, b) => a.sort_order - b.sort_order,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => {
        const menu = {
          items: [
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
                  title: 'Delete this category?',
                  onOk: () => handleDelete(record.id),
                })
              },
            },
          ],
        }

        return (
          <>
            <Space className="desktop-actions" style={{ display: 'none' }}>
              <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)}>
                Edit
              </Button>
              <Popconfirm
                title="Delete this category?"
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

  const filtered = categories.filter((cat) => {
    const term = searchText.toLowerCase()
    return (
      cat.name?.toLowerCase().includes(term) ||
      cat.slug?.toLowerCase().includes(term)
    )
  })

  // For Upload display list
  const uploadFileList = selectedFile
    ? [{ uid: '-1', name: selectedFile.name, status: 'done', url: URL.createObjectURL(selectedFile) }]
    : existingImageUrl
      ? [{ uid: '-1', name: 'current-image', status: 'done', url: getAssetUrl(existingImageUrl) }]
      : []

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[8, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Title level={3} style={{ margin: 0 }}>
            <AppstoreOutlined style={{ marginRight: 12 }} />
            Categories
          </Title>
        </Col>
        <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchCategories}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              Add Category
            </Button>
          </Space>
        </Col>
      </Row>

      <Card
        title={
          <Input
            placeholder="Search categories..."
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
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true, responsive: true }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* Add/Edit Modal with Image Upload */}
      <Modal
        title={editingCat ? 'Edit Category' : 'Add New Category'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText={editingCat ? 'Update' : 'Create'}
        destroyOnClose
        width={600}
        confirmLoading={loading} // optional: show loading on OK button
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="name"
                label="Name"
                rules={[{ required: true, message: 'Please enter name' }]}
              >
                <Input placeholder="Category name" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="slug"
                label="Slug"
                rules={[{ required: true, message: 'Please enter slug' }]}
              >
                <Input placeholder="category-slug" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="parent_id" label="Parent Category">
                <Select allowClear placeholder="None (top-level)">
                  {categories
                    .filter((c) => c.id !== editingCat?.id)
                    .map((c) => (
                      <Option key={c.id} value={c.id}>
                        {c.name}
                      </Option>
                    ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="trade_type" label="Trade Type">
                <Select>
                  <Option value="both">Both</Option>
                  <Option value="import">Import</Option>
                  <Option value="export">Export</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="sort_order" label="Sort Order">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          {/* Category Image Upload */}
          <Form.Item label="Image">
            <Upload
              listType="picture-card"
              fileList={uploadFileList}
              maxCount={1}
              accept="image/*"
              beforeUpload={(file) => {
                setSelectedFile(file)
                setExistingImageUrl(null) // new file replaces any existing image
                return false // prevent auto upload
              }}
              onRemove={() => {
                setSelectedFile(null)
                setExistingImageUrl(null) // allow removing image entirely
              }}
            >
              {uploadFileList.length >= 1 ? null : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>Upload</div>
                </div>
              )}
            </Upload>
            <Text type="secondary">Recommended: square image, max 1MB</Text>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}