import { useState } from 'react'
import { BookOpen, History, House, LogOut, UserRound } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Brand from '../components/Brand'
import { useAuth } from '../auth/useAuth'
import { useAccountProfile } from '../profile/useAccountProfile'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { profile } = useAccountProfile()
  const location = useLocation()
  const isProfile = location.pathname.replace(/\/+$/, '') === '/profile'
  const [signingOut, setSigningOut] = useState(false)
  async function handleLogout() {
    setSigningOut(true)
    try { await logout() } finally { setSigningOut(false) }
  }
  return (
    <div className={`app-layout${isProfile ? ' profile-app-layout' : ''}`}>
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      <header className="app-header">
        <Brand to="/dashboard" />
        <nav className="app-nav" aria-label="Điều hướng chính">
          <NavLink to="/dashboard"><House size={18} aria-hidden="true" /> Trang chủ</NavLink>
          <NavLink to="/exams"><BookOpen size={18} aria-hidden="true" /> Đề thi</NavLink>
          {user?.role === 'STUDENT' && <NavLink to="/history"><History size={18} aria-hidden="true" /> Lịch sử</NavLink>}
          <NavLink to="/profile"><UserRound size={18} aria-hidden="true" /> Tài khoản</NavLink>
        </nav>
        <button className="logout-button" type="button" disabled={signingOut} onClick={handleLogout}>
          <LogOut size={17} aria-hidden="true" /><span>{signingOut ? 'Đang thoát…' : 'Đăng xuất'}</span>
        </button>
      </header>
      <main className="app-main" id="main-content"><Outlet /></main>
      <footer className="app-footer">Tracnghiem.com <span>Học vui • Luyện chắc</span>{user && <span>{profile.fullName}</span>}</footer>
    </div>
  )
}
