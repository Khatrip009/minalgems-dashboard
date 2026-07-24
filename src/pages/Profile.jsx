import { useEffect, useState } from 'react'
import {
  Card, Row, Col, Typography, Form, Input, Button, message, Space, Tag, Upload,
} from 'antd'
import {
  SaveOutlined, UserOutlined, UploadOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { uploadFile, getAssetUrl } from '../utilities/storage'

const { Title } = Typography

export default function Profile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form] = Form.useForm()
  const [fileList, setFileList] = useState([])
  
  // ✅ Separate state for the newly uploaded avatar path
  const [uploadedAvatarPath, setUploadedAvatarPath] = useState(null)

  const fetchProfile = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      message.error('Failed to load profile')
    } else {
      setProfile(data)
      form.setFieldsValue({
        full_name: data.full_name || '',
      })
      if (data.avatar_url) {
        setFileList([{
          uid: '-1',
          name: 'current-avatar',
          status: 'done',
          url: getAssetUrl(data.avatar_url),
        }])
        setUploadedAvatarPath(null)  // no new upload pending
      } else {
        setFileList([])
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchProfile()
  }, [user])

  // Custom upload handler
  const handleAvatarUpload = async (options) => {
    const { file, onSuccess, onError } = options
    setUploading(true)
    try {
      const relativePath = await uploadFile(file, 'avatars')

      // ✅ Store the uploaded path temporarily – will be saved on "Save Changes"
      setUploadedAvatarPath(relativePath)

      // Show preview immediately
      setProfile(prev => prev ? { ...prev, avatar_url: relativePath } : null)

      setFileList([{
        uid: file.uid,
        name: file.name,
        status: 'done',
        url: getAssetUrl(relativePath),
      }])

      onSuccess('OK')
      message.success('Avatar uploaded – click "Save Changes" to apply')
    } catch (err) {
      onError(err)
      message.error(`Upload failed: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()

      // ✅ Determine the final avatar URL to store
      const finalAvatarUrl = uploadedAvatarPath !== null 
        ? uploadedAvatarPath 
        : (profile?.avatar_url || '')

      console.log('Saving profile with avatar:', finalAvatarUrl)

      setSaving(true)
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: values.full_name,
          avatar_url: finalAvatarUrl,
        })
        .eq('id', user.id)

      if (error) {
        console.error('Update error:', error)
        message.error('Update failed: ' + error.message)
      } else {
        message.success('Profile updated')
        // Reset uploaded path after successful save
        setUploadedAvatarPath(null)
        // Notify layout to refresh header avatar
        window.dispatchEvent(new CustomEvent('profile-updated'))
        // Refresh local data
        fetchProfile()
      }
    } catch (err) {
      console.error('Validation or update error:', err)
      message.error('An error occurred')
    } finally {
      setSaving(false)
    }
  }

  // Build display URL from current profile state (may be temporarily updated)
  const avatarUrl = profile?.avatar_url ? getAssetUrl(profile.avatar_url) : null

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        <UserOutlined style={{ marginRight: 12 }} />
        My Profile
      </Title>

      <Card loading={loading}>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  marginBottom: 16,
                }}
              />
            ) : (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  background: '#f0f0f0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <UserOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <Tag color={profile?.role === 'admin' ? 'blue' : 'green'}>
                {profile?.role?.toUpperCase()}
              </Tag>
            </div>

            <Upload
              listType="picture-card"
              fileList={fileList}
              maxCount={1}
              accept="image/*"
              customRequest={handleAvatarUpload}
              onRemove={() => {
                setUploadedAvatarPath(null)
                setFileList([])
                setProfile(prev => prev ? { ...prev, avatar_url: '' } : null)
              }}
            >
              {fileList.length >= 1 ? null : (
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>Upload</div>
                </div>
              )}
            </Upload>
          </Col>

          <Col xs={24} sm={16}>
            <Form form={form} layout="vertical">
              <Form.Item
                name="full_name"
                label="Full Name"
                rules={[{ required: true, message: 'Please enter your name' }]}
              >
                <Input placeholder="Your full name" />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSave}
                  loading={saving || uploading}
                >
                  Save Changes
                </Button>
              </Form.Item>
            </Form>
          </Col>
        </Row>
      </Card>
    </div>
  )
}