import { Link } from 'react-router-dom'
import Brand from '../components/Brand'

export default function NotFoundPage() {
  return (
    <div className="not-found-layout">
      <header className="app-header"><Brand /></header>
      <main className="not-found">
        <span className="error-code">404</span>
        <h1>Không tìm thấy trang</h1>
        <p>Trang bạn đang tìm có thể đã được chuyển hoặc không tồn tại.</p>
        <Link className="button button-primary button-inline" to="/">Về trang chủ</Link>
      </main>
    </div>
  )
}
