import { useState } from 'react'
import type { FormEvent, SubmitEvent } from 'react'
import { CircleCheck, KeyRound, ShieldCheck } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/auth.api'
import { getApiErrorMessage } from '../api/axios'
import PasswordField from '../components/PasswordField'

type Step = 'request' | 'reset'

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams()
  const initialToken = searchParams.get('token')?.trim() || ''
  const initialEmail = searchParams.get('email')?.trim().toLowerCase() || ''

  const [step, setStep] = useState<Step>(initialToken ? 'reset' : 'request')
  const [email, setEmail] = useState(initialEmail)
  const [token, setToken] = useState(initialToken)
  const [error, setError] = useState('')
  const [requestNotice, setRequestNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const navigate = useNavigate()

  async function handleRequestCode(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const data = new FormData(event.currentTarget)
    const submittedEmail = String(data.get('email')).trim().toLowerCase()

    setError('')
    setRequestNotice('')
    setSubmitting(true)

    try {
      const response = await authApi.forgotPassword({ email: submittedEmail })
      setEmail(submittedEmail)
      setRequestNotice(
        response.message ||
          'Mã xác nhận đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư (hoặc console máy chủ).',
      )
      setStep('reset')
    } catch (cause) {
      setError(getApiErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const data = new FormData(event.currentTarget)
    const targetEmail = String(data.get('email') || email).trim().toLowerCase()
    const targetToken = String(data.get('token') || token).trim()
    const newPassword = String(data.get('newPassword'))
    const confirmPassword = String(data.get('confirmPassword'))

    setError('')

    if (!targetEmail) {
      setError('Vui lòng nhập địa chỉ email.')
      return
    }
    if (!targetToken) {
      setError('Vui lòng nhập mã xác nhận nhận được qua email.')
      return
    }
    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận chưa khớp.')
      return
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setError('Mật khẩu quá dài. Vui lòng dùng mật khẩu ngắn hơn.')
      return
    }

    setSubmitting(true)

    try {
      await authApi.resetPassword({
        email: targetEmail,
        token: targetToken,
        newPassword,
      })

      navigate('/login', {
        replace: true,
        state: {
          passwordResetSuccess: true,
          registeredEmail: targetEmail,
        },
      })
    } catch (cause) {
      setError(getApiErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-message">
      <span className="message-icon">
        {step === 'request' ? (
          <KeyRound size={27} aria-hidden="true" />
        ) : (
          <ShieldCheck size={27} aria-hidden="true" />
        )}
      </span>

      {step === 'request' ? (
        <>
          <h2 className="auth-title">Quên mật khẩu?</h2>
          <p>
            Nhập địa chỉ email đăng ký tài khoản của bạn. Hệ thống sẽ gửi mã xác
            nhận để bạn tạo mật khẩu mới.
          </p>

          <form
            className="auth-form"
            onSubmit={handleRequestCode}
            aria-busy={submitting}
          >
            <fieldset disabled={submitting}>
              <label className="sr-only" htmlFor="request-email">
                Địa chỉ email
              </label>
              <input
                id="request-email"
                name="email"
                type="email"
                placeholder="Nhập địa chỉ email của bạn"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button className="button button-primary" type="submit">
                {submitting ? 'Đang gửi mã…' : 'Gửi mã xác nhận'}
              </button>
            </fieldset>
          </form>

          <p className="auth-switch" style={{ marginTop: '20px' }}>
            Đã có mã xác nhận?{' '}
            <button
              type="button"
              className="text-button"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
              onClick={() => {
                setError('')
                setStep('reset')
              }}
            >
              Nhập mã đặt lại mật khẩu
            </button>
          </p>
        </>
      ) : (
        <>
          <h2 className="auth-title">Đặt lại mật khẩu</h2>
          <p>
            Nhập mã xác nhận (Token) đã nhận trong email và mật khẩu mới của bạn.
          </p>

          {requestNotice && (
            <p className="form-success" role="status" style={{ textAlign: 'left' }}>
              <CircleCheck size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>{requestNotice}</span>
            </p>
          )}

          <form
            className="auth-form"
            onSubmit={handleResetPassword}
            aria-busy={submitting}
          >
            <fieldset disabled={submitting}>
              <label className="sr-only" htmlFor="reset-email">
                Địa chỉ email
              </label>
              <input
                id="reset-email"
                name="email"
                type="email"
                placeholder="Địa chỉ email tài khoản"
                autoComplete="email"
                value={email}
                onChange={(e: FormEvent<HTMLInputElement>) =>
                  setEmail(e.currentTarget.value)
                }
                required
              />

              <label className="sr-only" htmlFor="reset-token">
                Mã xác nhận (Token)
              </label>
              <input
                id="reset-token"
                name="token"
                type="text"
                placeholder="Mã xác nhận (Token từ email)"
                autoComplete="one-time-code"
                value={token}
                onChange={(e: FormEvent<HTMLInputElement>) =>
                  setToken(e.currentTarget.value)
                }
                required
              />

              <PasswordField
                id="newPassword"
                label="Mật khẩu mới (ít nhất 6 ký tự)"
                autoComplete="new-password"
              />

              <PasswordField
                id="confirmPassword"
                label="Xác nhận mật khẩu mới"
                autoComplete="new-password"
              />

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button className="button button-primary" type="submit">
                {submitting ? 'Đang đổi mật khẩu…' : 'Xác nhận đổi mật khẩu'}
              </button>
            </fieldset>
          </form>

          <p className="auth-switch" style={{ marginTop: '20px' }}>
            Chưa nhận được mã hoặc cần gửi lại?{' '}
            <button
              type="button"
              className="text-button"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
              onClick={() => {
                setError('')
                setRequestNotice('')
                setStep('request')
              }}
            >
              Gửi lại mã xác nhận
            </button>
          </p>
        </>
      )}

      <div className="auth-divider" />
      <Link className="text-link" to="/login">
        Quay lại đăng nhập
      </Link>
    </div>
  )
}
