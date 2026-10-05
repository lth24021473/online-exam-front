import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Plus, RefreshCw } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { examStatusLabels, getManagerErrorMessage, managerExamsApi } from '../api/manager-exams'
import type { ExamPayload, ExamStatus, ManagerExam } from '../api/manager-exams'
import { useAuth } from '../auth/useAuth'
import ManagerExamForm from '../components/ManagerExamForm'
import { useAutoDismissNotice } from '../hooks/useAutoDismissNotice'
import './ManagerExams.css'

export default function ManagerExamsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [notice] = useAutoDismissNotice(typeof location.state?.notice === 'string' ? location.state.notice : '')
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; exams?: ManagerExam[]; error?: string } | null>(null)
  const [status, setStatus] = useState<ExamStatus | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const key = `${user?.id}:${user?.role}:${revision}`
  const current = loaded?.key === key ? loaded : null
  useEffect(() => {
    const controller = new AbortController()
    managerExamsApi.list(controller.signal).then((exams) => {
      if (!controller.signal.aborted) setLoaded({ key, exams })
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setLoaded({ key, error: getManagerErrorMessage(failure) }) })
    return () => controller.abort()
  }, [key])
  const filtered = current?.exams?.filter((exam) => (!status || exam.status === status) && `${exam.title} ${exam.description ?? ''}`.toLocaleLowerCase('vi-VN').includes(search.trim().toLocaleLowerCase('vi-VN'))) ?? []
  const totalPages = Math.max(1, Math.ceil(filtered.length / 12))
  const displayedPage = Math.min(page, totalPages)
  const items = filtered.slice((displayedPage - 1) * 12, displayedPage * 12)
  async function create(payload: ExamPayload) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { const exam = await managerExamsApi.create(payload); navigate(`/manage/exams/${exam.id}`, { state: { notice: 'Đã tạo đề thi bản nháp.' } }) }
    catch (failure) { setError(getManagerErrorMessage(failure)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="exam-page manager-page">
    <header className="exam-page-heading"><div><h1>Quản lý đề thi</h1><p>{user?.role === 'ADMIN' ? 'Quản lý đề thi của toàn hệ thống.' : 'Soạn đề, mở bài thi và theo dõi kết quả học sinh.'}</p></div><button className="button button-primary button-inline" disabled={busy} onClick={() => { setCreating((value) => !value); setError('') }}><Plus size={18} aria-hidden="true" />{creating ? 'Đóng form tạo đề' : 'Tạo đề thi'}</button></header>
    {notice && <p className="form-success" role="status">{notice}</p>}
    {creating && <section className="exam-panel" aria-label="Tạo đề thi"><h2>Tạo đề thi mới</h2>{error && <p className="form-error" role="alert">{error}</p>}<ManagerExamForm busy={busy} submitLabel="Lưu đề mới" onSubmit={create} /></section>}
    <div className="manager-toolbar"><label>Tìm đề thi<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label><label>Trạng thái đề<select value={status} onChange={(event) => { setStatus(event.target.value as ExamStatus | ''); setPage(1) }}><option value="">Tất cả</option>{Object.entries(examStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button button-secondary button-inline" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={17} aria-hidden="true" />Làm mới</button></div>
    {!current ? <p className="exam-panel" role="status">Đang tải đề thi…</p> : current.error ? <section className="exam-panel"><p className="form-error" role="alert">{current.error}</p><button className="button button-primary button-inline" onClick={() => setRevision((value) => value + 1)}>Thử lại</button></section> : <><p className="exam-muted">{filtered.length} đề thi</p>
      {items.length === 0 ? <section className="exam-panel"><h2>Chưa có đề thi phù hợp</h2><p>Tạo đề mới hoặc thay đổi bộ lọc để tiếp tục.</p></section> : <div className="exam-grid">{items.map((exam) => <article className="exam-card" key={exam.id}><span className="exam-badge">{examStatusLabels[exam.status]}</span><h2>{exam.title}</h2><p>{exam.description || 'Chưa có mô tả.'}</p><p className="exam-muted">{exam.durationMinutes} phút · {exam.totalQuestions ?? '—'} câu hỏi</p><div className="exam-actions"><Link className="button button-secondary button-inline" to={`/manage/exams/${exam.id}`}>Quản lý đề <ArrowRight size={16} aria-hidden="true" /></Link><Link className="text-link" to={`/manage/exams/${exam.id}/results`}>Kết quả học sinh</Link></div></article>)}</div>}
      {totalPages > 1 && <nav className="exam-pagination" aria-label="Phân trang đề quản lý"><button disabled={displayedPage <= 1} onClick={() => setPage(displayedPage - 1)}>Trang trước</button><span>Trang {displayedPage} / {totalPages}</span><button disabled={displayedPage >= totalPages} onClick={() => setPage(displayedPage + 1)}>Trang sau</button></nav>}
    </>}
  </div>
}
