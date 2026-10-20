import axios from 'axios'
import { ArrowRight, CheckCircle2, Clock3, History, RefreshCw, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { attemptsApi, getAttemptErrorMessage } from '../api/attempts'
import { clearAttemptCache, readAttemptCache } from '../attempts/attempt-storage'
import { useAuth } from '../auth/useAuth'
import { useAutoDismissNotice } from '../hooks/useAutoDismissNotice'

type HistoryResponse = Awaited<ReturnType<typeof attemptsApi.history>>
type AttemptItem = HistoryResponse['items'][number]
type StatusFilter = '' | 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED'
type HistoryState =
  | { key: string; kind: 'ready'; history: HistoryResponse }
  | { key: string; kind: 'error'; message: string }

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })

function formatDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function hasExpired(item: AttemptItem, now: number) {
  const deadline = Date.parse(item.deadlineAt)
  return item.expired || (Number.isFinite(deadline) && deadline <= now)
}

function getStatus(item: AttemptItem, expired: boolean) {
  if (item.status === 'SUBMITTED') return { name: 'Đã nộp', className: 'attempt-status-submitted', icon: CheckCircle2 }
  if (item.status === 'CANCELLED') return { name: 'Đã hủy', className: 'attempt-status-cancelled', icon: XCircle }
  return { name: expired ? 'Đã hết giờ' : 'Đang làm', className: expired ? 'attempt-status-expired' : 'attempt-status-active', icon: Clock3 }
}

export default function AttemptHistoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const userId = user?.id
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<StatusFilter>('')
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<HistoryState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [cancelSelection, setCancelSelection] = useState<AttemptItem | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useAutoDismissNotice()
  const mounted = useRef(false)
  const cancelLock = useRef(false)
  const cancelHeading = useRef<HTMLHeadingElement>(null)
  const key = `${page}:${status}:${version}`
  function clearActionMessage() { setActionError(''); setNotice('') }

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    const updateClock = () => {
      const checkedAt = Date.now()
      setNow(checkedAt)
      setCancelSelection((selection) => selection && hasExpired(selection, checkedAt) ? null : selection)
    }
    const updateVisibleClock = () => { if (document.visibilityState === 'visible') updateClock() }
    const timer = window.setInterval(updateClock, 1000)
    window.addEventListener('focus', updateClock)
    document.addEventListener('visibilitychange', updateVisibleClock)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', updateClock)
      document.removeEventListener('visibilitychange', updateVisibleClock)
    }
  }, [])

  useEffect(() => {
    if (cancelSelection) cancelHeading.current?.focus()
  }, [cancelSelection])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    async function load() {
      try {
        const history = await attemptsApi.history({ page, limit: 10, ...(status ? { status } : {}) }, controller.signal)
        if (!active) return
        if (userId) {
          for (const item of history.items) {
            if (item.status !== 'IN_PROGRESS' && readAttemptCache(userId, item.exam.id)?.session.attempt.id === item.id) {
              clearAttemptCache(userId, item.exam.id)
            }
          }
        }
        if (page > 1 && history.meta.totalPages < page) {
          setPage(Math.max(1, history.meta.totalPages))
          return
        }
        setState({ key, kind: 'ready', history })
      } catch (error) {
        if (active) setState({ key, kind: 'error', message: getAttemptErrorMessage(error) })
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [page, status, key, userId])

  async function confirmCancel() {
    if (!cancelSelection || cancelLock.current) return
    const checkedAt = Date.now()
    if (hasExpired(cancelSelection, checkedAt)) {
      setNow(checkedAt)
      setCancelSelection(null)
      clearActionMessage()
      setActionError('Bài thi đã hết giờ. Hãy xem kết quả.')
      return
    }
    cancelLock.current = true
    setCancelling(true)
    clearActionMessage()
    try {
      await attemptsApi.cancel(cancelSelection.id)
      if (userId && readAttemptCache(userId, cancelSelection.exam.id)?.session.attempt.id === cancelSelection.id) {
        clearAttemptCache(userId, cancelSelection.exam.id)
      }
      if (mounted.current) {
        setNotice('Đã hủy bài. Bài thi vẫn được lưu trong lịch sử của bạn.')
        setCancelSelection(null)
        setVersion((value) => value + 1)
      }
    } catch (error) {
      if (mounted.current) {
        const conflict = axios.isAxiosError(error) && error.response?.status === 409
        setActionError(conflict ? 'Bài thi đã đổi trạng thái. Danh sách đang được cập nhật; hãy kiểm tra lại.' : getAttemptErrorMessage(error))
        if (conflict) {
          setCancelSelection(null)
          setVersion((value) => value + 1)
        }
      }
    } finally {
      cancelLock.current = false
      if (mounted.current) setCancelling(false)
    }
  }

  const current = state?.key === key ? state : null
  const history = current?.kind === 'ready' ? current.history : null

  return <div className="exam-page history-page">
    <header className="exam-page-heading">
      <div><p className="exam-eyebrow"><History size={16} aria-hidden="true" /> Bài thi của bạn</p><h1>Lịch sử làm bài</h1><p>Tiếp tục bài đang làm và xem lại kết quả của bạn.</p></div>
      <Link className="button button-primary button-inline" to="/exams">Chọn đề thi <ArrowRight size={17} aria-hidden="true" /></Link>
    </header>
    <div className="history-toolbar">
      <label className="exam-filter">Trạng thái bài làm
        <select aria-label="Trạng thái bài làm" value={status} disabled={cancelling} onChange={(event) => {
          setStatus(event.target.value as StatusFilter)
          setPage(1)
          setCancelSelection(null)
          clearActionMessage()
        }}>
          <option value="">Tất cả trạng thái</option>
          <option value="IN_PROGRESS">Đang làm</option>
          <option value="SUBMITTED">Đã nộp</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>
      </label>
      <button type="button" className="button button-secondary button-inline" disabled={!current || cancelling} onClick={() => setVersion((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Làm mới</button>
    </div>
    {actionError && <p className="form-error" role="alert">{actionError}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {cancelSelection && <section className="attempt-cancel-confirm exam-card" aria-labelledby="cancel-attempt-heading">
      <h2 id="cancel-attempt-heading" tabIndex={-1} ref={cancelHeading}>Hủy bài đang làm?</h2>
      <p>Bài “{cancelSelection.exam.title}” sẽ kết thúc mà không chấm điểm. Bạn sẽ không thể tiếp tục bài đã hủy.</p>
      <div className="exam-actions">
        <button type="button" className="button button-danger button-inline" disabled={cancelling} onClick={() => { void confirmCancel() }}>{cancelling ? 'Đang hủy…' : 'Xác nhận hủy'}</button>
        <button type="button" className="button button-secondary button-inline" disabled={cancelling} onClick={() => setCancelSelection(null)}>Giữ bài</button>
      </div>
    </section>}

    {!current && <section className="exam-state-panel" aria-busy="true" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><p>Đang tải lịch sử làm bài…</p></section>}
    {current?.kind === 'error' && <section className="exam-state-panel"><p className="form-error" role="alert">{current.message}</p><button type="button" className="button button-primary button-inline" onClick={() => setVersion((value) => value + 1)}>Thử lại</button></section>}
    {history && history.items.length === 0 && <section className="empty-state"><span className="message-icon"><History size={29} aria-hidden="true" /></span><h2>{status ? 'Chưa có bài thi ở trạng thái này' : 'Bạn chưa làm bài thi nào'}</h2><p>Chọn một đề thi để bắt đầu luyện tập.</p><Link className="text-link" to="/exams">Xem các đề thi</Link></section>}
    {history && history.items.length > 0 && <>
      <p className="history-count" role="status">{history.meta.total} bài thi{status ? ' phù hợp' : ''}</p>
      <div className="attempt-history-list">
        {history.items.map((item) => {
          const expired = hasExpired(item, now)
          const state = getStatus(item, expired)
          const StatusIcon = state.icon
          return <article className="attempt-history-card exam-card" key={item.id}>
            <div className="attempt-history-main">
              <span className={`attempt-status ${state.className}`}><StatusIcon size={16} aria-hidden="true" /> {state.name}</span>
              <h2>{item.exam.title}</h2>
              <dl className="attempt-history-dates">
                <div><dt>Bắt đầu</dt><dd>{formatDate(item.startedAt)}</dd></div>
                {item.status === 'SUBMITTED' && <div><dt>Nộp bài</dt><dd>{formatDate(item.submittedAt)}</dd></div>}
                {item.status === 'CANCELLED' && <div><dt>Hủy bài</dt><dd>{formatDate(item.cancelledAt)}</dd></div>}
                {item.status === 'IN_PROGRESS' && <div><dt>Hạn nộp</dt><dd>{formatDate(item.deadlineAt)}</dd></div>}
              </dl>
            </div>
            <div className="attempt-history-summary">
              {item.status === 'SUBMITTED' && <p className="history-score" aria-label="Điểm bài thi"><strong>{typeof item.score === 'number' ? numberFormat.format(item.score) : '—'}</strong> / {numberFormat.format(item.maxScore)}</p>}
              <p>{item.totalQuestions} câu hỏi</p>
              <div className="attempt-history-actions">
                {(item.status === 'SUBMITTED' || expired) && item.status !== 'CANCELLED' && <Link className="button button-secondary button-inline" to={`/attempts/${item.id}/result`} state={{ examId: item.exam.id }}>Xem kết quả <ArrowRight size={16} aria-hidden="true" /></Link>}
                {item.status === 'IN_PROGRESS' && !expired && <>
                  <Link className="button button-primary button-inline" to={`/exams/${item.exam.id}/take`} onClick={(event) => {
                    const checkedAt = Date.now()
                    if (!hasExpired(item, checkedAt)) return
                    event.preventDefault()
                    setNow(checkedAt)
                    navigate(`/attempts/${item.id}/result`, { state: { examId: item.exam.id } })
                  }}>Tiếp tục bài <ArrowRight size={16} aria-hidden="true" /></Link>
                  <button type="button" className="attempt-cancel-link" disabled={cancelling} onClick={() => { setCancelSelection(item); clearActionMessage() }}>Hủy bài</button>
                </>}
                {item.status === 'CANCELLED' && <span className="history-cancelled-note">Không chấm điểm</span>}
              </div>
            </div>
          </article>
        })}
      </div>
      <nav className="history-pagination" aria-label="Phân trang lịch sử">
        <button type="button" className="button button-secondary button-inline" disabled={page <= 1 || cancelling} onClick={() => { setPage((value) => value - 1); setCancelSelection(null) }}>Trang trước</button>
        <span>Trang {history.meta.page} / {Math.max(1, history.meta.totalPages)}</span>
        <button type="button" className="button button-secondary button-inline" disabled={page >= history.meta.totalPages || cancelling} onClick={() => { setPage((value) => value + 1); setCancelSelection(null) }}>Trang sau</button>
      </nav>
    </>}
  </div>
}
