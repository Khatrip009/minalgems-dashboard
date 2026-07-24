import { useState, useEffect } from 'react'
import {
  Steps, Button, Form, Input, InputNumber, Select, Row, Col, Card, message, Upload,
  Table, Space, Popconfirm, Typography, Divider, Descriptions
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, FileImageOutlined,
  VideoCameraOutlined, CodepenOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { uploadFile, generateProductFileName, getAssetUrl } from '../utilities/storage'

const { Title, Text } = Typography
const { Option } = Select

export default function ProductCreate() {
  const navigate = useNavigate()
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(false)

  // Basic info
  const [basicInfo, setBasicInfo] = useState({
    sku: '', title: '', slug: '', description: '', short_description: '',
    category_id: null, metal_type: 'gold', gold_carat: 18,
    total_weight: 0, gold_weight: 0, moq: 1, available_qty: 0,
    is_published: false, trade_type: 'both', item_no: '',
    craftsman_id: null, tax_category_id: null
  })

  // Pricing
  const [pricing, setPricing] = useState({
    metal_rate: 0, labour: 0, profit_percent: 0
  })

  // Diamonds
  const [diamonds, setDiamonds] = useState([])

  // Media files
  const [fileList, setFileList] = useState([])

  // Dropdown data
  const [categories, setCategories] = useState([])
  const [craftsmen, setCraftsmen] = useState([])
  const [taxCategories, setTaxCategories] = useState([])

  useEffect(() => {
    supabase.from('categories').select('id, name').then(({ data }) => setCategories(data || []))
    supabase.from('craftsmen').select('id, name').then(({ data }) => setCraftsmen(data || []))
    supabase.from('tax_categories').select('id, name').then(({ data }) => setTaxCategories(data || []))
  }, [])

  // Auto‑generate SKU and slug when title changes
  const handleTitleChange = (title) => {
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
    const prefix = title.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase()
    const random = Math.floor(1000 + Math.random() * 9000)
    const sku = prefix ? `${prefix}-${random}` : `SKU-${random}`
    setBasicInfo(prev => ({ ...prev, title, slug, sku }))
  }

  // Add diamond row
  const addDiamond = () => {
    setDiamonds(prev => [...prev, {
      key: Date.now().toString(),
      diamond_type: 'Diamond', shape: 'Round', color: 'EF', clarity: 'VVS',
      carat: 0, pcs: 1, rate: 0, total_price: 0
    }])
  }

  // Update diamond field
  const updateDiamond = (key, field, value) => {
    setDiamonds(prev => prev.map(d => {
      if (d.key !== key) return d
      const newD = { ...d, [field]: value }
      if (field === 'carat' || field === 'rate') {
        newD.total_price = (newD.carat || 0) * (newD.rate || 0)
      }
      return newD
    }))
  }

  // Remove diamond
  const removeDiamond = (key) => setDiamonds(prev => prev.filter(d => d.key !== key))

  // Diamond totals
  const totalDiamondPcs = diamonds.reduce((sum, d) => sum + (d.pcs || 0), 0)
  const totalDiamondCarat = diamonds.reduce((sum, d) => sum + (d.carat || 0), 0)
  const totalDiamondPrice = diamonds.reduce((sum, d) => sum + (d.total_price || 0), 0)

  // Pricing calculations
  const metalTotal = (basicInfo.gold_weight || 0) * (pricing.metal_rate || 0)
  const cost = metalTotal + totalDiamondPrice + (pricing.labour || 0)
  const profitAmount = cost * ((pricing.profit_percent || 0) / 100)
  const finalPrice = cost + profitAmount

  // ✅ Upload files using custom storage
  const uploadFiles = async (productId) => {
    for (const file of fileList) {
      try {
        const originFile = file.originFileObj || file
        const ext = originFile.name.split('.').pop().toLowerCase()
        let assetType = 'other'
        if (originFile.type?.startsWith('image/')) assetType = 'image'
        else if (originFile.type?.startsWith('video/')) assetType = 'video'
        else if (['glb', 'gltf'].includes(ext)) assetType = '3d'

        const uniqueName = generateProductFileName(originFile.name, basicInfo.item_no)
        // Create a new File object with the unique name
        const renamedFile = new File([originFile], uniqueName, { type: originFile.type })

        const relativePath = await uploadFile(renamedFile, 'products')

        await supabase.from('product_assets').insert({
          product_id: productId,
          asset_type: assetType,
          url: relativePath,
          filename: originFile.name,
          file_type: originFile.type,
          is_primary: false,
          sort_order: 0,
        })
      } catch (err) {
        message.error(`Upload failed for ${file.name}: ${err.message}`)
      }
    }
  }

  // Final submit
  const handleSubmit = async () => {
    setLoading(true)

    const productPayload = {
      ...basicInfo,
      price: finalPrice,
      total_diamond_pcs: totalDiamondPcs,
      total_diamond_carat: totalDiamondCarat,
      total_diamond_price: totalDiamondPrice,
      metal_rate: pricing.metal_rate,
      total_metal_price: metalTotal,
      labour: pricing.labour,
      profit_percent: pricing.profit_percent,
      profit_amount: profitAmount
    }

    const { data: productData, error: productErr } = await supabase
      .from('products')
      .insert([productPayload])
      .select()
      .single()

    if (productErr) {
      message.error('Failed to create product: ' + productErr.message)
      setLoading(false)
      return
    }

    const productId = productData.id

    // Insert diamonds
    if (diamonds.length > 0) {
      const diamondRows = diamonds.map(d => ({
        product_id: productId,
        diamond_type: d.diamond_type,
        shape: d.shape,
        color: d.color,
        clarity: d.clarity,
        carat: d.carat,
        pcs: d.pcs,
        rate: d.rate,
        total_price: d.total_price
      }))
      await supabase.from('product_diamonds').insert(diamondRows)
    }

    // Upload media
    if (fileList.length > 0) {
      await uploadFiles(productId)
    }

    message.success('Product created successfully!')
    setLoading(false)
    navigate('/products')
  }

  const steps = [
    { title: 'Basic Info' },
    { title: 'Diamonds' },
    { title: 'Pricing' },
    { title: 'Media' },
    { title: 'Review' }
  ]

  const renderStepContent = () => {
    switch (current) {
      case 0:   // Basic Info
        return (
          <Form layout="vertical">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Form.Item label="Title" required>
                  <Input value={basicInfo.title} onChange={e => handleTitleChange(e.target.value)} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Slug">
                  <Input value={basicInfo.slug} onChange={e => setBasicInfo({...basicInfo, slug: e.target.value})} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Form.Item label="SKU (auto‑generated)">
                  <Input value={basicInfo.sku} disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Item No">
                  <Input value={basicInfo.item_no} onChange={e => setBasicInfo({...basicInfo, item_no: e.target.value})} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Description">
              <Input.TextArea rows={3} value={basicInfo.description} onChange={e => setBasicInfo({...basicInfo, description: e.target.value})} />
            </Form.Item>
            <Form.Item label="Short Description">
              <Input value={basicInfo.short_description} onChange={e => setBasicInfo({...basicInfo, short_description: e.target.value})} />
            </Form.Item>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Form.Item label="Category">
                  <Select allowClear value={basicInfo.category_id} onChange={val => setBasicInfo({...basicInfo, category_id: val})} placeholder="Select">
                    {categories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Metal Type">
                  <Select value={basicInfo.metal_type} onChange={val => setBasicInfo({...basicInfo, metal_type: val})}>
                    <Option value="gold">Gold</Option>
                    <Option value="White_Gold">White Gold</Option>
                    <Option value="Rose_Gold">Rose Gold</Option>
                    <Option value="Platinum">Platinum</Option>
                    <Option value="Silver">Silver</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Gold Carat">
                  <InputNumber min={0} max={24} value={basicInfo.gold_carat} onChange={val => setBasicInfo({...basicInfo, gold_carat: val})} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Form.Item label="Total Weight (g)">
                  <InputNumber min={0} step={0.001} value={basicInfo.total_weight} onChange={val => setBasicInfo({...basicInfo, total_weight: val})} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Gold Weight (g)">
                  <InputNumber min={0} step={0.001} value={basicInfo.gold_weight} onChange={val => setBasicInfo({...basicInfo, gold_weight: val})} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="MOQ">
                  <InputNumber min={1} value={basicInfo.moq} onChange={val => setBasicInfo({...basicInfo, moq: val})} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Stock">
                  <InputNumber min={0} value={basicInfo.available_qty} onChange={val => setBasicInfo({...basicInfo, available_qty: val})} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Form.Item label="Published">
                  <Select value={basicInfo.is_published} onChange={val => setBasicInfo({...basicInfo, is_published: val})}>
                    <Option value={true}>Yes</Option>
                    <Option value={false}>No</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Trade Type">
                  <Select value={basicInfo.trade_type} onChange={val => setBasicInfo({...basicInfo, trade_type: val})}>
                    <Option value="both">Both</Option>
                    <Option value="import">Import</Option>
                    <Option value="export">Export</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Craftsman">
                  <Select allowClear value={basicInfo.craftsman_id} onChange={val => setBasicInfo({...basicInfo, craftsman_id: val})} placeholder="Optional">
                    {craftsmen.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Tax Category">
              <Select allowClear value={basicInfo.tax_category_id} onChange={val => setBasicInfo({...basicInfo, tax_category_id: val})} placeholder="Optional">
                {taxCategories.map(tc => <Option key={tc.id} value={tc.id}>{tc.name}</Option>)}
              </Select>
            </Form.Item>
          </Form>
        )

      case 1:   // Diamonds
        return (
          <div>
            <Button type="dashed" onClick={addDiamond} icon={<PlusOutlined />} style={{ marginBottom: 16 }}>
              Add Diamond
            </Button>
            <Table
              dataSource={diamonds}
              rowKey="key"
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
            >
              <Table.Column title="Type" dataIndex="diamond_type" render={(v, r) => <Input value={v} onChange={e => updateDiamond(r.key, 'diamond_type', e.target.value)} />} />
              <Table.Column title="Shape" dataIndex="shape" render={(v, r) => <Input value={v} onChange={e => updateDiamond(r.key, 'shape', e.target.value)} />} />
              <Table.Column title="Color" dataIndex="color" render={(v, r) => <Input value={v} onChange={e => updateDiamond(r.key, 'color', e.target.value)} />} />
              <Table.Column title="Clarity" dataIndex="clarity" render={(v, r) => <Input value={v} onChange={e => updateDiamond(r.key, 'clarity', e.target.value)} />} />
              <Table.Column title="Carat" dataIndex="carat" render={(v, r) => <InputNumber min={0} step={0.001} value={v} onChange={val => updateDiamond(r.key, 'carat', val)} />} />
              <Table.Column title="Pcs" dataIndex="pcs" render={(v, r) => <InputNumber min={1} value={v} onChange={val => updateDiamond(r.key, 'pcs', val)} />} />
              <Table.Column title="Rate (₹)" dataIndex="rate" render={(v, r) => <InputNumber min={0} value={v} onChange={val => updateDiamond(r.key, 'rate', val)} />} />
              <Table.Column title="Total Price" dataIndex="total_price" render={(v) => `₹${v?.toLocaleString()}`} />
              <Table.Column title="Action" render={(_, r) => (
                <Popconfirm title="Remove?" onConfirm={() => removeDiamond(r.key)}>
                  <Button danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>
              )} />
            </Table>
            <Divider />
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}><Text strong>Total Pcs:</Text> {totalDiamondPcs}</Col>
              <Col xs={24} sm={8}><Text strong>Total Carat:</Text> {totalDiamondCarat}</Col>
              <Col xs={24} sm={8}><Text strong>Total Diamond Value:</Text> ₹{totalDiamondPrice.toLocaleString()}</Col>
            </Row>
          </div>
        )

      case 2:   // Pricing
        return (
          <Form layout="vertical">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Form.Item label="Metal Rate (₹/g)">
                  <InputNumber min={0} value={pricing.metal_rate} onChange={val => setPricing({...pricing, metal_rate: val})} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Labour (₹)">
                  <InputNumber min={0} value={pricing.labour} onChange={val => setPricing({...pricing, labour: val})} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Profit (%)">
                  <InputNumber min={0} max={100} value={pricing.profit_percent} onChange={val => setPricing({...pricing, profit_percent: val})} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Divider />
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={6}><Text strong>Metal Total:</Text> ₹{metalTotal.toLocaleString()}</Col>
              <Col xs={24} sm={6}><Text strong>Diamonds:</Text> ₹{totalDiamondPrice.toLocaleString()}</Col>
              <Col xs={24} sm={6}><Text strong>Cost:</Text> ₹{cost.toLocaleString()}</Col>
              <Col xs={24} sm={6}><Text strong>Final Price:</Text> <Text style={{ fontSize: 18, color: '#B8860B' }}>₹{finalPrice.toLocaleString()}</Text></Col>
            </Row>
          </Form>
        )

      case 3:   // Media – enhanced with type icons
        return (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              Supported: images, videos, and 3D models (.glb, .gltf)
            </Text>
            <Upload
              multiple
              listType="picture-card"
              fileList={fileList}
              accept="image/*,video/*,.glb,.gltf"
              beforeUpload={(file) => {
                setFileList(prev => [...prev, file])
                return false
              }}
              onRemove={(file) => {
                setFileList(prev => prev.filter(f => f.uid !== file.uid))
              }}
              itemRender={(originNode, file) => {
                const ext = file.name?.split('.').pop()?.toLowerCase()
                let icon = <FileImageOutlined style={{ fontSize: 24, color: '#888' }} />
                if (file.type?.startsWith('video/')) {
                  icon = <VideoCameraOutlined style={{ fontSize: 24, color: '#888' }} />
                } else if (['glb', 'gltf'].includes(ext)) {
                  icon = <CodepenOutlined style={{ fontSize: 24, color: '#888' }} />
                }
                return (
                  <div style={{ position: 'relative', width: 104, height: 104, borderRadius: 8, overflow: 'hidden', border: '1px solid #d9d9d9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {file.thumbUrl ? (
                      <img src={file.thumbUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      icon
                    )}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', padding: '2px 4px' }}>
                      <Text style={{ color: '#fff', fontSize: 10 }} ellipsis>{file.name}</Text>
                    </div>
                  </div>
                )
              }}
            >
              {fileList.length >= 10 ? null : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>Upload</div>
                </div>
              )}
            </Upload>
          </div>
        )

      case 4:   // Review
        return (
          <div>
            <Title level={4}>Review Product Details</Title>
            <Card>
              <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
                <Descriptions.Item label="Title">{basicInfo.title}</Descriptions.Item>
                <Descriptions.Item label="SKU">{basicInfo.sku}</Descriptions.Item>
                <Descriptions.Item label="Category">
                  {categories.find(c => c.id === basicInfo.category_id)?.name || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Metal Type / Purity">
                  {basicInfo.metal_type} | {basicInfo.gold_carat}K
                </Descriptions.Item>
                <Descriptions.Item label="Gold Weight">{basicInfo.gold_weight}g</Descriptions.Item>
                <Descriptions.Item label="Total Weight">{basicInfo.total_weight}g</Descriptions.Item>
                <Descriptions.Item label="Final Price">
                  ₹{finalPrice.toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="Stock">{basicInfo.available_qty}</Descriptions.Item>
                <Descriptions.Item label="MOQ">{basicInfo.moq}</Descriptions.Item>
                <Descriptions.Item label="Published">
                  {basicInfo.is_published ? 'Yes' : 'No'}
                </Descriptions.Item>
                <Descriptions.Item label="Trade Type">{basicInfo.trade_type}</Descriptions.Item>
                <Descriptions.Item label="Craftsman">
                  {craftsmen.find(c => c.id === basicInfo.craftsman_id)?.name || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Diamonds">
                  {diamonds.length} types | {totalDiamondPcs} pcs | {totalDiamondCarat} ct | ₹{totalDiamondPrice.toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="Media Files">{fileList.length} file(s)</Descriptions.Item>
                {basicInfo.description && <Descriptions.Item label="Description" span={2}>{basicInfo.description}</Descriptions.Item>}
              </Descriptions>
            </Card>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div>
      <Title level={3}>Create New Product</Title>
      <Steps
        current={current}
        items={steps}
        size="small"
        style={{ marginBottom: 32, overflowX: 'auto' }}
      />
      <Card>
        {renderStepContent()}
        <Divider />
        <Row justify="end" gutter={[8, 8]}>
          <Col>
            {current > 0 && <Button onClick={() => setCurrent(current - 1)}>Previous</Button>}
          </Col>
          <Col>
            {current < steps.length - 1 && (
              <Button type="primary" onClick={() => setCurrent(current + 1)}>Next</Button>
            )}
          </Col>
          <Col>
            {current === steps.length - 1 && (
              <Button type="primary" onClick={handleSubmit} loading={loading}>Create Product</Button>
            )}
          </Col>
        </Row>
      </Card>
    </div>
  )
}