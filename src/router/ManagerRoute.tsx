import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
export default function ManagerRoute() {
  const { user } = useAuth()
  if (user?.role === 'EXAM_MANAGER' || user?.role === 'ADMIN') return <Outlet />
  return <section className="exam-panel"><h1>Chức năng dành cho người quản lý đề thi</h1><p className="exam-muted">Tài khoản của bạn chưa có quyền quản lý đề thi và kết quả học sinh.</p><Link className="button button-primary button-inline" to="/exams">Xem đề thi</Link></section>
}
