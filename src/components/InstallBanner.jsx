import { useEffect, useState } from 'react'
import { Button, Space, Typography } from 'antd'
import { DownloadOutlined, CloseOutlined } from '@ant-design/icons'

const { Text } = Typography

let deferredPrompt

export default function InstallBanner() {
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    // Detect iOS devices (iPad, iPhone, iPod)
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    setIsIOS(ios)

    // Listen for the install prompt event (Chrome / Android)
    const handler = (e) => {
      e.preventDefault()
      deferredPrompt = e
      setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // If already installed, hide banner
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowBanner(false)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      console.log(`User response to install: ${outcome}`)
      deferredPrompt = null
      setShowBanner(false)
    }
  }

  // Show iOS instructions even if no prompt event (iOS doesn't fire it)
  // We'll show the banner on iOS after 3 seconds
  useEffect(() => {
    if (isIOS && !window.navigator.standalone) {
      const timer = setTimeout(() => setShowBanner(true), 3000)
      return () => clearTimeout(timer)
    }
  }, [isIOS])

  if (!showBanner) return null

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #B8860B 0%, #D4AF37 100%)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
      }}
    >
      <Space direction="vertical" size={0}>
        <Text strong style={{ color: '#fff', fontSize: 16 }}>
          📱 Install the Admin Panel
        </Text>
        <Text style={{ color: '#fff', fontSize: 13 }}>
          {isIOS
            ? 'Tap the share button and then "Add to Home Screen"'
            : 'Add to your device for quick access'}
        </Text>
      </Space>
      <Space>
        {!isIOS && (
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleInstall}
            style={{
              background: '#fff',
              color: '#B8860B',
              border: 'none',
              fontWeight: 600,
            }}
          >
            Install
          </Button>
        )}
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={() => setShowBanner(false)}
          style={{ color: '#fff' }}
        />
      </Space>
    </div>
  )
}