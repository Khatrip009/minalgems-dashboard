import { useEffect, useState } from 'react'
import {
  Table, Button, Space, Select, message, Tag, Card, Row, Col, Typography,
  Modal, Popconfirm, Dropdown,
} from 'antd'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, TeamOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const { Title } = Typography
const { Option } = Select

export default function Users() {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)

  // Role edit modal
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState(null)
  const [newRole, setNewRole] = useState('')

  const fetchProfiles = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      message.error('Failed to load users')
      setLoading(false)
      return
    }
    setProfiles(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  const handleRoleChange = async () => {
    if (!editingProfile || !newRole) return
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', editingProfile.id)
    if (error) {
      message.error('Failed to update role')
    } else {
      message.success('Role updated')
      setRoleModalOpen(false)
      fetchProfiles()
    }
  }

  const handleDelete = async (profileId) => {
    // Don't allow deleting yourself
    if (profileId === user?.id) {
      message.warning('You cannot delete your own account')
      return
    }
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', profileId)
    if (error) {
      message.error('Delete failed')
    } else {
      message.success('User deleted')
      fetchProfiles()
    }
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'full_name',
      key: 'full_name',
      render: (text) => text || '–',
    },
    {
      title: 'Email',
      dataIndex: 'id', // can't easily get email from profiles, but you can join with auth.users via RPC
      key: 'email',
      render: (_, rec) => rec.email || rec.id.substring(0, 8) + '…', // placeholder
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      filters: [
        { text: 'Admin', value: 'admin' },
        { text: 'Customer', value: 'customer' },
      ],
      onFilter: (value, record) => record.role === value,
      render: (role) => (
        <Tag color={role === 'admin' ? 'blue' : 'green'}>
          {role?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Joined',
      dataIndex: 'created_at',
      key: 'created_at',
      responsive: ['md'],
      render: (d) => (d ? new Date(d).toLocaleDateString() : '–'),
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
              label: 'Change Role',
              onClick: () => {
                setEditingProfile(record)
                setNewRole(record.role)
                setRoleModalOpen(true)
              },
            },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              label: 'Delete',
              danger: true,
              onClick: () =>
                Modal.confirm({
                  title: 'Delete this user?',
                  onOk: () => handleDelete(record.id),
                }),
            },
          ],
        }
        return (
          <>
            <Space className="desktop-actions" style={{ display: 'none' }}>
              <Button
                icon={<EditOutlined />}
                size="small"
                onClick={() => {
                  setEditingProfile(record)
                  setNewRole(record.role)
                  setRoleModalOpen(true)
                }}
              >
                Edit
              </Button>
              <Popconfirm
                title="Delete this user?"
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

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[8, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Title level={3} style={{ margin: 0 }}>
            <TeamOutlined style={{ marginRight: 12 }} />
            User Management
          </Title>
        </Col>
        <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
          <Button icon={<ReloadOutlined />} onClick={fetchProfiles}>
            Refresh
          </Button>
        </Col>
      </Row>

      <Card bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={profiles}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, responsive: true }}
          scroll={{ x: 'max-content' }}
          size="small"
        />
      </Card>

      {/* Role Change Modal */}
      <Modal
        title="Change Role"
        open={roleModalOpen}
        onOk={handleRoleChange}
        onCancel={() => setRoleModalOpen(false)}
        okText="Save"
        destroyOnClose
      >
        <p>User: <strong>{editingProfile?.full_name || editingProfile?.id}</strong></p>
        <Select value={newRole} onChange={setNewRole} style={{ width: '100%' }}>
          <Option value="customer">Customer</Option>
          <Option value="admin">Admin</Option>
        </Select>
      </Modal>
    </div>
  )
}