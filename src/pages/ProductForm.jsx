import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Steps, Button, Form, Input, InputNumber, Select, Row, Col, Card, message, Upload,
  Table, Space, Popconfirm, Typography, Divider, Descriptions, Tag, Spin
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, FileImageOutlined,
  VideoCameraOutlined, CodepenOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { uploadFile, generateProductFileName, getAssetUrl } from '../utilities/storage'

const { Title, Text } = Typography
const { Option } = Select

const emptyBasicInfo = {
  sku: '', title: '', slug: '', description: '', short_description: '',
  category_id: null, metal_type: 'gold', gold_carat: 18,
  total_weight: 0, gold_weight: 0, moq: 1, available_qty: 0,
  is_published: false, trade_type: 'both', item_no: '',
  craftsman_id: null, tax_category_id: null, currency: 'INR',
}

export default function ProductForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(isEdit)

  const [basicInfo, setBasicInfo] = useState(emptyBasicInfo)
  const [pricing, setPricing] = useState({ metal_rate: 0, labour: 0, profit_percent: 0 })
  const [diamonds, setDiamonds] = useState([])
  const [fileList, setFileList] = useState([])

  // Edit-mode only
  const [existingAssets, setExistingAssets] = useState([])
  const [removedAssetIds, setRemovedAssetIds] = useState([])

  const [categories, setCategories] = useState([])
  const [craftsmen, setCraftsmen] = useState([])
  const [taxCategories, setTaxCategories] = useState([])

  // Dropdown lookups
  useEffect(() => {
    supabase.from('categories').select('id, name')
      .then(({ data, error }) => error ? message.error('Failed to load categories') : setCategories(data || []))
    supabase.from('craftsmen').select('id, name')
      .then(({ data, error }) => error ? message.error('Failed to load craftsmen') : setCraftsmen(data || []))
    supabase.from('tax_categories').select('id, name')
      .then(({ data, error }) => error ? message.error('Failed to load tax categories') : setTaxCategories(data || []))
  }, [])

  // Load existing product in edit mode
  useEffect(() => {
    if (!isEdit) { setInitialLoading(false); return }
    ;(async () => {
      setInitialLoading(true)
      const { data: p, error } = await supabase
        .from('products').select('*').eq('id', id).single()

      if (error || !p) {
        message.error('Product not found')
        navigate('/products')
        return
      }

      const [{ data: dRows }, { data: aRows }] = await Promise.all([
        supabase.from('product_diamonds').select('*').eq('product_id', id),
        supabase.from('product_assets').select('*').eq('product_id', id)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true }),
      ])

      setBasicInfo({
        sku: p.sku || '',
        title: p.title || '',
        slug: p.slug || '',
        description: p.description || '',
        short_description: p.short_description || '',
        category_id: p.category_id ?? null,
        metal_type: p.metal_type || 'gold',
        gold_carat: p.gold_carat ?? 18,
        total_weight: p.total_weight ?? 0,
        gold_weight: p.gold_weight ?? 0,
        moq: p.moq ?? 1,
        available_qty: p.available_qty ?? 0,
        is_published: p.is_published ?? false,
        trade_type: p.trade_type || 'both',
        item_no: p.item_no || '',
        craftsman_id: p.craftsman_id ?? null,
        tax_category_id: p.tax_category_id ?? null,
        currency: p.currency || 'INR',
      })
      setPricing({
        metal_rate: p.metal_rate ?? 0,
        labour: p.labour ?? 0,
        profit_percent: p.profit_percent ?? 0,
      })
      setDiamonds((dRows || []).map(d => ({ ...d, key: d.id })))
      setExistingAssets(aRows || [])
      setInitialLoading(false)
    })()
  }, [isEdit, id, navigate])

  // SKU / slug generation — create mode only
  const handleTitleChange = (title) => {
    if (isEdit) {
      setBasicInfo(prev => ({ ...prev, title }))
      return
    }
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
    const prefix = title.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase()
    const random = Math.floor(1000 + Math.random() * 9000)
    const sku = prefix ? `${prefix}-${random}` : `SKU-${random}`
    setBasicInfo(prev => ({ ...prev, title, slug, sku }))
  }

  const addDiamond = () => {
    setDiamonds(prev => [...prev, {
      key: crypto.randomUUID(),
      diamond_type: 'Diamond', shape: 'Round', color: 'EF', clarity: 'VVS',
      carat: 0, pcs: 1, rate: 0, total_price: 0,
    }])
  }

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

  const removeDiamond = (key) => setDiamonds(prev => prev.filter(d => d.key !== key))

  const totalDiamondPcs = diamonds.reduce((s, d) => s + (d.pcs || 0), 0)
  const totalDiamondCarat = diamonds.reduce((s, d) => s + (d.carat || 0), 0)
  const totalDiamondPrice = diamonds.reduce((s, d) => s + (d.total_price || 0), 0)

  const metalTotal = (basicInfo.gold_weight || 0) * (pricing.metal_rate || 0)
  const cost = metalTotal + totalDiamondPrice + (pricing.labour || 0)
  const profitAmount = cost * ((pricing.profit_percent || 0) / 100)
  const finalPrice = cost + profitAmount

  const uploadFiles = async (productId) => {
    let hasPrimary = existingAssets.some(
      a => a.is_primary && a.asset_type === 'image' && !removedAssetIds.includes(a.id)
    )
    const failed = []

    for (const file of fileList) {
      try {
        const originFile = file.originFileObj || file
        const ext = originFile.name.split('.').pop().toLowerCase()
        let assetType = 'other'
        if (originFile.type?.startsWith('image/')) assetType = 'image'
        else if (originFile.type?.startsWith('video/')) assetType = 'video'
        else if (['glb', 'gltf'].includes(ext)) assetType = '3d'

        const identifier = basicInfo.item_no || basicInfo.sku
        const uniqueName = generateProductFileName(originFile.name, identifier)
        const renamedFile = new File([originFile], uniqueName, { type: originFile.type })
        const relativePath = await uploadFile(renamedFile, 'products')

        const isPrimary = !hasPrimary && assetType === 'image'
        if (isPrimary) hasPrimary = true

        const { error } = await supabase.from('product_assets').insert({
          product_id: productId,
          asset_type: assetType,
          url: relativePath,
          filename: originFile.name,
          file_type: originFile.type,
          is_primary: isPrimary,
          sort_order: 0,
        })
        if (error) throw error
      } catch (err) {
        failed.push(file.name)
      }
    }
    return failed
  }

  const validateStep = () => {
    if (current === 0) {
      if (!basicInfo.title.trim()) { message.error('Title is required'); return false }
      if (!basicInfo.slug.trim())  { message.error('Slug is required');  return false }
      if (!basicInfo.sku.trim())   { message.error('SKU is required');   return false }
    }
    return true
  }

  const handleNext = () => { if (validateStep()) setCurrent(current + 1) }

  const handleSubmit = async () => {
    if (!validateStep()) return
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
      profit_amount: profitAmount,
    }

    let productId = id

    if (isEdit) {
      const { error } = await supabase.from('products').update(productPayload).eq('id', id)
      if (error) {
        message.error('Update failed: ' + error.message)
        setLoading(false)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('products').insert([productPayload]).select().single()
      if (error) {
        message.error('Create failed: ' + error.message)
        setLoading(false)
        return
      }
      productId = data.id
    }

    // Diamonds: replace-all
    await supabase.from('product_diamonds').delete().eq('product_id', productId)
    if (diamonds.length > 0) {
      const { error: dErr } = await supabase.from('product_diamonds').insert(
        diamonds.map(d => ({
          product_id: productId,
          diamond_type: d.diamond_type, shape: d.shape, color: d.color,
          clarity: d.clarity, carat: d.carat, pcs: d.pcs,
          rate: d.rate, total_price: d.total_price,
        }))
      )
      if (dErr) message.warning('Product saved but diamonds failed: ' + dErr.message)
    }

    // Assets: delete removed, then upload new
    if (removedAssetIds.length > 0) {
      const { error: rErr } = await supabase
        .from('product_assets').delete().in('id', removedAssetIds)
      if (rErr) message.warning('Some assets could not be removed')
    }
    if (fileList.length > 0) {
      const failed = await uploadFiles(productId)
      if (failed.length > 0) {
        message.warning(`${failed.length} file(s) failed to upload: ${failed.join(', ')}`)
      }
    }

    message.success(isEdit ? 'Product updated' : 'Product created')
    setLoading(false)
    navigate('/products')
  }

  const steps = [
    { title: 'Basic Info' },
    { title: 'Diamonds' },
    { title: 'Pricing' },
    { title: 'Media' },
    { title: 'Review' },
  ]

  const renderStepContent = () => {
    switch (current) {
      case 0:
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
                  <Input
                    value={basicInfo.slug}
                    onChange={e => setBasicInfo({ ...basicInfo, slug: e.target.value })}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Form.Item label={isEdit ? 'SKU' : 'SKU (auto-generated)'}>
                  <Input value={basicInfo.sku} disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Item No">
                  <Input
                    value={basicInfo.item_no}
                    onChange={e => setBasicInfo({ ...basicInfo, item_no: e.target.value })}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Description">
              <Input.TextArea
                rows={3}
                value={basicInfo.description}
                onChange={e => setBasicInfo({ ...basicInfo, description: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="Short Description">
              <Input
                value={basicInfo.short_description}
                onChange={e => setBasicInfo({ ...basicInfo, short_description: e.target.value })}
              />
            </Form.Item>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Form.Item label="Category">
                  <Select
                    allowClear value={basicInfo.category_id}
                    onChange={val => setBasicInfo({ ...basicInfo, category_id: val })}
                    placeholder="Select"
                  >
                    {categories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Metal Type">
                  <Select
                    value={basicInfo.metal_type}
                    onChange={val => setBasicInfo({ ...basicInfo, metal_type: val })}
                  >
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
                  <InputNumber
                    min={0} max={24} style={{ width: '100%' }}
                    value={basicInfo.gold_carat}
                    onChange={val => setBasicInfo({ ...basicInfo, gold_carat: val })}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Form.Item label="Total Weight (g)">
                  <InputNumber
                    min={0} step={0.001} style={{ width: '100%' }}
                    value={basicInfo.total_weight}
                    onChange={val => setBasicInfo({ ...basicInfo, total_weight: val })}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Gold Weight (g)">
                  <InputNumber
                    min={0} step={0.001} style={{ width: '100%' }}
                    value={basicInfo.gold_weight}
                    onChange={val => setBasicInfo({ ...basicInfo, gold_weight: val })}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="MOQ">
                  <InputNumber
                    min={1} style={{ width: '100%' }}
                    value={basicInfo.moq}
                    onChange={val => setBasicInfo({ ...basicInfo, moq: val })}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Stock">
                  <InputNumber
                    min={0} style={{ width: '100%' }}
                    value={basicInfo.available_qty}
                    onChange={val => setBasicInfo({ ...basicInfo, available_qty: val })}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Form.Item label="Published">
                  <Select
                    value={basicInfo.is_published}
                    onChange={val => setBasicInfo({ ...basicInfo, is_published: val })}
                  >
                    <Option value={true}>Yes</Option>
                    <Option value={false}>No</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Trade Type">
                  <Select
                    value={basicInfo.trade_type}
                    onChange={val => setBasicInfo({ ...basicInfo, trade_type: val })}
                  >
                    <Option value="both">Both</Option>
                    <Option value="import">Import</Option>
                    <Option value="export">Export</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Craftsman">
                  <Select
                    allowClear value={basicInfo.craftsman_id}
                    onChange={val => setBasicInfo({ ...basicInfo, craftsman_id: val })}
                    placeholder="Optional"
                  >
                    {craftsmen.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Tax Category">
              <Select
                allowClear value={basicInfo.tax_category_id}
                onChange={val => setBasicInfo({ ...basicInfo, tax_category_id: val })}
                placeholder="Optional"
              >
                {taxCategories.map(tc => <Option key={tc.id} value={tc.id}>{tc.name}</Option>)}
              </Select>
            </Form.Item>
          </Form>
        )

      case 1:
        return (
          <div>
            <Button type="dashed" onClick={addDiamond} icon={<PlusOutlined />} style={{ marginBottom: 16 }}>
              Add Diamond
            </Button>
            <Table dataSource={diamonds} rowKey="key" pagination={false} size="small" scroll={{ x: 'max-content' }}>
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

      case 2:
        return (
          <Form layout="vertical">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Form.Item label="Metal Rate (₹/g)">
                  <InputNumber min={0} style={{ width: '100%' }} value={pricing.metal_rate} onChange={val => setPricing({ ...pricing, metal_rate: val })} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Labour (₹)">
                  <InputNumber min={0} style={{ width: '100%' }} value={pricing.labour} onChange={val => setPricing({ ...pricing, labour: val })} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Profit (%)">
                  <InputNumber min={0} max={100} style={{ width: '100%' }} value={pricing.profit_percent} onChange={val => setPricing({ ...pricing, profit_percent: val })} />
                </Form.Item>
              </Col>
            </Row>
            <Divider />
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={6}><Text strong>Metal Total:</Text> ₹{metalTotal.toLocaleString()}</Col>
              <Col xs={24} sm={6}><Text strong>Diamonds:</Text> ₹{totalDiamondPrice.toLocaleString()}</Col>
              <Col xs={24} sm={6}><Text strong>Cost:</Text> ₹{cost.toLocaleString()}</Col>
              <Col xs={24} sm={6}>
                <Text strong>Final Price:</Text>{' '}
                <Text style={{ fontSize: 18, color: '#B8860B' }}>₹{finalPrice.toLocaleString()}</Text>
              </Col>
            </Row>
          </Form>
        )

      case 3:
        return (
          <div>
            {isEdit && existingAssets.length > 0 && (
              <>
                <Text strong>Existing Media</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '12px 0 16px' }}>
                  {existingAssets.map(a => {
                    const removed = removedAssetIds.includes(a.id)
                    const src = getAssetUrl(a.url)
                    return (
                      <div key={a.id} style={{
                        width: 120, border: '1px solid #e8e8e8', borderRadius: 8,
                        padding: 8, opacity: removed ? 0.4 : 1, background: '#fafafa',
                      }}>
                        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {a.asset_type === 'image'
                            ? <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            : a.asset_type === 'video'
                              ? <VideoCameraOutlined style={{ fontSize: 32 }} />
                              : <CodepenOutlined style={{ fontSize: 32 }} />}
                        </div>
                        <div style={{ fontSize: 10, textAlign: 'center', marginTop: 4 }}>
                          {a.is_primary && <Tag color="gold" style={{ fontSize: 9 }}>Primary</Tag>}
                          <Text style={{ fontSize: 10 }} ellipsis>{a.filename}</Text>
                        </div>
                        <Button
                          size="small" danger={!removed} block style={{ marginTop: 6 }}
                          onClick={() => setRemovedAssetIds(prev =>
                            removed ? prev.filter(x => x !== a.id) : [...prev, a.id]
                          )}
                        >
                          {removed ? 'Undo' : 'Remove'}
                        </Button>
                      </div>
                    )
                  })}
                </div>
                <Divider />
              </>
            )}

            <Text strong>Add New Media</Text>
            <Text type="secondary" style={{ display: 'block', margin: '4px 0 8px' }}>
              Supported: images, videos, and 3D models (.glb, .gltf)
            </Text>
            <Upload
              multiple listType="picture-card" fileList={fileList}
              accept="image/*,video/*,.glb,.gltf"
              beforeUpload={(file) => { setFileList(prev => [...prev, file]); return false }}
              onRemove={(file) => setFileList(prev => prev.filter(f => f.uid !== file.uid))}
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
                    {file.thumbUrl
                      ? <img src={file.thumbUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : icon}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', padding: '2px 4px' }}>
                      <Text style={{ color: '#fff', fontSize: 10 }} ellipsis>{file.name}</Text>
                    </div>
                  </div>
                )
              }}
            >
              {fileList.length >= 10 ? null : (
                <div><PlusOutlined /><div style={{ marginTop: 8 }}>Upload</div></div>
              )}
            </Upload>
          </div>
        )

      case 4:
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
                <Descriptions.Item label="Final Price">₹{finalPrice.toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="Stock">{basicInfo.available_qty}</Descriptions.Item>
                <Descriptions.Item label="MOQ">{basicInfo.moq}</Descriptions.Item>
                <Descriptions.Item label="Published">{basicInfo.is_published ? 'Yes' : 'No'}</Descriptions.Item>
                <Descriptions.Item label="Trade Type">{basicInfo.trade_type}</Descriptions.Item>
                <Descriptions.Item label="Craftsman">
                  {craftsmen.find(c => c.id === basicInfo.craftsman_id)?.name || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Diamonds">
                  {diamonds.length} types | {totalDiamondPcs} pcs | {totalDiamondCarat} ct | ₹{totalDiamondPrice.toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="Media">
                  {isEdit && `${existingAssets.length - removedAssetIds.length} existing`}
                  {isEdit && fileList.length > 0 && ' + '}
                  {fileList.length > 0 && `${fileList.length} new`}
                  {!isEdit && `${fileList.length} file(s)`}
                </Descriptions.Item>
                {basicInfo.description && (
                  <Descriptions.Item label="Description" span={2}>{basicInfo.description}</Descriptions.Item>
                )}
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
      <Title level={3}>{isEdit ? 'Edit Product' : 'Create New Product'}</Title>
      <Steps current={current} items={steps} size="small" style={{ marginBottom: 32, overflowX: 'auto' }} />
      <Card>
        <Spin spinning={initialLoading}>
          {initialLoading ? <div style={{ height: 200 }} /> : renderStepContent()}
        </Spin>
        <Divider />
        <Row justify="end" gutter={[8, 8]}>
          <Col>
            {current > 0 && <Button onClick={() => setCurrent(current - 1)}>Previous</Button>}
          </Col>
          <Col>
            {current < steps.length - 1 && (
              <Button type="primary" onClick={handleNext}>Next</Button>
            )}
          </Col>
          <Col>
            {current === steps.length - 1 && (
              <Button type="primary" onClick={handleSubmit} loading={loading}>
                {isEdit ? 'Save Changes' : 'Create Product'}
              </Button>
            )}
          </Col>
        </Row>
      </Card>
    </div>
  )
}