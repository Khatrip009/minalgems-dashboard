import { useEffect, useState } from 'react'
import {
  Table, Button, Space, Card, Row, Col, Typography, message, Modal, Form,
  Input, Switch, InputNumber, Upload, Popconfirm, Dropdown, Tag, Image,
} from 'antd'
import {
  ReloadOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  PictureOutlined, MoreOutlined, UploadOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { uploadFile, getAssetUrl } from '../utilities/storage'

const { Title, Text } = Typography

export default function HeroSlides() {
  const [slides, setSlides] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSlide, setEditingSlide] = useState(null)
  const [form] = Form.useForm()
  const [fileList, setFileList] = useState([])
  const [uploading, setUploading] = useState(false)
  const [imagePath, setImagePath] = useState(null) // stores relative path after upload

  const fetchSlides = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('hero_slides')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      message.error('Failed to load hero slides')
      setLoading(false)
      return
    }
    setSlides(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchSlides() }, [])

  const handleAdd = () => {
    setEditingSlide(null)
    form.resetFields()
    form.setFieldsValue({ is_active: true, sort_order: 0 })
    setFileList([])
    setImagePath(null)
    setModalOpen(true)
  }

  const handleEdit = (record) => {
    setEditingSlide(record)
    form.setFieldsValue({
      title: record.title,
      subtitle: record.subtitle,
      video_url: record.video_url,
      is_active: record.is_active,
      sort_order: record.sort_order,
    })
    setImagePath(record.image_url || null)
    if (record.image_url) {
      setFileList([{
        uid: '-1',
        name: 'current-image',
        status: 'done',
        url: getAssetUrl(record.image_url),
      }])
    } else {
      setFileList([])
    }
    setModalOpen(true)
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('hero_slides').delete().eq('id', id)
    if (error) {
      message.error('Delete failed')
    } else {
      message.success('Slide deleted')
      fetchSlides()
    }
  }

  // Immediate upload handler – called when a file is selected
  const handleCustomUpload = async (options) => {
    const { file, onSuccess, onError } = options
    setUploading(true)
    try {
      const relativePath = await uploadFile(file, 'hero')
      console.log('Uploaded hero image:', relativePath)
      setImagePath(relativePath)
      setFileList([{
        uid: file.uid,
        name: file.name,
        status: 'done',
        url: getAssetUrl(relativePath),
      }])
      onSuccess('OK')
      message.success('Image uploaded')
    } catch (err) {
      console.error('Upload error:', err)
      onError(err)
      message.error(`Upload failed: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const payload = {
        ...values,
        image_url: imagePath,   // already uploaded or existing path
      }
      console.log('Saving slide:', payload)

      if (editingSlide) {
        const { error } = await supabase
          .from('hero_slides')
          .update(payload)
          .eq('id', editingSlide.id)
        if (error) {
          console.error('Update error:', error)
          message.error('Update failed: ' + error.message)
          return
        }
        message.success('Slide updated')
      } else {
        const { error } = await supabase.from('hero_slides').insert([payload])
        if (error) {
          console.error('Insert error:', error)
          message.error('Insert failed: ' + error.message)
          return
        }
        message.success('Slide added')
      }
      setModalOpen(false)
      form.resetFields()
      setFileList([])
      setImagePath(null)
      fetchSlides()
    } catch (err) {
      console.error('Form validation error:', err)
    }
  }

  const columns = [
    {
      title: 'Image',
      key: 'image',
      width: 80,
      render: (_, record) => {
        const src = record.image_url ? getAssetUrl(record.image_url) : null
        return src ? (
          <Image src={src} width={60} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} />
        ) : (
          <div style={{ width: 60, height: 40, background: '#f0f0f0', borderRadius: 4 }} />
        )
      },
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: 'Subtitle',
      dataIndex: 'subtitle',
      key: 'subtitle',
      responsive: ['sm'],
    },
    {
      title: 'Order',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 80,
      sorter: (a, b) => a.sort_order - b.sort_order,
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v) => v ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => {
        const menu = {
          items: [
            { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => handleEdit(record) },
            { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: () => { Modal.confirm({ title: 'Delete?', onOk: () => handleDelete(record.id) }) } },
          ],
        }
        return (
          <>
            <Space className="desktop-actions" style={{ display: 'none' }}>
              <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)}>Edit</Button>
              <Popconfirm title="Delete?" onConfirm={() => handleDelete(record.id)}>
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

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[8, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Title level={3} style={{ margin: 0 }}>
            <PictureOutlined style={{ marginRight: 12 }} />
            Hero Slides
          </Title>
        </Col>
        <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchSlides}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              Add Slide
            </Button>
          </Space>
        </Col>
      </Row>

      <Card bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={slides}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, responsive: true }}
          scroll={{ x: 'max-content' }}
          size="small"
        />
      </Card>

      <Modal
        title={editingSlide ? 'Edit Slide' : 'Add Slide'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={uploading}
        okText={editingSlide ? 'Update' : 'Create'}
        destroyOnClose
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="subtitle" label="Subtitle">
            <Input />
          </Form.Item>
          <Form.Item name="video_url" label="Video URL (optional)">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item label="Image">
            <Upload
              listType="picture-card"
              fileList={fileList}
              maxCount={1}
              accept="image/*"
              customRequest={handleCustomUpload}
              onRemove={() => {
                setFileList([])
                setImagePath(null)
              }}
            >
              {fileList.length >= 1 ? null : (
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>Upload</div>
                </div>
              )}
            </Upload>
            <Text type="secondary">Recommended: 1920×800px</Text>
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="sort_order" label="Sort Order">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="is_active" label="Active" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}