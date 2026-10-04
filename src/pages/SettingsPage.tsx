import { useRef, useState } from 'react'
import { LogOut, Moon } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { useTheme } from '../theme/useTheme'
import './SettingsPage.css'

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const { isDarkMode, toggleTheme } = useTheme()
  const [signingOut, setSigningOut] = useState(false)
  const logoutPending = useRef(false)

  async function handleLogout() {
    if (logoutPending.current) return
    logoutPending.current = true
    setSigningOut(true)
    try {
      await logout()
    } finally {
      logoutPending.current = false
      setSigningOut(false)
    }
  }

  if (!user) return null

  return <div className="settings-page exam-page">
    <header className="exam-page-heading">
      <div><h1>Cài đặt</h1><p>Điều chỉnh giao diện và quản lý phiên đăng nhập của bạn.</p></div>
    </header>
    <section className="account-card account-settings-card" aria-labelledby="settings-account-heading">
      <h2 id="settings-account-heading">Cài đặt tài khoản</h2>
      <div className="account-settings-section">
        <h3>Giao diện</h3>
        <div className="account-theme-setting">
          <span className="account-theme-icon"><Moon size={23} aria-hidden="true" /></span>
          <div className="account-theme-copy"><p id="dark-mode-label">Chế độ tối</p></div>
          <button className="account-theme-switch" type="button" role="switch"
            aria-checked={isDarkMode} aria-labelledby="dark-mode-label" onClick={toggleTheme}>
            <span className="account-theme-switch-thumb" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="account-settings-section">
        <h3>Tài khoản</h3>
        <p className="account-settings-email">{user.email}</p>
        <button className="account-action-button settings-logout" type="button" disabled={signingOut} onClick={() => { void handleLogout() }}>
          <LogOut size={17} aria-hidden="true" />{signingOut ? 'Đang đăng xuất…' : 'Đăng xuất tài khoản'}
        </button>
      </div>
    </section>
  </div>
}
