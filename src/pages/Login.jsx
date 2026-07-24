import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Typography, Card, message } from 'antd'
import { UserOutlined, LockOutlined, CrownOutlined } from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'

const { Title, Text } = Typography

export default function Login() {
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (values) => {
    setLoading(true)
    try {
      await signIn(values.email, values.password)
      navigate('/')
    } catch (err) {
      message.error(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        padding: '20px',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          background: '#ffffff',
          border: '1px solid #d4af37',
        }}
        bodyStyle={{ padding: '40px 32px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/minal_gems_logo.svg"
            alt="Minal Gems"
            style={{ height: 64, marginBottom: 16 }}
          />
          <Title level={3} style={{ margin: 0, color: '#B8860B', fontWeight: 700 }}>
            <CrownOutlined style={{ marginRight: 8 }} />
            Admin Panel
          </Title>
          <Text type="secondary" style={{ fontSize: 14, display: 'block', marginTop: 8 }}>
            Sign in to manage your luxury jewellery business
          </Text>
        </div>

        <Form
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#B8860B' }} />}
              placeholder="Email address"
              style={{ borderRadius: 8, borderColor: '#d9d9d9' }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#B8860B' }} />}
              placeholder="Password"
              style={{ borderRadius: 8, borderColor: '#d9d9d9' }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 48,
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #B8860B 0%, #D4AF37 100%)',
                border: 'none',
                boxShadow: '0 4px 14px rgba(184, 134, 11, 0.4)',
              }}
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Text style={{ fontSize: 13, color: '#999' }}>
            © {new Date().getFullYear()} Minal Gems. All rights reserved.
          </Text>
        </div>
      </Card>
    </div>
  )
}