import { useState } from 'react'
import type { SubmitEvent } from 'react'
import type { ManagerQuestion, QuestionPayload } from '../api/manager-exams'

export default function ManagerQuestionForm({ question, nextPosition, usedPositions, busy, onSave, onCancel }: {
  question?: ManagerQuestion; nextPosition: number; usedPositions: number[]; busy: boolean
  onSave: (payload: QuestionPayload) => Promise<void>; onCancel: () => void
}) {
  const ordered = question ? [...question.options].sort((left, right) => left.position - right.position) : []
  const [content, setContent] = useState(question?.content ?? '')
  const [position, setPosition] = useState(String(question?.position ?? nextPosition))
  const [options, setOptions] = useState(ordered.length ? ordered.map((option) => option.content) : ['', '', '', ''])
  const [correct, setCorrect] = useState<number | null>(ordered.some((option) => option.isCorrect) ? ordered.findIndex((option) => option.isCorrect) : null)
  const [error, setError] = useState('')
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const order = Number(position)
    if (!content.trim()) { setError('Hãy nhập nội dung câu hỏi.'); return }
    if (!Number.isSafeInteger(order) || order < 1 || usedPositions.includes(order)) { setError('Vị trí phải từ 1 và không trùng câu hỏi khác.'); return }
    if (options.length < 2 || options.some((option) => !option.trim())) { setError('Mỗi câu cần ít nhất hai đáp án có nội dung.'); return }
    if (correct === null || correct < 0 || correct >= options.length) { setError('Hãy chọn đúng một đáp án đúng.'); return }
    await onSave({ content: content.trim(), position: order, options: options.map((option) => option.trim()), correctOptionIndex: correct })
  }
  function removeOption(index: number) {
    setOptions((values) => values.filter((_, current) => index !== current))
    setCorrect((value) => value === index ? null : value !== null && value > index ? value - 1 : value)
  }
  return <section className="exam-panel manager-question-editor" aria-label="Soạn câu hỏi">
    <h2>{question ? `Sửa câu hỏi ${question.position}` : 'Thêm câu hỏi'}</h2>
    <form className="manager-form" noValidate aria-busy={busy} onSubmit={(event) => { void submit(event) }}>
      <fieldset disabled={busy}>
        <label>Nội dung câu hỏi<textarea rows={3} value={content} onChange={(event) => setContent(event.target.value)} /></label>
        <label>Vị trí câu hỏi<input type="number" min={1} step={1} value={position} onChange={(event) => setPosition(event.target.value)} /></label>
        <fieldset className="manager-options"><legend>Các đáp án — chọn một đáp án đúng</legend>
          {options.map((option, index) => <div className="manager-option-row" key={index}>
            <label className="manager-option-input">Đáp án {index + 1}<input value={option} onChange={(event) => setOptions((values) => values.map((value, current) => current === index ? event.target.value : value))} /></label>
            <label className="manager-correct-choice"><input type="radio" name="manager-correct-option" checked={correct === index} onChange={() => setCorrect(index)} aria-label={`Đáp án đúng ${index + 1}`} />Đúng</label>
            <button type="button" className="manager-text-button" disabled={options.length <= 2} aria-label={`Bỏ đáp án ${index + 1}`} onClick={() => removeOption(index)}>Bỏ</button>
          </div>)}
        </fieldset>
        <button type="button" className="button button-secondary button-inline" disabled={options.length >= 20} onClick={() => setOptions((values) => [...values, ''])}>Thêm đáp án</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="exam-actions"><button type="submit" className="button button-primary button-inline">{busy ? 'Đang lưu…' : 'Lưu câu hỏi'}</button>{question && <button type="button" className="button button-secondary button-inline" onClick={onCancel}>Hủy sửa câu hỏi</button>}</div>
      </fieldset>
    </form>
  </section>
}
