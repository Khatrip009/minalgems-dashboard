import { useEffect, useState } from 'react'
import { Table, Button, Space, Tag, message, Popconfirm, Typography } from 'antd'
import { CheckOutlined, DeleteOutlined, MailOutlined, InboxOutlined } from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'

const { Title } = Typography

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)

  // Fetch all notifications (RLS ensures admin sees all)
  const fetchNotifications = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) message.error('Failed to load notifications')
    else setNotifications(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchNotifications()

    // Real‑time subscription to keep list live
    const channel = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => fetchNotifications()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Mark a single notification as read
  const markAsRead = async (id) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    if (error) message.error('Failed to mark as read')
    else {
      message.success('Marked as read')
      fetchNotifications()
    }
  }

  // Mark ALL unread notifications as read
  const markAllAsRead = async () => {
    setMarkingAll(true)
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('is_read', false)
    if (error) message.error('Failed to mark all as read')
    else {
      message.success('All notifications marked as read')
      fetchNotifications()
    }
    setMarkingAll(false)
  }

  // Delete a notification
  const deleteNotification = async (id) => {
    const { error } = await supabase.from('notifications').delete().eq('id', id)
    if (error) message.error('Failed to delete')
    else {
      message.success('Notification deleted')
      fetchNotifications()
    }
  }

  // Type color mapping
  const typeColorMap = {
    info: 'blue',
    warning: 'orange',
    alert: 'red',
    success: 'green',
    reminder: 'purple',
  }

  const columns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type) => <Tag color={typeColorMap[type] || 'default'}>{type?.toUpperCase()}</Tag>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
      responsive: ['md'],
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Status',
      dataIndex: 'is_read',
      key: 'is_read',
      width: 90,
      render: (isRead) =>
        isRead ? <Tag color="success">Read</Tag> : <Tag color="processing">Unread</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          {!record.is_read && (
            <Button
              type="link"
              icon={<CheckOutlined />}
              onClick={() => markAsRead(record.id)}
            />
          )}
          <Popconfirm title="Delete?" onConfirm={() => deleteNotification(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <InboxOutlined /> Notifications
        </Title>
        <Space>
          <Tag icon={<MailOutlined />} color="blue">
            {unreadCount} unread
          </Tag>
          <Button
            icon={<CheckOutlined />}
            onClick={markAllAsRead}
            loading={markingAll}
            disabled={unreadCount === 0}
          >
            Mark All as Read
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={notifications}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15, showSizeChanger: true }}
        scroll={{ x: 'max-content' }}
        rowClassName={(record) => (!record.is_read ? 'notification-unread-row' : '')}
      />
    </div>
  )
}