import { useEffect, useState } from 'react'
import { BookOpen, Clock3, ArrowRight, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { examsApi } from '../api/exams'
import type { ExamCatalog } from '../api/exams'
import { getApiErrorMessage } from '../api/axios'
import { useAuth } from '../auth/useAuth'

const examStatusLabels = { DRAFT: 'Bản nháp', PUBLISHED: 'Đang mở', CLOSED: 'Đã đóng' }

export default function ExamsPage() {
  const [catalog, setCatalog] = useState<ExamCatalog | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [examId, setExamId] = useState('')
  const [codeError, setCodeError] = useState('')
  const navigate = useNavigate()
  const { user } = useAuth()
  const role = user?.role ?? 'STUDENT'
  const studentCatalog = role === 'STUDENT'
  useEffect(() => {
    const controller = new AbortController()
    examsApi.list(page, controller.signal, role).then((data) => {
      if (!controller.signal.aborted) { setCatalog(data); setLoading(false) }
    }).catch((err: unknown) => {
      if (!axios.isCancel(err) && !controller.signal.aborted) { setError(getApiErrorMessage(err)); setLoading(false) }
    })
    return () => controller.abort()
  }, [page, revision, role])
  const changePage = (value: number) => { setLoading(true); setError(''); setPage(value) }
  return <div className="exam-page">
    <header className="exam-heading"><div><h1>Khám phá đề thi</h1></div><BookOpen size={40} aria-hidden="true" /></header>
    <form className="exam-code-form exam-panel" onSubmit={(event) => {
      event.preventDefault()
      const id = examId.trim()
      if (!/^[a-f\d]{24}$/i.test(id)) { setCodeError('Vui lòng nhập mã đề hợp lệ gồm 24 ký tự.'); return }
      navigate(`/exams/${id}`)
    }}>
      <label htmlFor="exam-code"><Search size={18} aria-hidden="true" /> Bạn đã có mã đề?</label>
      <div><input id="exam-code" value={examId} onChange={(event) => { setExamId(event.target.value); setCodeError('') }} placeholder="Nhập mã đề được chia sẻ" autoComplete="off" aria-describedby={codeError ? 'exam-code-error' : undefined} /><button className="button button-primary button-inline" type="submit">Mở đề thi</button></div>
      {codeError && <p id="exam-code-error" className="form-error" role="alert">{codeError}</p>}
    </form>
    {loading ? <p role="status" className="exam-panel">Đang tải đề thi…</p> : error ? <div className="exam-panel"><p className="form-error" role="alert">{error}</p><button className="button button-inline exam-button-secondary" onClick={() => { setLoading(true); setError(''); setRevision((value) => value + 1) }}>Thử lại</button></div> : catalog && <>
      <div className="exam-section-title"><h2>{studentCatalog ? 'Đề thi đang mở' : 'Danh sách đề thi'}</h2><span>{catalog.meta.total} đề thi</span></div>
      {catalog.items.length === 0 ? <div className="empty-state"><BookOpen size={36} aria-hidden="true" /><h3>{studentCatalog ? 'Chưa có đề thi đang mở' : 'Chưa có đề thi để hiển thị'}</h3><p>Bạn có thể nhập mã đề do giảng viên chia sẻ.</p></div> : <div className="exam-grid">{catalog.items.map((exam) => <article className="exam-card" key={exam.id}>
        <span className={`exam-badge exam-badge-${exam.status.toLowerCase()}`}>{examStatusLabels[exam.status]}</span><h2>{exam.title}</h2><p>{exam.description || 'Kiểm tra kiến thức với bài thi trắc nghiệm.'}</p>
        <div className="exam-card-meta"><span><Clock3 size={16} aria-hidden="true" /> {exam.durationMinutes} phút</span>{exam.totalQuestions !== null && <span><BookOpen size={16} aria-hidden="true" /> {exam.totalQuestions} câu hỏi</span>}</div>
        <Link to={`/exams/${exam.id}`} className="button button-inline exam-button-secondary">Xem đề thi <ArrowRight size={17} aria-hidden="true" /></Link>
      </article>)}</div>}
      {catalog.meta.totalPages > 1 && <nav className="exam-pagination" aria-label="Phân trang đề thi"><button disabled={page <= 1} onClick={() => changePage(page - 1)}>Trang trước</button><span>Trang {page} / {catalog.meta.totalPages}</span><button disabled={page >= catalog.meta.totalPages} onClick={() => changePage(page + 1)}>Trang sau</button></nav>}
    </>}
  </div>
}
