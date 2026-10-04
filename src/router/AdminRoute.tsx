import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export default function AdminRoute() {
  const { user } = useAuth()
  if (user?.role === 'ADMIN') return <Outlet />
  return <section className="exam-panel">
    <h1>Chức năng dành cho quản trị viên</h1>
    <p className="exam-muted">Tài khoản của bạn chưa có quyền quản lý người dùng.</p>
    <Link className="button button-primary button-inline" to="/dashboard">Về trang chủ</Link>
  </section>
}
