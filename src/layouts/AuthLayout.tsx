import { Check, Sparkles } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Brand from '../components/Brand'

export default function AuthLayout() {
  const location = useLocation()
  const pathname = location.pathname.replace(/\/+$/, '')
  const isAuthFormPage = pathname === '/login' || pathname === '/register'
  return (
    <div className={`auth-layout${isAuthFormPage ? ' auth-layout-form' : ''}`}>
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      <header className="auth-header">
        <Brand />
        <nav className="auth-nav" aria-label="Tài khoản">
          <NavLink className="header-login" to="/login" state={location.state}>Đăng nhập</NavLink>
          <NavLink className="header-register" to="/register" state={location.state}>Đăng ký</NavLink>
        </nav>
      </header>
      <main className="auth-main" id="main-content">
        <section className="auth-intro" aria-labelledby="intro-title">
          <span className="intro-badge"><Sparkles size={15} aria-hidden="true" /> Học vui • Luyện chắc</span>
          <h1 id="intro-title">Sẵn sàng thử sức?</h1>
          <p>Luyện tập linh hoạt, thi thử tự tin và từng bước theo dõi tiến độ của riêng bạn — bắt đầu chỉ trong vài giây.</p>
          <ul className="intro-benefits">
            <li><Check size={19} strokeWidth={3} aria-hidden="true" /> Câu hỏi đa dạng</li>
            <li><Check size={19} strokeWidth={3} aria-hidden="true" /> Tiến độ trực quan</li>
          </ul>
        </section>
        <div className="auth-card"><Outlet /></div>
      </main>
    </div>
  )
}
