import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, SubmitEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ExamPayload, QuestionPayload } from '../api/manager-exams'
import './ManagerCreateExamForm.css'

export interface ManagerCreateExamPayload {
  exam: ExamPayload
  questions: QuestionPayload[]
}

interface DraftOption { id: number; content: string }
interface DraftQuestion {
  id: number
  content: string
  options: DraftOption[]
  correctOptionId: number | null
}
interface ValidationError { fieldId: string; message: string }

export default function ManagerCreateExamForm({ busy, error, creationBlocked = false, onCreate }: {
  busy: boolean
  error: string
  creationBlocked?: boolean
  onCreate: (payload: ManagerCreateExamPayload) => Promise<void>
}) {
  const formId = useId()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [minutes, setMinutes] = useState('15')
  const [questions, setQuestions] = useState<DraftQuestion[]>([{
    id: 1, content: '', correctOptionId: null,
    options: [2, 3, 4, 5].map((id) => ({ id, content: '' })),
  }])
  const [validation, setValidation] = useState<ValidationError | null>(null)
  const [submissionError, setSubmissionError] = useState('')
  const [confirmation, setConfirmation] = useState<ManagerCreateExamPayload | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nextId = useRef(6)
  const submitLock = useRef(false)
  const dialog = useRef<HTMLElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const locked = busy || submitting
  const validationId = `${formId}-validation`
  const titleId = `${formId}-title`
  const durationId = `${formId}-duration`

  useEffect(() => {
    if (!confirmation) return
    const trigger = createButton.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelButton.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (trigger?.isConnected) trigger.focus()
    }
  }, [confirmation])

  function editQuestion(id: number, change: (question: DraftQuestion) => DraftQuestion) {
    setQuestions((current) => current.map((question) => question.id === id ? change(question) : question))
    setValidation(null)
    setSubmissionError('')
  }

  function addQuestion() {
    const id = nextId.current++
    const options = Array.from({ length: 4 }, () => ({ id: nextId.current++, content: '' }))
    setQuestions((current) => [...current, { id, content: '', options, correctOptionId: null }])
    setValidation(null)
    window.requestAnimationFrame(() => document.getElementById(`${formId}-question-${id}`)?.focus())
  }

  function removeOption(questionId: number, optionId: number) {
    editQuestion(questionId, (question) => question.options.length <= 2 ? question : {
      ...question,
      options: question.options.filter((option) => option.id !== optionId),
      correctOptionId: question.correctOptionId === optionId ? null : question.correctOptionId,
    })
  }

  function fail(fieldId: string, message: string) {
    setValidation({ fieldId, message })
    document.getElementById(fieldId)?.focus()
  }

  function requestConfirmation(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked || creationBlocked || submitLock.current || confirmation) return
    setValidation(null)
    setSubmissionError('')
    if (!title.trim() || title.trim().length > 200) {
      fail(titleId, 'Tên đề thi cần từ 1 đến 200 ký tự.'); return
    }
    const durationMinutes = Number(minutes)
    if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1) {
      fail(durationId, 'Thời gian làm bài phải là số nguyên từ 1 phút.'); return
    }
    if (questions.length === 0) {
      fail(`${formId}-add-question`, 'Hãy thêm ít nhất một câu hỏi.'); return
    }
    const payload: QuestionPayload[] = []
    for (const [index, question] of questions.entries()) {
      if (!question.content.trim()) {
        fail(`${formId}-question-${question.id}`, `Câu hỏi ${index + 1}: Hãy nhập nội dung câu hỏi.`); return
      }
      if (question.options.length < 2 || question.options.length > 20) {
        fail(`${formId}-question-${question.id}`, `Câu hỏi ${index + 1}: Cần từ 2 đến 20 đáp án.`); return
      }
      const emptyOption = question.options.find((option) => !option.content.trim())
      if (emptyOption) {
        fail(`${formId}-option-${emptyOption.id}`, `Câu hỏi ${index + 1}: Hãy nhập nội dung cho tất cả đáp án.`); return
      }
      const correctOptionIndex = question.options.findIndex((option) => option.id === question.correctOptionId)
      if (correctOptionIndex < 0) {
        fail(`${formId}-correct-${question.options[0].id}`, `Câu hỏi ${index + 1}: Hãy chọn một đáp án đúng.`); return
      }
      payload.push({
        content: question.content.trim(), position: index + 1,
        options: question.options.map((option) => option.content.trim()), correctOptionIndex,
      })
    }
    setConfirmation({
      exam: { title: title.trim(), description: description.trim(), instructions: '', durationMinutes },
      questions: payload,
    })
  }

  async function confirmCreate() {
    if (!confirmation || locked || creationBlocked || submitLock.current) return
    submitLock.current = true
    setSubmitting(true)
    try { await onCreate(confirmation) }
    catch { setSubmissionError('Không thể tạo đề thi. Vui lòng thử lại.') }
    finally {
      submitLock.current = false
      setSubmitting(false)
      setConfirmation(null)
    }
  }

  function handleDialogKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!locked) setConfirmation(null)
      return
    }
    if (event.key !== 'Tab') return
    const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    if (!buttons?.length) { event.preventDefault(); dialog.current?.focus(); return }
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) {
      event.preventDefault(); first.focus()
    }
  }

  function fieldError(fieldId: string) {
    return { 'aria-invalid': validation?.fieldId === fieldId || undefined, 'aria-describedby': validation?.fieldId === fieldId ? validationId : undefined }
  }

  return <>
    <form className="manager-form manager-create-form" aria-label="Tạo đề thi" aria-busy={locked} noValidate onSubmit={requestConfirmation} inert={Boolean(confirmation)}>
      <fieldset disabled={locked || Boolean(confirmation)}>
        <section className="exam-panel manager-create-metadata" aria-labelledby={`${formId}-metadata-title`}>
          <h2 id={`${formId}-metadata-title`}>Thông tin đề thi</h2>
          <div className="manager-create-fields">
            <div className="manager-create-field"><label htmlFor={titleId}>Tên đề thi</label><input id={titleId} required maxLength={200} value={title} {...fieldError(titleId)} onChange={(event) => { setTitle(event.target.value); setValidation(null) }} /></div>
            <div className="manager-create-field"><label htmlFor={`${formId}-description`}>Mô tả</label><textarea id={`${formId}-description`} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
            <div className="manager-create-field"><label htmlFor={durationId}>Thời gian làm bài (phút)</label><input id={durationId} type="number" min={1} step={1} required value={minutes} {...fieldError(durationId)} onChange={(event) => { setMinutes(event.target.value); setValidation(null) }} /></div>
          </div>
        </section>

        <section className="manager-create-questions" aria-labelledby={`${formId}-questions-title`}>
          <div className="manager-create-section-heading"><h2 id={`${formId}-questions-title`}>Câu hỏi ({questions.length})</h2><p>Nhập câu hỏi, các đáp án và tích chọn đáp án đúng.</p></div>
          {questions.map((question, index) => <section className="exam-panel manager-create-question" key={question.id} role="group" aria-labelledby={`${formId}-question-heading-${question.id}`}>
            <div className="manager-create-question-heading">
              <h3 id={`${formId}-question-heading-${question.id}`}>Câu hỏi {index + 1}</h3>
              <button type="button" className="manager-text-button manager-create-remove" disabled={questions.length <= 1} aria-label={`Xóa câu hỏi ${index + 1}`} onClick={() => { setQuestions((current) => current.filter((item) => item.id !== question.id)); setValidation(null) }}><Trash2 size={16} aria-hidden="true" />Xóa câu hỏi</button>
            </div>
            <div className="manager-create-field"><label htmlFor={`${formId}-question-${question.id}`}>Nội dung câu hỏi</label><textarea id={`${formId}-question-${question.id}`} required rows={3} value={question.content} {...fieldError(`${formId}-question-${question.id}`)} onChange={(event) => editQuestion(question.id, (item) => ({ ...item, content: event.target.value }))} /></div>
            <fieldset className="manager-options"><legend>Các đáp án — chọn một đáp án đúng</legend>
              {question.options.map((option, optionIndex) => <div className={`manager-option-row${question.correctOptionId === option.id ? ' manager-create-option-correct' : ''}`} key={option.id}>
                <div className="manager-option-input manager-create-field"><label htmlFor={`${formId}-option-${option.id}`}>Đáp án {optionIndex + 1}</label><input id={`${formId}-option-${option.id}`} required value={option.content} {...fieldError(`${formId}-option-${option.id}`)} onChange={(event) => editQuestion(question.id, (item) => ({ ...item, options: item.options.map((answer) => answer.id === option.id ? { ...answer, content: event.target.value } : answer) }))} /></div>
                <label className="manager-correct-choice"><input id={`${formId}-correct-${option.id}`} type="radio" name={`${formId}-correct-question-${question.id}`} checked={question.correctOptionId === option.id} aria-label={`Đáp án đúng ${optionIndex + 1}`} {...fieldError(`${formId}-correct-${option.id}`)} onChange={() => editQuestion(question.id, (item) => ({ ...item, correctOptionId: option.id }))} />Đúng</label>
                <button type="button" className="manager-text-button" disabled={question.options.length <= 2} aria-label={`Bỏ đáp án ${optionIndex + 1}`} onClick={() => removeOption(question.id, option.id)}>Bỏ</button>
              </div>)}
            </fieldset>
            <button type="button" className="button button-secondary button-inline manager-create-add-option" disabled={question.options.length >= 20} onClick={() => { const id = nextId.current++; editQuestion(question.id, (item) => item.options.length >= 20 ? item : { ...item, options: [...item.options, { id, content: '' }] }) }}><Plus size={16} aria-hidden="true" />Thêm đáp án</button>
          </section>)}
          <button id={`${formId}-add-question`} type="button" className="button button-secondary button-inline manager-create-add-question" onClick={addQuestion}><Plus size={18} aria-hidden="true" />Thêm câu hỏi</button>
        </section>

        <div className="manager-create-footer">
          {validation && <p id={validationId} className="form-error" role="alert">{validation.message}</p>}
          {(error || submissionError) && <p className="form-error" role="alert">{error || submissionError}</p>}
          <button ref={createButton} type="submit" className="button button-primary button-inline" disabled={creationBlocked}>{locked ? 'Đang tạo đề thi…' : 'Tạo đề thi'}</button>
        </div>
      </fieldset>
    </form>
    {confirmation && <div className="exam-dialog-backdrop manager-create-dialog-backdrop">
      <section ref={dialog} className="exam-panel exam-confirm manager-create-confirm" role="dialog" aria-modal="true" aria-labelledby={`${formId}-confirm-title`} aria-busy={locked} tabIndex={-1} onKeyDown={handleDialogKey}>
        <h2 id={`${formId}-confirm-title`}>Bạn chắc chắn muốn tạo đề thi?</h2>
        <div className="exam-actions">
          <button ref={cancelButton} type="button" className="button button-secondary button-inline" disabled={locked} onClick={() => setConfirmation(null)}>Hủy</button>
          <button type="button" className="button button-primary button-inline" disabled={locked} onClick={() => { void confirmCreate() }}>{locked ? 'Đang tạo…' : 'Xác nhận'}</button>
        </div>
      </section>
    </div>}
  </>
}
