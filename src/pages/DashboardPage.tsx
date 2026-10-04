import { ArrowRight, BookOpen, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAccountProfile } from '../profile/useAccountProfile'
import { useAuth } from '../auth/useAuth'

export default function DashboardPage() {
  const { profile } = useAccountProfile()
  const { user } = useAuth()
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
          <h3>Sẵn sàng cho bài thi tiếp theo?</h3>
          <p>Chọn đề thi đang mở hoặc tiếp tục bài đang làm trong lịch sử.</p>
          <div className="exam-actions exam-actions-center"><Link className="button button-primary button-inline" to="/exams">Khám phá đề thi <ArrowRight size={18} aria-hidden="true" /></Link>{user?.role === 'STUDENT' && <Link className="button button-inline exam-button-secondary" to="/history">Lịch sử làm bài</Link>}</div>
        </div>
      </section>
    </>
  )
}
