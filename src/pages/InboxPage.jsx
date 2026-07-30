import { useEffect, useState } from 'react'
import { Table, Button, Space, Tag, message, Popconfirm, Modal, Form, Input, Typography } from 'antd'
import { MailOutlined, CheckOutlined, DeleteOutlined, SendOutlined, EyeOutlined } from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'

const { TextArea } = Input;
const { Paragraph, Text } = Typography;   // <-- Text is now properly imported

export default function InboxPage() {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [replyModal, setReplyModal] = useState(null)
  const [replyForm] = Form.useForm()
  const [sending, setSending] = useState(false)

  const fetchEmails = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('inbound_emails')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) message.error('Failed to load emails')
    else setEmails(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchEmails()
    const channel = supabase
      .channel('inbox-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inbound_emails' }, () => fetchEmails())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const markAsRead = async (id) => {
    await supabase.from('inbound_emails').update({ is_read: true, read_at: new Date() }).eq('id', id)
    fetchEmails()
  }

  const deleteEmail = async (id) => {
    await supabase.from('inbound_emails').delete().eq('id', id)
    message.success('Deleted')
    fetchEmails()
  }

  const handleReply = async () => {
    const values = await replyForm.validateFields()
    setSending(true)
    const email = replyModal
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reply-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: email.from_address,
          subject: values.subject || `Re: ${email.subject}`,
          body: values.body,
        }),
      })
      if (res.ok) {
        message.success('Reply sent')
        setReplyModal(null)
        replyForm.resetFields()
        await supabase.from('inbound_emails').update({ replied_at: new Date() }).eq('id', email.id)
        fetchEmails()
      } else {
        message.error('Failed to send reply')
      }
    } catch (err) {
      message.error('Error sending reply')
    } finally {
      setSending(false)
    }
  }

  const columns = [
    {
      title: 'Status',
      dataIndex: 'is_read',
      key: 'is_read',
      width: 90,
      render: (isRead) => isRead ? <Tag color="default">Read</Tag> : <Tag color="blue">New</Tag>,
    },
    {
      title: 'From',
      dataIndex: 'from_name',
      key: 'from_name',
      render: (_, record) => <span>{record.from_name} &lt;{record.from_address}&gt;</span>,
    },
    {
      title: 'Subject',
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedEmail(record)} />
          {!record.is_read && (
            <Button type="link" icon={<CheckOutlined />} onClick={() => markAsRead(record.id)} />
          )}
          <Button type="link" icon={<SendOutlined />} onClick={() => {
            setReplyModal(record)
            replyForm.setFieldsValue({ subject: `Re: ${record.subject}` })
          }} />
          <Popconfirm title="Delete?" onConfirm={() => deleteEmail(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const unreadCount = emails.filter(e => !e.is_read).length

  return (
    <div>
      <h2><MailOutlined /> Email Inbox ({unreadCount} unread)</h2>
      <Table
        columns={columns}
        dataSource={emails}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title={selectedEmail?.subject}
        open={!!selectedEmail}
        onCancel={() => setSelectedEmail(null)}
        footer={null}
        width={700}
      >
        {selectedEmail && (
          <div>
            <p><strong>From:</strong> {selectedEmail.from_name} &lt;{selectedEmail.from_address}&gt;</p>
            <p><strong>To:</strong> {selectedEmail.to_address}</p>
            <p><strong>Date:</strong> {dayjs(selectedEmail.created_at).format('DD/MM/YYYY HH:mm')}</p>
            {selectedEmail.attachments?.length > 0 && (
              <p><strong>Attachments:</strong> {selectedEmail.attachments.map((att, i) => (
                <a key={i} href={att.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>
                  {att.filename || `Attachment ${i+1}`}
                </a>
              ))}</p>
            )}
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 8, paddingTop: 8 }}>
              {selectedEmail.html_body ? (
                <div dangerouslySetInnerHTML={{ __html: selectedEmail.html_body }} />
              ) : selectedEmail.text_body ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{selectedEmail.text_body}</div>
              ) : (
                <Text type="secondary">This email has no content (body not captured).</Text>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={`Reply to ${replyModal?.from_address}`}
        open={!!replyModal}
        onCancel={() => setReplyModal(null)}
        footer={null}
        destroyOnClose
      >
        <Form form={replyForm} layout="vertical" onFinish={handleReply}>
          <Form.Item label="Subject" name="subject" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Message" name="body" rules={[{ required: true }]}>
            <TextArea rows={8} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={sending} icon={<SendOutlined />}>
            Send Reply
          </Button>
        </Form>
      </Modal>
    </div>
  )
}