import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getAssetUrl } from '../utilities/storage'
import {
  Layout, Menu, Button, Avatar, Dropdown, Space, Typography, Badge,
  theme, Drawer, Grid, Popover, List, Skeleton, Tag
} from 'antd'
import {
  CrownOutlined, ShoppingCartOutlined, AppstoreOutlined,
  OrderedListOutlined, TeamOutlined, ToolOutlined, LogoutOutlined,
  BellOutlined, SettingOutlined, MenuFoldOutlined, MenuUnfoldOutlined, MailOutlined,
  UserOutlined, DollarOutlined, MenuOutlined,PictureOutlined,SwapOutlined,StarOutlined
} from '@ant-design/icons'
import InstallBanner from '../components/InstallBanner'

const { Header, Sider, Content, Footer } = Layout
const { Text, Title } = Typography
const { useBreakpoint } = Grid

// Custom Diamond Icon
const DiamondIcon = () => (
  <span role="img" aria-label="diamond" style={{ display: 'inline-flex', alignItems: 'center' }}>
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M12 2L2 12l10 10 10-10L12 2zm0 3.414L18.586 12 12 18.586 5.414 12 12 5.414z" />
    </svg>
  </span>
)

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profile, setProfile] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [popoverVisible, setPopoverVisible] = useState(false)
  const [recentNotifications, setRecentNotifications] = useState([])
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const screens = useBreakpoint()
  const isMobile = !screens.md

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  // Type color mapping for notification tags
  const typeColorMap = {
    info: 'blue',
    warning: 'orange',
    alert: 'red',
    success: 'green',
    reminder: 'purple',
  }

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('full_name, avatar_url, role')
      .eq('id', user.id)
      .single()
    if (data) setProfile(data)
  }, [user])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  useEffect(() => {
    const handler = () => fetchProfile()
    window.addEventListener('profile-updated', handler)
    return () => window.removeEventListener('profile-updated', handler)
  }, [fetchProfile])

  // Real-time unread count
  useEffect(() => {
    if (!user) return

    const fetchUnreadCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      setUnreadCount(count || 0)
    }

    fetchUnreadCount()

    const channel = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetchUnreadCount()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // Fetch recent 5 notifications for popover
  const fetchRecentNotifications = useCallback(async () => {
    if (!user) return
    setLoadingNotifications(true)
    const { data } = await supabase
      .from('notifications')
      .select('id, title, message, type, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
    setRecentNotifications(data || [])
    setLoadingNotifications(false)
  }, [user])

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: 'Profile' },
    { key: 'settings', icon: <SettingOutlined />, label: 'Settings' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true },
  ]

  const handleUserMenuClick = ({ key }) => {
    if (key === 'logout') handleLogout()
    if (key === 'settings') navigate('/settings')
  }

  const navItems = [
    { key: '/', icon: <CrownOutlined />, label: 'Dashboard' },
    { key: '/products', icon: <DiamondIcon />, label: 'Products' },
    { key: '/categories', icon: <AppstoreOutlined />, label: 'Categories' },
    { key: '/orders', icon: <ShoppingCartOutlined />, label: 'Orders' },
    { key: '/payments', icon: <DollarOutlined />, label: 'Payments' },
    { key: '/payment-evaluation', icon: <DollarOutlined />, label: 'Payments Eval' },
    { key: '/returns', icon: <SwapOutlined />, label: 'Returns' },
    { key: '/customers', icon: <TeamOutlined />, label: 'Customers' },
    { key: '/craftsmen', icon: <ToolOutlined />, label: 'Craftsmen' },
    { key: '/hero-slides', icon: <PictureOutlined />, label: 'Hero Slides' },
    { key: '/inbox', icon: <MailOutlined />, label: 'Inbox' },
    { key: '/reviews', icon: <StarOutlined />, label: 'Reviews' },
    { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
    { key: '/users', icon: <TeamOutlined />, label: 'Users' },
    { key: '/profile', icon: <UserOutlined />, label: 'Profile' },
  ]

  const avatarSrc = profile?.avatar_url ? getAssetUrl(profile.avatar_url) : null

  const sidebarContent = (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: isMobile ? '20px 0' : (collapsed ? '20px 0' : '28px 0'),
          borderBottom: '1px solid #E0D3C5',
          marginBottom: 8,
          background: 'rgba(255,255,255,0.4)',
        }}
      >
        <img
          src="/minal_gems_logo.svg"
          alt="Minal Gems"
          style={{
            width: isMobile ? 80 : (collapsed ? 44 : 200),
            height: isMobile ? 64 : (collapsed ? 44 : 64),
            objectFit: 'contain',
          }}
        />
      </div>

      <Menu
        theme="light"
        mode="inline"
        selectedKeys={[location.pathname]}
        defaultSelectedKeys={['/']}
        items={navItems}
        onClick={({ key }) => {
          navigate(key)
          if (isMobile) setMobileMenuOpen(false)
        }}
        style={{
          background: 'transparent',
          borderRight: 0,
          fontWeight: 500,
          color: '#5C4033',
        }}
      />

      {!collapsed && !isMobile && (
        <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, padding: '0 16px' }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.7)',
              borderRadius: 12,
              padding: 16,
              border: '1px solid #E0D3C5',
            }}
          >
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text style={{ color: '#8C6E5A', fontSize: 12 }}>ADMIN USER</Text>
              <Text strong style={{ color: '#5C4033' }}>
                {profile?.full_name || user?.email?.split('@')[0] || 'Admin'}
              </Text>
              <Button
                type="primary"
                danger
                icon={<LogoutOutlined />}
                block
                onClick={handleLogout}
                style={{ marginTop: 8 }}
              >
                Logout
              </Button>
            </Space>
          </div>
        </div>
      )}
    </>
  )

  return (
    <> <InstallBanner />
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={260}
          style={{
            background: 'linear-gradient(180deg, #FFF8F0 0%, #F5EDE4 100%)',
            borderRight: '1px solid #E0D3C5',
            boxShadow: '2px 0 12px rgba(0,0,0,0.03)',
          }}
        >
          {sidebarContent}
        </Sider>
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          placement="left"
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          width={260}
          bodyStyle={{ padding: 0, background: 'linear-gradient(180deg, #FFF8F0 0%, #F5EDE4 100%)' }}
          headerStyle={{ display: 'none' }}
        >
          {sidebarContent}
          <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, padding: '0 16px' }}>
            <div
              style={{
                background: 'rgba(255,255,255,0.7)',
                borderRadius: 12,
                padding: 16,
                border: '1px solid #E0D3C5',
              }}
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Text style={{ color: '#8C6E5A', fontSize: 12 }}>ADMIN USER</Text>
                <Text strong style={{ color: '#5C4033' }}>
                  {profile?.full_name || user?.email?.split('@')[0] || 'Admin'}
                </Text>
                <Button
                  type="primary"
                  danger
                  icon={<LogoutOutlined />}
                  block
                  onClick={handleLogout}
                  style={{ marginTop: 8 }}
                >
                  Logout
                </Button>
              </Space>
            </div>
          </div>
        </Drawer>
      )}

      {/* Main content */}
      <Layout>
        <Header
          style={{
            padding: isMobile ? '0 16px' : '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            position: 'sticky',
            top: 0,
            zIndex: 9,
          }}
        >
          <Space size={16}>
            {isMobile ? (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setMobileMenuOpen(true)}
                style={{ fontSize: 18, width: 42, height: 42 }}
              />
            ) : (
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                style={{ fontSize: 18, width: 42, height: 42 }}
              />
            )}
            <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}>
              {navItems.find((i) => i.key === location.pathname)?.label || 'Dashboard'}
            </Title>
          </Space>

          <Space size={isMobile ? 12 : 20}>
            {/* Notification bell with popover */}
            <Popover
              trigger="click"
              open={popoverVisible}
              onOpenChange={(visible) => {
                setPopoverVisible(visible)
                if (visible) fetchRecentNotifications()
              }}
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Notifications</span>
                  {unreadCount > 0 && <Tag color="blue">{unreadCount} new</Tag>}
                </div>
              }
              content={
                <div style={{ width: 300 }}>
                  {loadingNotifications ? (
                    <Skeleton active paragraph={{ rows: 3 }} />
                  ) : recentNotifications.length === 0 ? (
                    <Text type="secondary">No recent notifications</Text>
                  ) : (
                    <>
                      <List
                        dataSource={recentNotifications}
                        renderItem={(item) => (
                          <List.Item style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                            <List.Item.Meta
                              avatar={<Tag color={typeColorMap[item.type] || 'default'}>{item.type}</Tag>}
                              title={<Text strong={!item.is_read}>{item.title}</Text>}
                              description={item.message}
                            />
                          </List.Item>
                        )}
                      />
                      <Button
                        type="primary"
                        block
                        style={{ marginTop: 12 }}
                        onClick={() => {
                          setPopoverVisible(false)
                          navigate('/notifications')
                        }}
                      >
                        View All Notifications
                      </Button>
                    </>
                  )}
                </div>
              }
            >
              <Badge count={unreadCount} size="small" offset={[-2, 2]}>
                <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
              </Badge>
            </Popover>

            {/* User avatar & dropdown */}
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
              trigger={['click']}
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar
                  size="small"
                  icon={<UserOutlined />}
                  src={avatarSrc}
                  style={{ backgroundColor: '#B8860B' }}
                />
                {!isMobile && <Text>{profile?.full_name || 'Admin'}</Text>}
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: isMobile ? 12 : 24,
            padding: isMobile ? 16 : 24,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            minHeight: 280,
          }}
        >
          <Outlet />
        </Content>

        <Footer style={{ textAlign: 'center', background: 'transparent', padding: isMobile ? '12px' : '24px' }}>
          Minal Gems ©{new Date().getFullYear()} – Admin Dashboard
        </Footer>
      </Layout>
    </Layout>
    </>
  )
}