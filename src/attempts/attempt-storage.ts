import type { AttemptSession } from '../api/attempts'

export interface CachedAttempt {
  session: AttemptSession
  selections: Record<string, number>
  pending: Record<string, number>
  submitting: boolean
}

const memory = new Map<string, CachedAttempt>()

function cacheKey(userId: string, examId: string) {
  return `online-exam.attempt:${userId}:${examId}`
}

function validSelection(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every((index) => typeof index === 'number' && Number.isInteger(index) && index >= 0)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validSession(value: unknown, examId: string): value is AttemptSession {
  if (!isRecord(value) || !isRecord(value.attempt) || !isRecord(value.exam)) return false
  const { attempt, exam } = value
  if (attempt.examId !== examId || typeof attempt.id !== 'string' || !attempt.id
    || attempt.status !== 'IN_PROGRESS'
    || typeof attempt.startedAt !== 'string' || !Number.isFinite(Date.parse(attempt.startedAt))
    || typeof attempt.deadlineAt !== 'string' || !Number.isFinite(Date.parse(attempt.deadlineAt))
    || typeof attempt.totalQuestions !== 'number' || !Number.isInteger(attempt.totalQuestions)
    || exam.id !== examId || typeof exam.title !== 'string'
    || typeof exam.durationMinutes !== 'number' || !Number.isFinite(exam.durationMinutes)
    || (exam.instructions !== null && typeof exam.instructions !== 'string')
    || !Array.isArray(value.questions) || !Array.isArray(value.answers)) return false
  return value.questions.every((question: unknown) => isRecord(question)
    && typeof question.id === 'string' && typeof question.content === 'string'
    && typeof question.position === 'number' && Number.isInteger(question.position)
    && Array.isArray(question.options) && question.options.every((option: unknown) => typeof option === 'string'))
    && value.answers.every((answer: unknown) => isRecord(answer)
      && typeof answer.questionId === 'string' && typeof answer.selectedOptionIndex === 'number'
      && Number.isInteger(answer.selectedOptionIndex) && answer.selectedOptionIndex >= 0)
}

export function readAttemptCache(userId: string, examId: string): CachedAttempt | null {
  const key = cacheKey(userId, examId)
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return memory.get(key) ?? null
    const cache: unknown = JSON.parse(raw)
    if (!cache || typeof cache !== 'object') return null
    const candidate = cache as Partial<CachedAttempt>
    if (!validSession(candidate.session, examId)
      || !validSelection(candidate.selections) || !validSelection(candidate.pending)) return null
    return { ...candidate, submitting: Boolean(candidate.submitting) } as CachedAttempt
  } catch {
    return memory.get(key) ?? null
  }
}

export function writeAttemptCache(userId: string, examId: string, cache: CachedAttempt): boolean {
  const key = cacheKey(userId, examId)
  memory.set(key, cache)
  try {
    localStorage.setItem(key, JSON.stringify(cache))
    return true
  } catch {
    return false
  }
}

export function clearAttemptCache(userId: string, examId: string) {
  const key = cacheKey(userId, examId)
  memory.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    // The in-memory fallback remains available when browser storage is blocked.
  }
}
