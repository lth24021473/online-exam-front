import axios from 'axios'
import { managerExamsApi } from './manager-exams'
import type { ExamPayload, ManagerExam, ManagerQuestion, QuestionPayload } from './manager-exams'

interface CreationPayload { exam: ExamPayload; questions: QuestionPayload[] }
interface DraftSession {
  id: string
  metadata: ExamPayload
  pendingMetadata?: ExamPayload
  questions: Map<string, ManagerQuestion>
  pendingQuestions: Map<number, QuestionPayload>
  deleting: Set<string>
}

function metadata(exam: ManagerExam): ExamPayload {
  return { title: exam.title, description: exam.description ?? '', instructions: exam.instructions ?? '', durationMinutes: exam.durationMinutes }
}
function questionPayload(question: ManagerQuestion): QuestionPayload {
  const options = [...question.options].sort((left, right) => left.position - right.position)
  return { content: question.content, position: question.position, options: options.map((option) => option.content), correctOptionIndex: options.findIndex((option) => option.isCorrect) }
}
function equal(left: ExamPayload | QuestionPayload, right: ExamPayload | QuestionPayload) {
  return JSON.stringify(left) === JSON.stringify(right)
}

// The API saves metadata and questions separately. Keep the draft identity across
// retries and reconcile only writes belonging to this creation session.
export class ManagerExamCreation {
  private draft: DraftSession | null = null
  blocked = false
  get examId() { return this.draft?.id ?? null }

  async save(payload: CreationPayload, isActive: () => boolean): Promise<string> {
    const checkActive = () => { if (!isActive()) throw new Error('Phiên tạo đề đã kết thúc.') }
    const conflict = () => {
      this.blocked = true
      throw new Error('Bản nháp đã được thay đổi ở nơi khác. Hãy mở đề đã lưu để kiểm tra và tiếp tục chỉnh sửa.')
    }
    checkActive()
    if (this.blocked) throw new Error('Hãy kiểm tra đề đã lưu trước khi tạo lại.')

    if (!this.draft) {
      try {
        const exam = await managerExamsApi.create(payload.exam)
        if (typeof exam.id !== 'string' || !/^[a-f\d]{24}$/i.test(exam.id) || exam.status !== 'DRAFT') {
          throw new Error('Không xác định được đề vừa tạo.')
        }
        this.draft = { id: exam.id, metadata: metadata(exam), questions: new Map(), pendingQuestions: new Map(), deleting: new Set() }
      } catch (error) {
        // A missing response can still mean the server created the draft. There
        // is no idempotency key or reliable way to identify it by title.
        if (!axios.isAxiosError(error) || !error.response || error.response.status >= 500) {
          this.blocked = true
          throw new Error('Chưa thể xác nhận đề thi đã được tạo hay chưa. Hãy kiểm tra danh sách đề thi trước khi tạo lại.', { cause: error })
        }
        throw error
      }
    } else {
      const exam = await managerExamsApi.detail(this.draft.id)
      checkActive()
      const session = this.draft
      if (exam.status !== 'DRAFT') conflict()
      const currentMetadata = metadata(exam)
      if (!equal(currentMetadata, session.metadata) && (!session.pendingMetadata || !equal(currentMetadata, session.pendingMetadata))) conflict()
      const remote = new Map((exam.questions ?? []).map((question) => [question.id, question]))
      for (const question of remote.values()) {
        const known = session.questions.get(question.id)
        const pending = session.pendingQuestions.get(question.position)
        if (!(known && equal(questionPayload(question), questionPayload(known))) && !(pending && equal(questionPayload(question), pending))) conflict()
      }
      for (const id of session.questions.keys()) {
        if (!remote.has(id) && !session.deleting.has(id)) conflict()
      }
      session.metadata = currentMetadata
      session.questions = remote
      session.pendingQuestions.clear()
      session.deleting.clear()
    }

    const session = this.draft
    checkActive()
    if (!equal(session.metadata, payload.exam)) {
      session.pendingMetadata = payload.exam
      await managerExamsApi.update(session.id, payload.exam)
      session.metadata = payload.exam
      session.pendingMetadata = undefined
    }
    for (const desired of payload.questions) {
      checkActive()
      const existing = [...session.questions.values()].find((question) => question.position === desired.position)
      if (existing && equal(questionPayload(existing), desired)) continue
      session.pendingQuestions.set(desired.position, desired)
      const saved = existing
        ? await managerExamsApi.updateQuestion(session.id, existing.id, desired)
        : await managerExamsApi.createQuestion(session.id, desired)
      session.questions.set(saved.id, saved)
      session.pendingQuestions.delete(desired.position)
    }
    for (const question of session.questions.values()) {
      if (payload.questions.some((desired) => desired.position === question.position)) continue
      checkActive()
      session.deleting.add(question.id)
      await managerExamsApi.removeQuestion(session.id, question.id)
      session.questions.delete(question.id)
      session.deleting.delete(question.id)
    }
    checkActive()
    return session.id
  }
}
