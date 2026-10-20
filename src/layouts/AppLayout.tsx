import { BookOpen, History, House, Settings, ShieldCheck, UserRound } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import Brand from '../components/Brand'
import { useAuth } from '../auth/useAuth'
import { useAccountProfile } from '../profile/useAccountProfile'

export default function AppLayout() {
  const { user } = useAuth()
  const { profile } = useAccountProfile()
  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      <header className="app-header">
        <Brand to="/dashboard" />
        <nav className="app-nav" aria-label="Điều hướng chính">
          <NavLink to="/dashboard"><House size={18} aria-hidden="true" /> Trang chủ</NavLink>
          {user?.role === 'EXAM_MANAGER' || user?.role === 'ADMIN' ? <NavLink to="/manage/exams"><BookOpen size={18} aria-hidden="true" /> Quản lý đề</NavLink> : <NavLink to="/exams"><BookOpen size={18} aria-hidden="true" /> Đề thi</NavLink>}
          {user?.role === 'STUDENT' && <NavLink to="/history"><History size={18} aria-hidden="true" /> Lịch sử</NavLink>}
          {user?.role === 'ADMIN' && <NavLink to="/admin/users"><ShieldCheck size={18} aria-hidden="true" /> Quản trị</NavLink>}
          <NavLink to="/profile"><UserRound size={18} aria-hidden="true" /> Tài khoản</NavLink>
          <NavLink to="/settings"><Settings size={18} aria-hidden="true" /> Cài đặt</NavLink>
        </nav>
      </header>
      <main className="app-main" id="main-content"><Outlet /></main>
      <footer className="app-footer">Tracnghiem.com <span>Học vui • Luyện chắc</span>{user && <span>{profile.fullName}</span>}</footer>
    </div>
  )
}
