import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Moon } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { useTheme } from '../theme/useTheme'
import { authApi } from '../api/auth.api'
import { getApiErrorMessage, setAccessToken, setRefreshToken } from '../api/axios'
import { useAutoDismissNotice } from '../hooks/useAutoDismissNotice'
import './SettingsPage.css'

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const { isDarkMode, toggleTheme } = useTheme()
  const [signingOut, setSigningOut] = useState(false)
  const logoutPending = useRef(false)

  const [passwordDraft, setPasswordDraft] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordError, setPasswordError] = useState('')
  const [passwordNotice, setPasswordNotice] = useAutoDismissNotice()
  const [changingPassword, setChangingPassword] = useState(false)

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

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordError('')
    setPasswordNotice('')

    const current = passwordDraft.currentPassword.trim()
    const newPass = passwordDraft.newPassword
    const confirmPass = passwordDraft.confirmPassword

    if (!current) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại.')
      return
    }
    if (!newPass) {
      setPasswordError('Vui lòng nhập mật khẩu mới.')
      return
    }
    if (newPass.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự.')
      return
    }
    if (newPass === current) {
      setPasswordError('Mật khẩu mới phải khác mật khẩu hiện tại.')
      return
    }
    if (newPass !== confirmPass) {
      setPasswordError('Mật khẩu xác nhận không khớp.')
      return
    }

    setChangingPassword(true)
    try {
      const response = await authApi.changePassword({
        currentPassword: current,
        newPassword: newPass,
      })
      if (response.accessToken) {
        setAccessToken(response.accessToken)
        setRefreshToken(response.refreshToken ?? null)
      }
      setPasswordDraft({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      setPasswordNotice('Đổi mật khẩu thành công!')
    } catch (error) {
      setPasswordError(getApiErrorMessage(error))
    } finally {
      setChangingPassword(false)
    }
  }

  if (!user) return null

  return (
    <div className="settings-page exam-page">
      <header className="exam-page-heading">
        <div>
          <h1>Cài đặt</h1>
          <p>Điều chỉnh giao diện và quản lý phiên đăng nhập của bạn.</p>
        </div>
      </header>
      <section className="account-card account-settings-card" aria-labelledby="settings-account-heading">
        <h2 id="settings-account-heading">Cài đặt tài khoản</h2>
        <div className="account-settings-section">
          <h3>Giao diện</h3>
          <div className="account-theme-setting">
            <span className="account-theme-icon"><Moon size={23} aria-hidden="true" /></span>
            <div className="account-theme-copy"><p id="dark-mode-label">Chế độ tối</p></div>
            <button
              className="account-theme-switch"
              type="button"
              role="switch"
              aria-checked={isDarkMode}
              aria-labelledby="dark-mode-label"
              onClick={toggleTheme}
            >
              <span className="account-theme-switch-thumb" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="account-settings-section" id="change-password">
          <h3>Đổi mật khẩu</h3>
          <p className="account-settings-section-desc">
            Cập nhật mật khẩu định kỳ để nâng cao tính bảo mật cho tài khoản của bạn.
          </p>
          <form className="account-password-form" onSubmit={handlePasswordChange} noValidate>
            <div className="account-password-fields">
              <div className="account-form-field">
                <label htmlFor="current-password">Mật khẩu hiện tại</label>
                <input
                  id="current-password"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Nhập mật khẩu hiện tại"
                  value={passwordDraft.currentPassword}
                  onChange={(e) => {
                    setPasswordDraft((prev) => ({ ...prev, currentPassword: e.target.value }))
                    setPasswordError('')
                    setPasswordNotice('')
                  }}
                />
              </div>
              <div className="account-form-field">
                <label htmlFor="new-password">Mật khẩu mới</label>
                <input
                  id="new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="Mật khẩu mới (ít nhất 6 ký tự)"
                  value={passwordDraft.newPassword}
                  onChange={(e) => {
                    setPasswordDraft((prev) => ({ ...prev, newPassword: e.target.value }))
                    setPasswordError('')
                    setPasswordNotice('')
                  }}
                />
              </div>
              <div className="account-form-field">
                <label htmlFor="confirm-password">Xác nhận mật khẩu mới</label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="Nhập lại mật khẩu mới"
                  value={passwordDraft.confirmPassword}
                  onChange={(e) => {
                    setPasswordDraft((prev) => ({ ...prev, confirmPassword: e.target.value }))
                    setPasswordError('')
                    setPasswordNotice('')
                  }}
                />
              </div>
            </div>

            {passwordError && (
              <p className="account-feedback account-feedback-error" role="alert">
                {passwordError}
              </p>
            )}
            {passwordNotice && (
              <p className="account-feedback account-feedback-success" role="status">
                <Check size={18} aria-hidden="true" />
                {passwordNotice}
              </p>
            )}

            <div className="account-password-actions">
              <button
                className="account-action-button account-action-primary"
                type="submit"
                disabled={changingPassword}
              >
                {changingPassword ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
              </button>
            </div>
          </form>
        </div>

        <div className="account-settings-section">
          <h3>Tài khoản</h3>
          <p className="account-settings-email">{user.email}</p>
          <button
            className="account-action-button settings-logout"
            type="button"
            disabled={signingOut}
            onClick={() => { void handleLogout() }}
          >
            {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất tài khoản'}
          </button>
        </div>
      </section>
    </div>
  )
}
