import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import type { AttemptStatus } from '../api/attempts'
import { attemptStatusLabels, getManagerErrorMessage, managerExamsApi } from '../api/manager-exams'
import type { ManagerResults } from '../api/manager-exams'
import './ManagerExams.css'

const formatScore = (value: number | null) => typeof value === 'number' ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value) : '—'
const formatDate = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('vi-VN') : '—'
export default function ManagerExamResultsPage() {
  const { examId = '' } = useParams()
  const [status, setStatus] = useState<AttemptStatus | ''>('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; data?: ManagerResults; error?: string } | null>(null)
  const key = `${examId}:${status}:${page}:${revision}`
  const current = loaded?.key === key ? loaded : null
  const data = current?.data
  useEffect(() => {
    const controller = new AbortController()
    managerExamsApi.results(examId, { page, limit: 10, ...(status && { status }) }, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (page > 1 && page > result.meta.totalPages) { setPage(Math.max(1, result.meta.totalPages)); return }
      setLoaded({ key, data: result })
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setLoaded({ key, error: getManagerErrorMessage(failure) }) })
    return () => controller.abort()
  }, [examId, key, page, status])
  return <div className="exam-page manager-page">
    <Link className="exam-back-link" to={`/manage/exams/${examId}`}><ArrowLeft size={17} aria-hidden="true" />Về quản lý đề</Link>
    <header className="exam-page-heading"><div><h1>Kết quả học sinh</h1>{data && <p>{data.exam.title}</p>}</div><button className="button button-secondary button-inline" onClick={() => setRevision((value) => value + 1)}>Làm mới kết quả</button></header>
    <label className="manager-results-filter">Trạng thái bài làm<select value={status} onChange={(event) => { setStatus(event.target.value as AttemptStatus | ''); setPage(1) }}><option value="">Tất cả</option>{Object.entries(attemptStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {!current ? <p className="exam-panel" role="status">Đang tải kết quả…</p> : current.error ? <section className="exam-panel"><p className="form-error" role="alert">{current.error}</p><button className="button button-primary button-inline" onClick={() => setRevision((value) => value + 1)}>Thử lại</button></section> : data && <>
      <section className="manager-result-summary" aria-label="Thống kê toàn bộ đề thi">
        <div><span>Tổng lượt làm bài</span><strong>{data.summary.totalAttempts}</strong></div><div><span>Đã nộp</span><strong>{data.summary.submittedCount}</strong></div><div><span>Đang làm / Đã hủy</span><strong>{data.summary.inProgressCount} / {data.summary.cancelledCount}</strong></div><div><span>Điểm trung bình</span><strong>{formatScore(data.summary.averageScore)}</strong></div><div><span>Cao nhất / Thấp nhất</span><strong>{formatScore(data.summary.highestScore)} / {formatScore(data.summary.lowestScore)}</strong></div>
      </section>
      <p className="exam-muted">Thống kê áp dụng cho toàn bộ đề thi. Danh sách bên dưới áp dụng bộ lọc trạng thái.</p>
      {data.data.length === 0 ? <section className="exam-panel"><h2>Chưa có bài làm phù hợp</h2><p>Kết quả xuất hiện khi học sinh bắt đầu làm đề thi này.</p></section> : <div className="manager-results-scroll" tabIndex={0} aria-label="Bảng kết quả học sinh"><table className="manager-results-table"><thead><tr><th scope="col">Học sinh</th><th scope="col">Trạng thái</th><th scope="col">Điểm</th><th scope="col">Đúng / Tổng câu</th><th scope="col">Bắt đầu</th><th scope="col">Nộp / Hủy</th></tr></thead><tbody>{data.data.map((attempt) => <tr key={attempt.id}><td><strong>{attempt.user.fullName}</strong><span className="manager-student-email">{attempt.user.email}</span></td><td>{attemptStatusLabels[attempt.status]}</td><td>{attempt.status === 'SUBMITTED' ? `${formatScore(attempt.score)} / 10` : '—'}</td><td>{attempt.correctCount ?? '—'} / {attempt.totalQuestions}</td><td>{formatDate(attempt.startedAt)}</td><td>{formatDate(attempt.submittedAt ?? attempt.cancelledAt)}</td></tr>)}</tbody></table></div>}
      <nav className="exam-pagination" aria-label="Phân trang kết quả học sinh"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trang trước</button><span>Trang {data.meta.page} / {Math.max(1, data.meta.totalPages)} · {data.meta.total} lượt</span><button disabled={page >= data.meta.totalPages} onClick={() => setPage((value) => value + 1)}>Trang sau</button></nav>
    </>}
  </div>
}
