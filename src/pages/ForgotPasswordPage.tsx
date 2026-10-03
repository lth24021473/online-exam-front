import { KeyRound } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ForgotPasswordPage() {
  return (
    <div className="auth-message">
      <span className="message-icon"><KeyRound size={27} aria-hidden="true" /></span>
      <h2 className="auth-title">Quên mật khẩu?</h2>
      <p>Tính năng khôi phục mật khẩu hiện chưa khả dụng. Bạn có thể quay lại đăng nhập nếu nhớ mật khẩu của mình.</p>
      <Link className="button button-primary" to="/login">Quay lại đăng nhập</Link>
      <Link className="text-link" to="/register">Tạo tài khoản mới</Link>
    </div>
  )
}
