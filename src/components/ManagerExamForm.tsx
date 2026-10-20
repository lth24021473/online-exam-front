import { useState } from 'react'
import type { SubmitEvent } from 'react'
import type { ExamPayload } from '../api/manager-exams'

export default function ManagerExamForm({ initial, busy, readOnly = false, submitLabel, onSubmit }: {
  initial?: Partial<ExamPayload>; busy: boolean; readOnly?: boolean; submitLabel: string; onSubmit: (payload: ExamPayload) => Promise<void>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [minutes, setMinutes] = useState(String(initial?.durationMinutes ?? 15))
  const [error, setError] = useState('')
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const durationMinutes = Number(minutes)
    if (!title.trim() || title.trim().length > 200) { setError('Tên đề thi cần từ 1 đến 200 ký tự.'); return }
    if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1) { setError('Thời gian phải là số nguyên từ 1 phút.'); return }
    await onSubmit({ title: title.trim(), description: description.trim(), instructions: instructions.trim(), durationMinutes })
  }
  return <form noValidate className="manager-form manager-metadata-form" aria-label="Thông tin đề thi" aria-busy={busy} onSubmit={(event) => { void submit(event) }}>
    <fieldset disabled={busy || readOnly}>
      <label>Tên đề thi<input value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Thời gian (phút)<input type="number" min={1} step={1} required value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
      <label>Mô tả<textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>Hướng dẫn<textarea rows={2} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!readOnly && <button className="button button-primary button-inline" type="submit">{busy ? 'Đang lưu…' : submitLabel}</button>}
    </fieldset>
  </form>
}
