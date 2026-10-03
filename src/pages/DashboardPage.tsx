import { ArrowRight, BookOpen, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAccountProfile } from '../profile/useAccountProfile'

export default function DashboardPage() {
  const { profile } = useAccountProfile()
  return (
    <>
      <section className="welcome-panel">
        <span className="intro-badge"><Sparkles size={15} aria-hidden="true" /> Học vui • Luyện chắc</span>
        <h1>Xin chào, {profile.fullName}!</h1>
        <p>Mỗi ngày một chút tiến bộ. Chào mừng bạn đến với Tracnghiem.com.</p>
        <Link className="button button-primary button-inline" to="/profile">Xem tài khoản <ArrowRight size={18} aria-hidden="true" /></Link>
      </section>
      <section className="dashboard-section" aria-labelledby="learning-title">
        <h2 id="learning-title">Không gian học tập</h2>
        <div className="empty-state">
          <span className="message-icon"><BookOpen size={30} aria-hidden="true" /></span>
          <h3>Chưa có đề thi để luyện tập</h3>
          <p>Các đề thi sẽ xuất hiện tại đây khi được mở.</p>
        </div>
      </section>
    </>
  )
}
