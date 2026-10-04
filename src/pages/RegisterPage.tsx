import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth.api'
import { getApiErrorMessage } from '../api/axios'
import PasswordField from '../components/PasswordField'

export default function RegisterPage() {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const data = new FormData(event.currentTarget)
    const fullName = String(data.get('fullName')).trim()
    const email = String(data.get('email')).trim().toLowerCase()
    const password = String(data.get('password'))
    setError('')
    if (!fullName) { setError('Vui lòng nhập họ và tên của bạn.'); return }
    if (password !== data.get('confirmPassword')) { setError('Mật khẩu xác nhận chưa khớp.'); return }
    if (new TextEncoder().encode(password).length > 72) { setError('Mật khẩu quá dài. Vui lòng dùng mật khẩu ngắn hơn.'); return }
    setSubmitting(true)
    try {
      await authApi.register({ fullName, email, password })
      navigate('/login', {
        replace: true,
        state: { from: location.state?.from, registrationSuccess: true, registeredEmail: email },
      })
    } catch (cause) {
      setError(getApiErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <>
      <h2 className="auth-title">Tạo tài khoản mới</h2>
      <p className="auth-subtitle">Bắt đầu hành trình học tập của bạn.</p>
      <form className="auth-form" onSubmit={handleSubmit} aria-busy={submitting}>
        <fieldset disabled={submitting}>
          <label className="sr-only" htmlFor="fullName">Họ và tên</label>
          <input id="fullName" name="fullName" placeholder="Họ và tên" autoComplete="name" maxLength={100} required />
          <label className="sr-only" htmlFor="email">Địa chỉ email</label>
          <input id="email" name="email" type="email" placeholder="Địa chỉ email" autoComplete="email" required />
          <PasswordField id="password" label="Mật khẩu (ít nhất 6 ký tự)" autoComplete="new-password" />
          <PasswordField id="confirmPassword" label="Nhập lại mật khẩu" autoComplete="new-password" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-success" type="submit">{submitting ? 'Đang tạo tài khoản…' : 'Đăng ký'}</button>
        </fieldset>
      </form>
      <p className="auth-switch">Đã có tài khoản? <Link to="/login" state={location.state}>Đăng nhập</Link></p>
    </>
  )
}
