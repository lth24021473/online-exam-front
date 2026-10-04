import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, CloudUpload, LoaderCircle, Send, WifiOff, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useExamAttempt } from '../attempts/useExamAttempt'

function formatRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function AttemptWorkspace({ userId, examId }: { userId: string; examId: string }) {
  const { state, controller } = useExamAttempt(userId, examId)
  const navigate = useNavigate()
  const [questionIndex, setQuestionIndex] = useState(0)
  const dialogRef = useRef<HTMLElement>(null)
  const dialogTriggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (state.completedId) navigate(`/attempts/${state.completedId}/result`, { replace: true })
    else if (state.phase === 'cancelled') navigate('/history', { replace: true, state: { cancelled: true } })
  }, [state.completedId, state.phase, navigate])

  useEffect(() => {
    if (!state.dialog) return
    const previousFocus = dialogTriggerRef.current ?? document.activeElement
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') controller.closeDialog()
      if (event.key !== 'Tab') return
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      if (!buttons?.length) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [state.dialog, controller])

  if (state.phase === 'loading') {
    return <section className="exam-panel exam-loading" role="status"><LoaderCircle className="exam-spin" size={28} aria-hidden="true" /><p>Đang mở bài thi…</p></section>
  }
  if (state.phase === 'error') {
    return <section className="exam-panel exam-empty"><AlertCircle size={32} aria-hidden="true" /><h1>Chưa thể mở bài thi</h1><p role="alert">{state.error}</p><div className="exam-actions">{state.allowRetry && <button className="button button-primary button-inline" onClick={controller.retryLoad}>Thử lại</button>}<Link className="button button-inline exam-button-secondary" to="/exams">Về danh sách đề</Link></div></section>
  }
  if (!state.session || state.phase === 'completed' || state.phase === 'cancelled') {
    return <section className="exam-panel exam-loading" role="status">Đang chuyển trang…</section>
  }

  const { session } = state
  const questions = [...session.questions].sort((a, b) => a.position - b.position)
  const current = questions[Math.min(questionIndex, Math.max(questions.length - 1, 0))]
  const remaining = Date.parse(session.attempt.deadlineAt) - state.now
  const expired = remaining <= 0
  const locked = Boolean(state.busy || state.submissionPending || expired)
  const answeredCount = questions.filter((question) => state.selections[question.id] !== undefined).length
  const saving = Object.values(state.saveStatuses).some((status) => status === 'saving')
  const saveErrors = Object.values(state.saveStatuses).some((status) => status === 'error')
  const saveText = saving ? 'Đang lưu đáp án…' : state.pendingCount ? 'Có đáp án chưa lưu' : 'Đã lưu tất cả đáp án'

  return (
    <div className="exam-page exam-taking">
      <Link className="exam-back" to={`/exams/${examId}`}><ArrowLeft size={17} aria-hidden="true" /> Chi tiết đề thi</Link>
      <section className="exam-panel exam-taking-header">
        <div className="exam-heading"><span className="exam-eyebrow">{session.resumed ? 'Tiếp tục lượt thi' : 'Bài thi của bạn'}</span><h1>{session.exam.title}</h1><p className="exam-muted">{session.exam.durationMinutes} phút · {session.attempt.totalQuestions} câu hỏi</p></div>
        <div className={`exam-timer${remaining <= 60_000 ? ' exam-timer-urgent' : ''}`}><Clock3 size={22} aria-hidden="true" /><div><span>Thời gian còn lại</span><time aria-label="Thời gian còn lại" dateTime={`PT${Math.max(0, Math.ceil(remaining / 1000))}S`}>{formatRemaining(remaining)}</time></div></div>
      </section>
      {!state.online && <div className="exam-alert exam-alert-warning" role="status"><WifiOff size={20} aria-hidden="true" /><span>{expired || state.submissionPending ? 'Mất kết nối. Bài sẽ được kiểm tra và nộp khi kết nối trở lại.' : 'Mất kết nối. Bạn vẫn có thể chọn đáp án; bài sẽ tự lưu khi kết nối trở lại.'}</span></div>}
      {!state.cacheAvailable && state.pendingCount > 0 && <div className="exam-alert exam-alert-warning" role="status">Thiết bị không cho phép lưu tạm đáp án. Hãy giữ trang này mở cho đến khi đáp án được lưu.</div>}
      {expired && <div className="exam-alert exam-alert-warning" role="status"><Clock3 size={20} aria-hidden="true" /><span>Đã hết thời gian. {state.busy === 'submit' ? 'Đang nộp bài…' : 'Bài sẽ được nộp ngay khi kết nối ổn định.'}{state.pendingCount > 0 && ' Đáp án chưa gửi kịp sẽ không được tính.'}</span></div>}
      {state.actionError && <div className="exam-alert exam-alert-error" role="alert"><AlertCircle size={20} aria-hidden="true" /><span>{state.actionError}</span></div>}
      {session.exam.instructions && <details className="exam-panel exam-instructions"><summary>Hướng dẫn làm bài</summary><p>{session.exam.instructions}</p></details>}
      <div className="exam-workspace">
        <section className="exam-panel exam-question" aria-labelledby="current-question-title">
          {current ? <>
            <div className="exam-question-top"><span className="exam-eyebrow">Câu {Math.min(questionIndex + 1, questions.length)} / {questions.length}</span><span className={`exam-question-save exam-save-${state.saveStatuses[current.id] ?? 'saved'}`} role="status">{state.selections[current.id] === undefined ? 'Chưa chọn đáp án' : state.saveStatuses[current.id] === 'saved' ? 'Đã lưu' : state.saveStatuses[current.id] === 'saving' ? 'Đang lưu…' : state.saveStatuses[current.id] === 'error' ? 'Lưu lỗi' : 'Chờ lưu'}</span></div>
            <fieldset className="exam-options" disabled={locked}>
              <legend id="current-question-title">Câu {Math.min(questionIndex + 1, questions.length)}. {current.content}</legend>
              {current.options.map((option, index) => <label key={`${current.id}:${index}`} className={`exam-option${state.selections[current.id] === index ? ' exam-option-selected' : ''}`}><input type="radio" name={`question-${current.id}`} value={index} checked={state.selections[current.id] === index} onChange={() => controller.select(current.id, index)} /><span className="exam-option-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span><span><span className="sr-only">{String.fromCharCode(65 + index)}. </span>{option}</span></label>)}
            </fieldset>
            <div className="exam-question-pagination"><button className="button button-inline exam-button-secondary" disabled={questionIndex <= 0} onClick={() => setQuestionIndex((index) => Math.max(0, index - 1))}>Câu trước</button><button className="button button-primary button-inline" disabled={questionIndex >= questions.length - 1} onClick={() => setQuestionIndex((index) => Math.min(questions.length - 1, index + 1))}>Câu tiếp theo</button></div>
          </> : <p>Đề thi chưa có câu hỏi.</p>}
        </section>
        <aside className="exam-panel exam-attempt-sidebar" aria-label="Tiến độ làm bài">
          <h2>Tiến độ làm bài</h2><p className="exam-muted">Đã chọn {answeredCount}/{questions.length} câu</p>
          <progress className="exam-progress" value={answeredCount} max={Math.max(1, questions.length)} aria-label="Số câu đã chọn" />
          <nav className="exam-question-nav" aria-label="Chọn câu hỏi">{questions.map((question, index) => <button key={question.id} className={`${index === questionIndex ? 'is-current ' : ''}${state.selections[question.id] !== undefined ? 'is-answered' : ''}`} aria-label={`Câu ${index + 1}${state.selections[question.id] !== undefined ? ', đã chọn' : ', chưa chọn'}`} aria-current={index === questionIndex ? 'step' : undefined} onClick={() => setQuestionIndex(index)}>{index + 1}</button>)}</nav>
          <p className="exam-save-summary" role="status">{saving ? <CloudUpload size={18} aria-hidden="true" /> : state.pendingCount ? <AlertCircle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}{saveText}</p>
          {(saveErrors || (state.pendingCount > 0 && !saving)) && !expired && !state.submissionPending && <button className="exam-text-button" onClick={controller.retrySave} disabled={Boolean(state.busy)}>Thử lưu lại</button>}
          {state.pendingCount > 0 && <p className="exam-muted exam-small">Đáp án chưa lưu được giữ tạm trên thiết bị này. Khi hết giờ, bài được chấm theo đáp án máy chủ đã nhận.</p>}
          <div className="exam-submit-actions">
            {state.submissionPending || expired ? <button className="button button-primary button-inline" onClick={controller.retrySubmit} disabled={Boolean(state.busy)}>{state.busy === 'submit' ? 'Đang nộp bài…' : 'Kiểm tra và nộp lại'}</button> : <button className="button button-primary button-inline" onClick={(event) => { dialogTriggerRef.current = event.currentTarget; controller.openSubmit() }} disabled={Boolean(state.busy)}><Send size={17} aria-hidden="true" /> Nộp bài</button>}
            <button className="button button-inline exam-button-secondary" onClick={(event) => { dialogTriggerRef.current = event.currentTarget; controller.openCancel() }} disabled={locked}><X size={17} aria-hidden="true" /> Hủy bài</button>
          </div>
        </aside>
      </div>
      {state.dialog && <div className="exam-dialog-backdrop"><section ref={dialogRef} className="exam-panel exam-confirm" role="dialog" aria-modal="true" aria-labelledby="attempt-confirm-title"><h2 id="attempt-confirm-title">{state.dialog === 'submit' ? 'Nộp bài thi?' : 'Hủy lượt thi?'}</h2><p>{state.dialog === 'submit' ? `Bạn đã chọn ${answeredCount}/${questions.length} câu. Sau khi nộp, bạn không thể đổi đáp án.` : 'Lượt thi này sẽ kết thúc và không được chấm điểm. Bạn có thể bắt đầu lượt mới sau đó.'}</p>{state.dialog === 'submit' && state.pendingCount > 0 && <p className="exam-muted">Hệ thống sẽ lưu {state.pendingCount} đáp án đang chờ trước khi nộp.</p>}<div className="exam-actions"><button autoFocus className="button button-inline exam-button-secondary" onClick={controller.closeDialog} disabled={Boolean(state.busy)}>Tiếp tục làm bài</button><button className="button button-primary button-inline" onClick={state.dialog === 'submit' ? controller.confirmSubmit : controller.confirmCancel} disabled={Boolean(state.busy)}>{state.busy === 'cancel' ? 'Đang hủy bài…' : state.dialog === 'submit' ? 'Xác nhận nộp bài' : 'Xác nhận hủy bài'}</button></div></section></div>}
    </div>
  )
}

export default function TakeExamPage() {
  const { examId } = useParams()
  const { user } = useAuth()
  if (!user || !examId) return null
  return <AttemptWorkspace key={`${user.id}:${examId}`} userId={user.id} examId={examId} />
}
