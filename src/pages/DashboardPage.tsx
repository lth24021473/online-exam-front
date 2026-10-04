import { ArrowRight, Clock3, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { attemptsApi, getAttemptErrorMessage } from '../api/attempts'
import type { AttemptHistoryItem, AttemptHistoryResponse, AttemptStatus } from '../api/attempts'
import type { AuthUser } from '../api/auth.api'
import { getApiErrorMessage } from '../api/axios'
import { examsApi } from '../api/exams'
import type { ExamCatalog, ExamInfo } from '../api/exams'
import { useAuth } from '../auth/useAuth'
import { PortalIllustration, StudyBookIllustration } from '../components/DashboardIllustrations'
import { useAccountProfile } from '../profile/useAccountProfile'
import { useProfileAvatar } from '../profile/useProfileAvatar'
import './DashboardPage.css'

const attemptTabs = [
  { status: 'IN_PROGRESS', label: 'Đang làm', emptyTitle: 'Sẵn sàng cho bài thi tiếp theo?', emptyDescription: 'Bạn chưa có bài thi đang làm. Chọn một đề thi để bắt đầu.' },
  { status: 'SUBMITTED', label: 'Hoàn thành', emptyTitle: 'Chưa có bài thi hoàn thành', emptyDescription: 'Kết quả sẽ xuất hiện tại đây sau khi bạn nộp bài.' },
  { status: 'CANCELLED', label: 'Đã hủy', emptyTitle: 'Chưa có bài thi đã hủy', emptyDescription: 'Các bài làm đã hủy sẽ được lưu tại đây để bạn xem lại.' },
] as const

const examTabs = [
  { status: 'PUBLISHED', label: 'Đang mở', emptyTitle: 'Chưa có đề thi đang mở', emptyDescription: 'Các đề thi đã mở sẽ xuất hiện tại đây.' },
  { status: 'DRAFT', label: 'Bản nháp', emptyTitle: 'Chưa có đề thi bản nháp', emptyDescription: 'Theo dõi các đề thi đang chuẩn bị tại đây.' },
  { status: 'CLOSED', label: 'Đã đóng', emptyTitle: 'Chưa có đề thi đã đóng', emptyDescription: 'Các đề thi đã đóng sẽ được hiển thị tại đây.' },
] as const

type DashboardData =
  | { kind: 'attempts'; items: AttemptHistoryResponse['items']; meta: AttemptHistoryResponse['meta'] }
  | { kind: 'exams'; items: ExamCatalog['items']; meta: ExamCatalog['meta'] }

type DashboardState =
  | { key: string; kind: 'ready'; data: DashboardData }
  | { key: string; kind: 'error'; message: string }

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })

function formatDate(value: string | null): string {
  return value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : '—'
}

function AttemptCard({ item, now }: { item: AttemptHistoryItem; now: number }) {
  const deadline = Date.parse(item.deadlineAt)
  const expired = item.expired || (Number.isFinite(deadline) && deadline <= now)
  const status = item.status === 'SUBMITTED' ? 'Hoàn thành' : item.status === 'CANCELLED' ? 'Đã hủy' : expired ? 'Đã hết giờ' : 'Đang làm'
  return <article className="dashboard-card">
    <div className="dashboard-card-top">
      <span className={`dashboard-card-status dashboard-status-${item.status.toLowerCase()}`}>{status}</span>
      <span className="dashboard-card-meta">{item.totalQuestions} câu hỏi</span>
    </div>
    <h2>{item.exam.title}</h2>
    <p className="dashboard-card-meta">
      {item.status === 'SUBMITTED' ? `Nộp bài: ${formatDate(item.submittedAt)}` : item.status === 'CANCELLED' ? `Hủy bài: ${formatDate(item.cancelledAt)}` : `Hạn nộp: ${formatDate(item.deadlineAt)}`}
    </p>
    {item.status === 'SUBMITTED' && <p className="dashboard-card-score" aria-label="Điểm bài thi"><strong>{typeof item.score === 'number' ? numberFormat.format(item.score) : '—'}</strong> / {numberFormat.format(item.maxScore)}</p>}
    {item.status === 'CANCELLED' && <p className="dashboard-card-meta">Không chấm điểm</p>}
    {item.status === 'IN_PROGRESS' && !expired && <Link className="dashboard-card-link" to={`/exams/${item.exam.id}/take`}>Tiếp tục làm bài <ArrowRight size={17} aria-hidden="true" /></Link>}
    {(item.status === 'SUBMITTED' || (item.status === 'IN_PROGRESS' && expired)) && <Link className="dashboard-card-link" to={`/attempts/${item.id}/result`} state={{ examId: item.exam.id }}>Xem kết quả <ArrowRight size={17} aria-hidden="true" /></Link>}
    {item.status === 'CANCELLED' && <Link className="dashboard-card-link" to={`/exams/${item.exam.id}`}>Xem đề thi <ArrowRight size={17} aria-hidden="true" /></Link>}
  </article>
}

function ExamCard({ item }: { item: ExamInfo }) {
  const status = item.status === 'PUBLISHED' ? 'Đang mở' : item.status === 'DRAFT' ? 'Bản nháp' : 'Đã đóng'
  return <article className="dashboard-card">
    <div className="dashboard-card-top">
      <span className={`dashboard-card-status dashboard-status-${item.status.toLowerCase()}`}>{status}</span>
      <span className="dashboard-card-meta"><Clock3 size={15} aria-hidden="true" /> {item.durationMinutes} phút</span>
    </div>
    <h2>{item.title}</h2>
    {item.description && <p className="dashboard-card-meta">{item.description}</p>}
    {item.totalQuestions !== null && <p className="dashboard-card-meta">{item.totalQuestions} câu hỏi</p>}
    <Link className="dashboard-card-link" to={`/exams/${item.id}`}>Xem đề thi <ArrowRight size={17} aria-hidden="true" /></Link>
  </article>
}

function DashboardContent({ user }: { user: AuthUser }) {
  const { profile } = useAccountProfile()
  const { avatar } = useProfileAvatar(user.id)
  const isStudent = user.role === 'STUDENT'
  const tabs = isStudent ? attemptTabs : examTabs
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<DashboardState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tabId = useId()
  const selectedTab = tabs[selectedIndex]
  const status = selectedTab.status
  const key = `${user.id}:${user.role}:${status}:${page}:${revision}`
  const current = state?.key === key ? state : null
  const data = current?.kind === 'ready' ? current.data : null
  const initials = profile.fullName.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toLocaleUpperCase('vi-VN')
  const catalogLink = isStudent ? 'Khám phá đề thi' : 'Xem danh sách đề thi'

  useEffect(() => {
    if (!isStudent) return
    const updateClock = () => setNow(Date.now())
    const updateVisibleClock = () => { if (document.visibilityState === 'visible') updateClock() }
    const timer = window.setInterval(updateClock, 1000)
    window.addEventListener('focus', updateClock)
    document.addEventListener('visibilitychange', updateVisibleClock)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', updateClock)
      document.removeEventListener('visibilitychange', updateVisibleClock)
    }
  }, [isStudent])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    async function load() {
      try {
        const result: DashboardData = isStudent
          ? { kind: 'attempts', ...await attemptsApi.history({ page, limit: 12, status: status as AttemptStatus }, controller.signal) }
          : { kind: 'exams', ...await examsApi.list(page, controller.signal, user.role, status as ExamInfo['status']) }
        if (!active) return
        if (page > 1 && page > result.meta.totalPages) {
          setPage(Math.max(1, result.meta.totalPages))
          return
        }
        setState({ key, kind: 'ready', data: result })
      } catch (error) {
        if (active) setState({ key, kind: 'error', message: isStudent ? getAttemptErrorMessage(error) : getApiErrorMessage(error) })
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [isStudent, key, page, status, user.role])

  function selectTab(index: number) {
    setSelectedIndex(index)
    setPage(1)
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    selectTab(next)
    tabRefs.current[next]?.focus()
  }

  return <div className="dashboard-page">
    <section className="dashboard-hero" aria-labelledby="dashboard-greeting">
      <div className="dashboard-hero-copy">
        <div className="dashboard-welcome">
          <div className="dashboard-avatar">
            {avatar ? <img src={avatar} alt={`Ảnh đại diện của ${profile.fullName}`} /> : <span role="img" aria-label={`Ảnh đại diện của ${profile.fullName}`}>{initials || 'HV'}</span>}
          </div>
          <div className="dashboard-greeting">
            <h1 id="dashboard-greeting">Xin chào, {profile.fullName}!</h1>
            <p>Chào mừng bạn trở lại với Tracnghiem.com.</p>
          </div>
        </div>
        <div className="dashboard-hint">
          <Sparkles size={23} aria-hidden="true" />
          <div><p>{isStudent ? 'Bắt đầu một đề thi mới hoặc tiếp tục bài đang làm. Theo dõi kết quả của bạn ngay tại đây.' : 'Theo dõi các đề thi đang mở, bản nháp và đề đã đóng. Chọn một đề để xem thông tin chi tiết.'}</p><Link to="/exams">{catalogLink} <ArrowRight size={16} aria-hidden="true" /></Link></div>
        </div>
      </div>
      <div className="dashboard-hero-art"><PortalIllustration /></div>
    </section>

    <div className="dashboard-tabs" role="tablist" aria-label={isStudent ? 'Bài làm của bạn' : 'Trạng thái đề thi'}>
      {tabs.map((tab, index) => <button
        key={tab.status}
        id={`${tabId}-tab-${index}`}
        role="tab"
        type="button"
        aria-selected={index === selectedIndex}
        aria-controls={`${tabId}-panel`}
        tabIndex={index === selectedIndex ? 0 : -1}
        ref={(element) => { tabRefs.current[index] = element }}
        onClick={() => selectTab(index)}
        onKeyDown={(event) => handleTabKey(event, index)}
      >{tab.label}</button>)}
    </div>

    <section className="dashboard-content" id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-tab-${selectedIndex}`} aria-busy={!current}>
      {!current && <div className="dashboard-panel-status" role="status"><span className="loading-spinner" aria-hidden="true" /><p>{isStudent ? 'Đang tải bài làm…' : 'Đang tải đề thi…'}</p></div>}
      {current?.kind === 'error' && <div className="dashboard-panel-status"><p className="form-error" role="alert">{current.message}</p><button type="button" className="button button-primary button-inline" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={17} aria-hidden="true" /> Thử lại</button></div>}
      {data && data.items.length === 0 && <div className="dashboard-empty">
        <StudyBookIllustration />
        <h2>{selectedTab.emptyTitle}</h2>
        <p>{selectedTab.emptyDescription}</p>
        <Link className="dashboard-card-link" to="/exams">{catalogLink} <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>}
      {data && data.items.length > 0 && <>
        <div className="dashboard-cards">
          {data.kind === 'attempts' ? data.items.map((item) => <AttemptCard item={item} now={now} key={item.id} />) : data.items.map((item) => <ExamCard item={item} key={item.id} />)}
        </div>
        <nav className="dashboard-pagination" aria-label={isStudent ? 'Phân trang bài làm' : 'Phân trang đề thi'}>
          <button type="button" className="button button-secondary button-inline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trang trước</button>
          <span>Trang {data.meta.page} / {Math.max(1, data.meta.totalPages)}</span>
          <button type="button" className="button button-secondary button-inline" disabled={page >= data.meta.totalPages} onClick={() => setPage((value) => value + 1)}>Trang sau</button>
        </nav>
      </>}
    </section>
  </div>
}

export default function DashboardPage() {
  const { user } = useAuth()
  return user ? <DashboardContent key={`${user.id}:${user.role}`} user={user} /> : null
}
