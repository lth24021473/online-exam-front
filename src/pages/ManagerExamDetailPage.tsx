import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { examStatusLabels, getManagerErrorMessage, managerExamsApi } from '../api/manager-exams'
import type { ExamPayload, ManagerExam, ManagerQuestion, QuestionPayload } from '../api/manager-exams'
import ManagerExamForm from '../components/ManagerExamForm'
import ManagerQuestionForm from '../components/ManagerQuestionForm'
import './ManagerExams.css'

type Confirmation = { action: 'publish' | 'close' | 'deleteExam' | 'deleteQuestion'; question?: ManagerQuestion }
const confirmLabels = {
  publish: { title: 'Mở đề thi?', button: 'Xác nhận mở đề', description: 'Học sinh có thể bắt đầu làm bài. Sau khi mở, nội dung đề và đáp án sẽ được khóa.' },
  close: { title: 'Đóng đề thi?', button: 'Xác nhận đóng đề', description: 'Học sinh không thể bắt đầu lượt mới. Các bài đang làm và kết quả vẫn được giữ.' },
  deleteExam: { title: 'Xóa đề thi bản nháp?', button: 'Xác nhận xóa đề', description: 'Đề thi và toàn bộ câu hỏi sẽ bị xóa. Thao tác này không thể hoàn tác.' },
  deleteQuestion: { title: 'Xóa câu hỏi?', button: 'Xác nhận xóa câu hỏi', description: 'Câu hỏi và các đáp án sẽ bị xóa khỏi đề bản nháp.' },
}
export default function ManagerExamDetailPage() {
  const { examId = '' } = useParams()
  // Changing the route discards the previous exam's editor and confirmation.
  return <ManagerExamDetailContent key={examId} examId={examId} />
}

function ManagerExamDetailContent({ examId }: { examId: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState<{ id: string; exam?: ManagerExam; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ error?: boolean; message: string } | null>(null)
  const [editing, setEditing] = useState<ManagerQuestion | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const lock = useRef(false)
  const dialog = useRef<HTMLElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    managerExamsApi.detail(examId, controller.signal).then((exam) => {
      if (!controller.signal.aborted) setLoaded({ id: examId, exam })
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setLoaded({ id: examId, error: getManagerErrorMessage(failure) }) })
    return () => controller.abort()
  }, [examId, revision])
  useEffect(() => {
    if (!confirmation) return
    const previous = document.activeElement
    cancelButton.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [confirmation])
  const current = loaded?.id === examId ? loaded : null
  const exam = current?.exam
  const questions = [...(exam?.questions ?? [])].sort((left, right) => left.position - right.position)
  const editable = exam?.status === 'DRAFT'
  const nextPosition = Math.max(0, ...questions.map((question) => question.position)) + 1
  const publishable = questions.length > 0 && questions.every((question) => question.options.length >= 2 && question.options.every((option) => option.content.trim()) && question.options.filter((option) => option.isCorrect).length === 1)
  const locked = busy || Boolean(confirmation)
  function updateExam(change: Partial<ManagerExam>) {
    setLoaded((previous) => previous?.exam && previous.id === examId ? { ...previous, exam: { ...previous.exam, ...change } } : previous)
  }
  async function mutate(work: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setFeedback(null)
    try { await work() }
    catch (failure) { setFeedback({ error: true, message: getManagerErrorMessage(failure) }) }
    finally { lock.current = false; setBusy(false); setConfirmation(null) }
  }
  async function saveMetadata(payload: ExamPayload) {
    await mutate(async () => {
      const result = await managerExamsApi.update(examId, payload)
      updateExam({ ...result, questions })
      setFeedback({ message: 'Đã lưu thông tin đề thi.' })
    })
  }
  async function saveQuestion(payload: QuestionPayload) {
    await mutate(async () => {
      const result = editing ? await managerExamsApi.updateQuestion(examId, editing.id, payload) : await managerExamsApi.createQuestion(examId, payload)
      const updated = editing ? questions.map((question) => question.id === result.id ? result : question) : [...questions, result]
      updateExam({ questions: updated, totalQuestions: updated.length })
      setEditing(null); setFeedback({ message: 'Đã lưu câu hỏi.' })
    })
  }
  async function confirmAction() {
    if (!confirmation) return
    await mutate(async () => {
      if (confirmation.action === 'deleteExam') {
        await managerExamsApi.remove(examId)
        navigate('/manage/exams', { replace: true, state: { notice: 'Đã xóa đề thi.' } }); return
      }
      if (confirmation.action === 'deleteQuestion' && confirmation.question) {
        await managerExamsApi.removeQuestion(examId, confirmation.question.id)
        const updated = questions.filter((question) => question.id !== confirmation.question?.id)
        updateExam({ questions: updated, totalQuestions: updated.length })
        if (editing?.id === confirmation.question.id) setEditing(null)
        setFeedback({ message: 'Đã xóa câu hỏi.' }); return
      }
      const result = confirmation.action === 'publish' ? await managerExamsApi.publish(examId) : await managerExamsApi.close(examId)
      updateExam({ ...result, questions }); setEditing(null)
      setFeedback({ message: confirmation.action === 'publish' ? 'Đã mở đề thi.' : 'Đã đóng đề thi.' })
    })
  }
  function refresh() { setLoaded(null); setFeedback(null); setEditing(null); setRevision((value) => value + 1) }
  return <div className="exam-page manager-page">
    <Link className="exam-back-link" to="/manage/exams"><ArrowLeft size={17} aria-hidden="true" />Quản lý đề thi</Link>
    {!current ? <p className="exam-panel" role="status">Đang tải đề thi…</p> : current.error ? <section className="exam-panel"><p className="form-error" role="alert">{current.error}</p><button className="button button-primary button-inline" onClick={refresh}>Thử lại</button></section> : exam && <>
      <header className="exam-page-heading"><div><span className="exam-badge">{examStatusLabels[exam.status]}</span><h1>{exam.title}</h1><p>Mã đề: <span className="manager-exam-code">{exam.id}</span></p></div><Link className="button button-secondary button-inline" to={`/manage/exams/${examId}/results`}>Kết quả học sinh</Link></header>
      {feedback && <p className={feedback.error ? 'form-error' : 'form-success'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
      {!feedback && typeof location.state?.notice === 'string' && <p className="form-success" role="status">{location.state.notice}</p>}
      <div className="exam-actions manager-status-actions">
        {editable && <button className="button button-primary button-inline" disabled={locked || !publishable} onClick={() => setConfirmation({ action: 'publish' })}>Mở đề thi</button>}
        {exam.status === 'PUBLISHED' && <button className="button button-primary button-inline" disabled={locked} onClick={() => setConfirmation({ action: 'close' })}>Đóng đề thi</button>}
        {editable && <button className="button button-danger button-inline" disabled={locked} onClick={() => setConfirmation({ action: 'deleteExam' })}>Xóa đề thi</button>}
        <button className="button button-secondary button-inline" disabled={locked} onClick={refresh}>Tải lại đề</button>
      </div>
      {editable && !publishable && <p className="exam-muted">Thêm ít nhất một câu hỏi hợp lệ, với ít nhất hai đáp án và một đáp án đúng, để mở đề thi.</p>}
      {!editable && <p className="manager-readonly-note">Nội dung đã được khóa sau khi mở đề. Bạn có thể xem câu hỏi và kết quả học sinh.</p>}
      <section className="exam-panel"><h2>Thông tin đề thi</h2><ManagerExamForm key={exam.id} initial={{ title: exam.title, description: exam.description ?? '', instructions: exam.instructions ?? '', durationMinutes: exam.durationMinutes }} busy={locked} readOnly={!editable} submitLabel="Lưu thông tin đề" onSubmit={saveMetadata} /></section>
      <section className="manager-question-list" aria-label="Danh sách câu hỏi"><h2>Câu hỏi ({questions.length})</h2>{questions.length === 0 && <p className="exam-panel">Chưa có câu hỏi. Soạn câu đầu tiên ở bên dưới.</p>}{questions.map((question) => <article className="exam-panel manager-question-card" key={question.id}>
        <h3>Câu {question.position}. {question.content}</h3><ol>{[...question.options].sort((left, right) => left.position - right.position).map((option) => <li key={option.id} className={option.isCorrect ? 'manager-correct-answer' : ''}>{option.content}{option.isCorrect && <span>Đáp án đúng</span>}</li>)}</ol>
        {editable && <div className="exam-actions"><button className="button button-secondary button-inline" aria-label={`Sửa câu hỏi ${question.position}`} disabled={locked} onClick={() => { setEditing(question); setFeedback(null) }}>Sửa câu hỏi</button><button className="button button-danger button-inline" aria-label={`Xóa câu hỏi ${question.position}`} disabled={locked} onClick={() => setConfirmation({ action: 'deleteQuestion', question })}>Xóa câu hỏi</button></div>}
      </article>)}</section>
      {editable && <ManagerQuestionForm key={`${editing?.id ?? 'new'}:${nextPosition}`} question={editing ?? undefined} nextPosition={nextPosition} usedPositions={questions.filter((question) => question.id !== editing?.id).map((question) => question.position)} busy={locked} onSave={saveQuestion} onCancel={() => setEditing(null)} />}
      {confirmation && <div className="exam-dialog-backdrop"><section ref={dialog} className="exam-panel exam-confirm" role="dialog" aria-modal="true" aria-labelledby="manager-confirm-title" onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) setConfirmation(null)
        if (event.key !== 'Tab') return
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        if (!buttons?.length) return
        const first = buttons[0]; const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}><h2 id="manager-confirm-title">{confirmLabels[confirmation.action].title}</h2><p>{confirmLabels[confirmation.action].description}</p>{confirmation.question && <p>Câu {confirmation.question.position}: {confirmation.question.content}</p>}<div className="exam-actions"><button ref={cancelButton} className="button button-secondary button-inline" disabled={busy} onClick={() => setConfirmation(null)}>Hủy</button><button className="button button-primary button-inline" disabled={busy} onClick={() => { void confirmAction() }}>{busy ? 'Đang xử lý…' : confirmLabels[confirmation.action].button}</button></div></section></div>}
    </>}
  </div>
}
