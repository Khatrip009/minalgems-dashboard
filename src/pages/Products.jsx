import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Space, Input, Card, Row, Col, Typography, message, Modal, Upload,
  Descriptions, Tag, Popconfirm, Select, InputNumber, Form, Dropdown,
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined, ImportOutlined,
  UploadOutlined, EditOutlined, DeleteOutlined,
  ExpandOutlined, CompressOutlined, ShoppingOutlined,
  PlusCircleOutlined, MinusCircleOutlined, MoreOutlined, FilePdfOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { generateProductRegisterPDF } from '../utilities/productRegisterPdf'
import { getAssetUrl } from '../utilities/storage'  // ✅ new import
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Option } = Select

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [expandedRowKeys, setExpandedRowKeys] = useState([])
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const navigate = useNavigate()

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [form] = Form.useForm()

  // Import modal
  const [importModalOpen, setImportModalOpen] = useState(false)

  const fetchProducts = async () => {
    setLoading(true)
    // ✅ Updated query to include product assets
    const { data, error } = await supabase
      .from('products')
      .select(`*, categories ( name ), craftsmen ( name ), product_assets ( url, asset_type, is_primary )`)
      .order('created_at', { ascending: false })

    if (error) {
      message.error('Failed to load products')
      setLoading(false)
      return
    }

    const enriched = await Promise.all(
      data.map(async (product) => {
        const { data: diamonds } = await supabase
          .from('product_diamonds')
          .select('*')
          .eq('product_id', product.id)
        return { ...product, diamonds: diamonds || [] }
      })
    )

    setProducts(enriched)
    setLoading(false)
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  // Delete product
  const handleDelete = async (id) => {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) message.error('Delete failed')
    else {
      message.success('Product deleted')
      fetchProducts()
    }
  }

  // Edit product
  const handleEdit = (record) => {
    setEditingProduct(record)
    form.setFieldsValue(record)
    setEditModalOpen(true)
  }

  const handleEditSave = async () => {
    const values = await form.validateFields()
    const { error } = await supabase.from('products').update(values).eq('id', editingProduct.id)
    if (error) message.error('Update failed')
    else {
      message.success('Product updated')
      setEditModalOpen(false)
      fetchProducts()
    }
  }

  // Expand / collapse all
  const handleExpandAll = () => {
    if (expandedRowKeys.length === products.length) {
      setExpandedRowKeys([])
    } else {
      setExpandedRowKeys(products.map((p) => p.id))
    }
  }

  // Export CSV (unchanged, working)
  const exportToCSV = async () => {
    setLoading(true)
    const { data: productsData } = await supabase.from('products').select('*')
    const { data: diamondsData } = await supabase.from('product_diamonds').select('*')
    const merged = productsData.map((prod) => ({
      ...prod,
      diamonds: diamondsData.filter((d) => d.product_id === prod.id),
    }))

    const headers = [
      'SKU', 'Title', 'Slug', 'Description', 'Short Description', 'Category',
      'Price', 'Currency', 'MOQ', 'Stock', 'Published', 'Metal Type',
      'Gold Carat', 'Total Weight', 'Gold Weight', 'Total Diamond Pcs',
      'Total Diamond Carat', 'Total Diamond Price', 'Metal Rate',
      'Total Metal Price', 'Labour', 'Profit %', 'Profit Amount',
      'Diamonds (JSON)', 'Item No', 'Trade Type', 'Created At',
    ]

    const csvRows = merged.map((prod) =>
      [
        prod.sku || '', prod.title, prod.slug, prod.description || '',
        prod.short_description || '', prod.categories?.name || '',
        prod.price, prod.currency, prod.moq, prod.available_qty,
        prod.is_published ? 'Yes' : 'No', prod.metal_type, prod.gold_carat,
        prod.total_weight, prod.gold_weight, prod.total_diamond_pcs,
        prod.total_diamond_carat, prod.total_diamond_price, prod.metal_rate,
        prod.total_metal_price, prod.labour, prod.profit_percent,
        prod.profit_amount, JSON.stringify(prod.diamonds || []),
        prod.item_no || '', prod.trade_type,
        dayjs(prod.created_at).format('YYYY-MM-DD HH:mm:ss'),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `products_export_${dayjs().format('YYYYMMDD_HHmm')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setLoading(false)
    message.success('Export completed')
  }

  // Import CSV (unchanged)
  const importCSV = async (file) => {
    setLoading(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target.result
        const rows = text.split('\n').map((r) => {
          const cols = []
          let current = '',
            inQuotes = false
          for (const ch of r) {
            if (ch === '"') {
              inQuotes = !inQuotes
            } else if (ch === ',' && !inQuotes) {
              cols.push(current.trim())
              current = ''
            } else {
              current += ch
            }
          }
          cols.push(current.trim())
          return cols
        })

        if (rows.length < 2) {
          message.error('Empty CSV')
          setLoading(false)
          return
        }

        const headers = rows[0].map((h) => h.replace(/"/g, ''))
        const dataRows = rows.slice(1).filter((row) => row.length === headers.length)

        let inserted = 0,
          updated = 0

        for (const row of dataRows) {
          const obj = {}
          headers.forEach((h, i) => {
            obj[h] = row[i].replace(/^"|"$/g, '').replace(/""/g, '"')
          })

          const productData = {
            sku: obj['SKU'] || null,
            title: obj['Title'],
            slug: obj['Slug'],
            description: obj['Description'] || null,
            short_description: obj['Short Description'] || null,
            price: parseFloat(obj['Price']) || 0,
            currency: obj['Currency'] || 'INR',
            moq: parseInt(obj['MOQ']) || 1,
            available_qty: parseInt(obj['Stock']) || 0,
            is_published: obj['Published']?.toLowerCase() === 'yes',
            metal_type: obj['Metal Type'] || 'gold',
            gold_carat: parseFloat(obj['Gold Carat']) || 18,
            total_weight: parseFloat(obj['Total Weight']) || 0,
            gold_weight: parseFloat(obj['Gold Weight']) || 0,
            total_diamond_pcs: parseInt(obj['Total Diamond Pcs']) || 0,
            total_diamond_carat: parseFloat(obj['Total Diamond Carat']) || 0,
            total_diamond_price: parseFloat(obj['Total Diamond Price']) || 0,
            metal_rate: parseFloat(obj['Metal Rate']) || 0,
            total_metal_price: parseFloat(obj['Total Metal Price']) || 0,
            labour: parseFloat(obj['Labour']) || 0,
            profit_percent: parseFloat(obj['Profit %']) || 0,
            profit_amount: parseFloat(obj['Profit Amount']) || 0,
            item_no: obj['Item No'] || null,
            trade_type: obj['Trade Type'] || 'both',
            created_at: obj['Created At']
              ? dayjs(obj['Created At']).toISOString()
              : new Date().toISOString(),
          }

          let diamonds = []
          try {
            diamonds = JSON.parse(obj['Diamonds (JSON)'] || '[]')
          } catch (e) {
            diamonds = []
          }

          const { data: existing } = await supabase
            .from('products')
            .select('id')
            .eq('sku', productData.sku)
            .maybeSingle()

          if (existing) {
            await supabase.from('products').update(productData).eq('id', existing.id)
            await supabase.from('product_diamonds').delete().eq('product_id', existing.id)
            if (diamonds.length > 0) {
              await supabase.from('product_diamonds').insert(
                diamonds.map((d) => ({ ...d, id: undefined, product_id: existing.id }))
              )
            }
            updated++
          } else {
            const { data: newProd } = await supabase
              .from('products')
              .insert(productData)
              .select()
              .single()
            if (newProd && diamonds.length > 0) {
              await supabase.from('product_diamonds').insert(
                diamonds.map((d) => ({ ...d, id: undefined, product_id: newProd.id }))
              )
            }
            inserted++
          }
        }

        message.success(`Import done: ${inserted} inserted, ${updated} updated`)
        setImportModalOpen(false)
        fetchProducts()
      } catch (err) {
        message.error('CSV parsing error: ' + err.message)
      } finally {
        setLoading(false)
      }
    }
    reader.readAsText(file)
    return false
  }

  // --- Export PDF handler ---
  const handleExportPDF = async (type) => {
    let selectedProducts = []
    if (type === 'selected') {
      if (selectedRowKeys.length === 0) {
        message.warning('Select products to export')
        return
      }
      selectedProducts = products.filter(p => selectedRowKeys.includes(p.id))
    } else {
      selectedProducts = products
    }

    const { data: org } = await supabase.from('organizations').select('*').eq('slug', 'minal-gems').single()

    generateProductRegisterPDF(selectedProducts, org)
    message.success(`PDF exported with ${selectedProducts.length} products`)
  }

  // Expandable row content (mobile‑optimised)
  const expandedRowRender = (record) => (
    <div style={{ padding: 16, background: '#fafafa' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Descriptions title="Pricing Details" bordered size="small" column={1}>
            <Descriptions.Item label="Base Price">
              ₹{record.price?.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="Metal Type">{record.metal_type}</Descriptions.Item>
            <Descriptions.Item label="Gold Purity">{record.gold_carat}K</Descriptions.Item>
            <Descriptions.Item label="Gold Weight">{record.gold_weight} g</Descriptions.Item>
            <Descriptions.Item label="Metal Rate">
              ₹{record.metal_rate?.toLocaleString()} / g
            </Descriptions.Item>
            <Descriptions.Item label="Metal Total">
              ₹{record.total_metal_price?.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="Labour">
              ₹{record.labour?.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="Profit %">{record.profit_percent}%</Descriptions.Item>
            <Descriptions.Item label="Profit Amount">
              ₹{record.profit_amount?.toLocaleString()}
            </Descriptions.Item>
          </Descriptions>
        </Col>

        <Col xs={24} sm={12}>
          <Descriptions title="Diamonds" bordered size="small" column={1}>
            <Descriptions.Item label="Total Pcs">{record.total_diamond_pcs}</Descriptions.Item>
            <Descriptions.Item label="Total Carat">
              {record.total_diamond_carat} ct
            </Descriptions.Item>
            <Descriptions.Item label="Total Diamond Price">
              ₹{record.total_diamond_price?.toLocaleString()}
            </Descriptions.Item>
          </Descriptions>
          {record.diamonds?.length > 0 && (
            <Table
              style={{ marginTop: 12 }}
              size="small"
              dataSource={record.diamonds}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Type', dataIndex: 'diamond_type', key: 'diamond_type' },
                { title: 'Shape', dataIndex: 'shape', key: 'shape' },
                { title: 'Color', dataIndex: 'color', key: 'color' },
                { title: 'Clarity', dataIndex: 'clarity', key: 'clarity' },
                { title: 'Carat', dataIndex: 'carat', key: 'carat' },
                { title: 'Pcs', dataIndex: 'pcs', key: 'pcs' },
                {
                  title: 'Rate',
                  dataIndex: 'rate',
                  key: 'rate',
                  render: (v) => `₹${v?.toLocaleString()}`,
                },
                {
                  title: 'Total Price',
                  dataIndex: 'total_price',
                  key: 'total_price',
                  render: (v) => `₹${v?.toLocaleString()}`,
                },
              ]}
            />
          )}
        </Col>

        <Col span={24}>
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Category">
              {record.categories?.name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Craftsman">
              {record.craftsmen?.name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Trade Type">{record.trade_type}</Descriptions.Item>
            <Descriptions.Item label="Published">
              {record.is_published ? 'Yes' : 'No'}
            </Descriptions.Item>
            <Descriptions.Item label="Item No">{record.item_no || '-'}</Descriptions.Item>
            <Descriptions.Item label="Created">
              {dayjs(record.created_at).format('DD/MM/YYYY HH:mm')}
            </Descriptions.Item>
          </Descriptions>
        </Col>
      </Row>
    </div>
  )

  // ✅ Updated columns with real image
  const columns = [
    {
      title: 'Image',
      key: 'image',
      width: 60,
      responsive: ['sm'],
      render: (_, record) => {
        const assets = record.product_assets || []
        // find the first primary image, or fallback to first image
        const primaryAsset = assets.find(a => a.is_primary && a.asset_type === 'image') || assets.find(a => a.asset_type === 'image') || assets[0]
        const src = primaryAsset ? getAssetUrl(primaryAsset.url) : null
        return (
          <div style={{ width: 40, height: 40, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
            {src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
        )
      },
    },
    {
      title: 'Item No',
      dataIndex: 'item_no',
      key: 'item_no',
      width: 100,
      responsive: ['md'],
      sorter: (a, b) => (a.item_no || '').localeCompare(b.item_no || ''),
      render: (text) => (text ? <Tag color="blue">{text}</Tag> : '-'),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      sorter: (a, b) => a.title.localeCompare(b.title),
      ellipsis: true,
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      sorter: (a, b) => a.price - b.price,
      render: (v) => `₹${v?.toLocaleString()}`,
      width: 100,
    },
    {
      title: 'Stock',
      dataIndex: 'available_qty',
      key: 'available_qty',
      width: 80,
    },
    {
      title: 'Category',
      dataIndex: ['categories', 'name'],
      key: 'category',
      responsive: ['lg'],
    },
    {
      title: 'Published',
      dataIndex: 'is_published',
      key: 'is_published',
      responsive: ['md'],
      render: (v) =>
        v ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
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
                  title: 'Delete this product?',
                  onOk: () => handleDelete(record.id),
                })
              },
            },
          ],
        }

        return (
          <>
            <Space className="desktop-actions" style={{ display: 'none' }}>
              <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                Edit
              </Button>
              <Popconfirm
                title="Delete this product?"
                onConfirm={() => handleDelete(record.id)}
              >
                <Button danger type="link" icon={<DeleteOutlined />}>
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

  const filtered = products.filter((p) => {
    const t = searchText.toLowerCase()
    return (
      p.title?.toLowerCase().includes(t) ||
      p.sku?.toLowerCase().includes(t) ||
      p.categories?.name?.toLowerCase().includes(t)
    )
  })

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[8, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Title level={3} style={{ margin: 0 }}>
            <ShoppingOutlined style={{ marginRight: 12 }} />
            Products
          </Title>
        </Col>
        <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchProducts}>Refresh</Button>
            <Button icon={<ExportOutlined />} onClick={exportToCSV}>Export CSV</Button>
            <Button icon={<ImportOutlined />} onClick={() => setImportModalOpen(true)}>Import CSV</Button>
            <Button
              icon={<FilePdfOutlined />}
              onClick={() => handleExportPDF('all')}
            >
              Export All PDF
            </Button>
            <Button
              icon={<FilePdfOutlined />}
              disabled={selectedRowKeys.length === 0}
              onClick={() => handleExportPDF('selected')}
            >
              Export Selected PDF
            </Button>
            <Button
              icon={
                expandedRowKeys.length === products.length ? (
                  <CompressOutlined />
                ) : (
                  <ExpandOutlined />
                )
              }
              onClick={handleExpandAll}
            >
              {expandedRowKeys.length === products.length ? 'Collapse' : 'Expand'}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/products/new')}>
              Add Product
            </Button>
          </Space>
        </Col>
      </Row>

      <Card
        title={
          <Input
            placeholder="Search products..."
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
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          expandable={{
            expandedRowRender,
            expandedRowKeys,
            onExpandedRowsChange: (keys) => setExpandedRowKeys(keys),
            rowExpandable: () => true,
            expandIcon: ({ expanded, onExpand, record }) =>
              expanded ? (
                <MinusCircleOutlined
                  onClick={(e) => onExpand(record, e)}
                  style={{ cursor: 'pointer', fontSize: 18 }}
                />
              ) : (
                <PlusCircleOutlined
                  onClick={(e) => onExpand(record, e)}
                  style={{ cursor: 'pointer', fontSize: 18 }}
                />
              ),
          }}
          pagination={{ pageSize: 20, showSizeChanger: true, responsive: true }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* Quick Edit Modal */}
      <Modal
        title="Edit Product"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleEditSave}
        okText="Save"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="price" label="Price">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="available_qty" label="Stock">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="is_published" label="Published">
            <Select>
              <Option value={true}>Yes</Option>
              <Option value={false}>No</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Import CSV Modal */}
      <Modal
        title="Import Products from CSV"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text strong>CSV Format:</Text>
          <Text code style={{ fontSize: 12, wordBreak: 'break-all' }}>
            SKU,Title,Slug,Description,Short Description,Category,Price,Currency,MOQ,
            Stock,Published,Metal Type,Gold Carat,Total Weight,Gold Weight,Total Diamond
            Pcs,Total Diamond Carat,Total Diamond Price,Metal Rate,Total Metal
            Price,Labour,Profit %,Profit Amount,Diamonds (JSON),Item No,Trade
            Type,Created At
          </Text>
          <Upload accept=".csv" beforeUpload={importCSV} showUploadList={false}>
            <Button icon={<UploadOutlined />} block>
              Select CSV File
            </Button>
          </Upload>
        </Space>
      </Modal>
    </div>
  )
}