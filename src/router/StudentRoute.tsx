import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export default function StudentRoute() {
  const { user } = useAuth()
  if (user?.role === 'STUDENT') return <Outlet />
  return <section className="exam-panel"><h1>Chức năng dành cho học sinh</h1><p className="exam-muted">Tài khoản quản lý và quản trị có thể xem đề thi và thông tin tài khoản. Chức năng làm bài dành cho học viên.</p><Link className="button button-primary button-inline" to="/exams">Xem đề thi</Link></section>
}
