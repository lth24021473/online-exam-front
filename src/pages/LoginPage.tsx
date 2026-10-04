import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { CircleCheck } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth.api'
import { getApiErrorMessage } from '../api/axios'
import { useAuth } from '../auth/useAuth'
import PasswordField from '../components/PasswordField'
import { useAutoDismissNotice } from '../hooks/useAutoDismissNotice'
import { getAuthDestination } from '../router/authRedirect'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { authenticate, sessionNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [registrationNotice] = useAutoDismissNotice(location.state?.registrationSuccess === true
    ? 'Tạo tài khoản thành công! Vui lòng đăng nhập để tiếp tục.'
    : '')
  const registeredEmail = typeof location.state?.registeredEmail === 'string' ? location.state.registeredEmail : ''
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const data = new FormData(event.currentTarget)
    setError('')
    setSubmitting(true)
    try {
      const response = await authApi.login({
        email: String(data.get('email')).trim().toLowerCase(),
        password: String(data.get('password')),
      })
      authenticate(response)
      navigate(getAuthDestination(location.state, response.user.role), { replace: true })
    } catch (cause) {
      setError(getApiErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <>
      <h2 className="auth-title">Đăng nhập vào Tracnghiem.com</h2>
      {registrationNotice && (
        <p className="form-success" role="status">
          <CircleCheck size={20} aria-hidden="true" />
          <span>{registrationNotice}</span>
        </p>
      )}
      {sessionNotice && <p className="form-error" role="alert">{sessionNotice}</p>}
      <form className="auth-form" onSubmit={handleSubmit} aria-busy={submitting}>
        <fieldset disabled={submitting}>
          <label className="sr-only" htmlFor="email">Địa chỉ email</label>
          <input id="email" name="email" type="email" placeholder="Địa chỉ email" autoComplete="email" defaultValue={registeredEmail} required />
          <PasswordField id="password" label="Mật khẩu" autoComplete="current-password" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit">{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        </fieldset>
      </form>
      <Link className="forgot-link" to="/forgot-password">Quên mật khẩu?</Link>
      <div className="auth-divider" />
      <Link className="button button-success" to="/register" state={location.state}>Tạo tài khoản mới</Link>
    </>
  )
}
