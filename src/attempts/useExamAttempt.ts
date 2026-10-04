import { useEffect, useMemo, useSyncExternalStore } from 'react'
import axios from 'axios'
import { attemptsApi } from '../api/attempts'
import type { AttemptResult, AttemptSession } from '../api/attempts'
import { getApiErrorMessage } from '../api/axios'
import { clearAttemptCache, readAttemptCache, writeAttemptCache } from './attempt-storage'
import type { CachedAttempt } from './attempt-storage'

type SaveStatus = 'saved' | 'saving' | 'waiting' | 'error'
type Phase = 'loading' | 'ready' | 'error' | 'completed' | 'cancelled'

interface AttemptState {
  phase: Phase
  session: AttemptSession | null
  selections: Record<string, number>
  saveStatuses: Record<string, SaveStatus>
  pendingCount: number
  now: number
  online: boolean
  cacheAvailable: boolean
  error: string | null
  actionError: string | null
  dialog: 'submit' | 'cancel' | null
  busy: 'submit' | 'cancel' | null
  submissionPending: boolean
  completedId: string | null
  allowRetry: boolean
}

const starts = new Map<string, Promise<AttemptSession>>()

function startOnce(userId: string, examId: string) {
  const key = `${userId}:${examId}`
  const existing = starts.get(key)
  if (existing) return existing
  const promise = attemptsApi.start(examId)
  starts.set(key, promise)
  void promise.finally(() => {
    if (starts.get(key) === promise) starts.delete(key)
  }).catch(() => undefined)
  return promise
}

function responseMessage(error: unknown) {
  if (!axios.isAxiosError<{ message?: string | string[] }>(error)) return ''
  const message = error.response?.data?.message
  return Array.isArray(message) ? message.join(' ') : message ?? ''
}

function isCancelled(error: unknown) {
  return /cancelled/i.test(responseMessage(error))
}

function isNetworkError(error: unknown) {
  return axios.isAxiosError(error) && (!error.response || error.response.status >= 500)
}

function attemptError(error: unknown) {
  const messages: Record<string, string> = {
    'Exam not found': 'Không tìm thấy đề thi hoặc đề chưa được mở.',
    'Exam is closed': 'Đề thi đã đóng. Bạn hãy chọn đề khác.',
    'Exam has no questions': 'Đề thi chưa có câu hỏi.',
    'Attempt not found': 'Không tìm thấy lượt thi này trong tài khoản của bạn.',
    'Time is over for this attempt': 'Đã hết thời gian làm bài.',
    'Attempt is no longer in progress': 'Lượt thi này đã kết thúc.',
    'Attempt is no longer active': 'Lượt thi này đã kết thúc hoặc đã hết giờ.',
    'Cancelled attempts cannot be submitted': 'Lượt thi này đã được hủy.',
    'Cancelled attempts have no graded result': 'Lượt thi này đã được hủy.',
    'Only in-progress attempts can be cancelled': 'Chỉ có thể hủy bài đang làm.',
    'Attempt was already submitted or cancelled': 'Lượt thi này đã được nộp hoặc hủy.',
    'Selected option does not exist': 'Đáp án không còn hợp lệ. Vui lòng tải lại bài.',
    'Attempt changed concurrently. Please retry the operation': 'Bài đang được cập nhật ở một yêu cầu khác. Bạn hãy thử lại.',
  }
  return messages[responseMessage(error)] ?? getApiErrorMessage(error)
}

/** One queue per mounted attempt keeps rapid answer changes in their chosen order. */
class AttemptController {
  private state: AttemptState = {
    phase: 'loading', session: null, selections: {}, saveStatuses: {}, pendingCount: 0,
    now: Date.now(), online: navigator.onLine, cacheAvailable: true, error: null,
    actionError: null, dialog: null, busy: null, submissionPending: false,
    completedId: null, allowRetry: true,
  }
  private listeners = new Set<() => void>()
  private pending: Record<string, number> = {}
  private active = false
  private initialized = false
  private initializing: Promise<void> | null = null
  private flushing: Promise<void> | null = null
  private submission: Promise<void> | null = null
  private recovery: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly userId: string
  private readonly examId: string

  constructor(userId: string, examId: string) {
    this.userId = userId
    this.examId = examId
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  getSnapshot = () => this.state

  private update(change: Partial<AttemptState>) {
    this.state = { ...this.state, ...change, pendingCount: Object.keys(this.pending).length }
    this.listeners.forEach((listener) => listener())
  }

  private persist() {
    const session = this.state.session
    if (!session || this.state.phase === 'completed' || this.state.phase === 'cancelled') return
    const cacheAvailable = writeAttemptCache(this.userId, this.examId, {
      session, selections: { ...this.state.selections }, pending: { ...this.pending },
      submitting: this.state.submissionPending,
    })
    if (cacheAvailable !== this.state.cacheAvailable) this.update({ cacheAvailable })
  }

  private expired() {
    return Boolean(this.state.session && Date.now() >= Date.parse(this.state.session.attempt.deadlineAt))
  }

  mount() {
    this.active = true
    window.addEventListener('online', this.onOnline)
    window.addEventListener('offline', this.onOffline)
    window.addEventListener('beforeunload', this.beforeUnload)
    this.timer = setInterval(this.tick, 500)
    if (!this.initialized) void this.initialize()
    else if (this.state.phase === 'ready') {
      if (this.expired() || this.state.submissionPending) void this.submit(true)
      else void this.flush()
    }
  }

  unmount() {
    this.active = false
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    window.removeEventListener('online', this.onOnline)
    window.removeEventListener('offline', this.onOffline)
    window.removeEventListener('beforeunload', this.beforeUnload)
  }

  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (!Object.keys(this.pending).length && !this.state.submissionPending) return
    event.preventDefault()
    event.returnValue = ''
  }

  private onOffline = () => {
    this.update({ online: false })
  }

  private onOnline = () => {
    this.update({ online: true, actionError: null })
    if (this.state.phase === 'error' && this.state.allowRetry) void this.initialize()
    else if (this.state.submissionPending || this.expired()) void this.submit(true)
    else void this.flush()
  }

  private tick = () => {
    this.update({ now: Date.now() })
    if (this.state.phase === 'ready' && this.expired()
      && !this.state.busy && !this.state.submissionPending) void this.submit(true)
  }

  private applySession(session: AttemptSession, cache: CachedAttempt | null) {
    const selections: Record<string, number> = {}
    session.answers.forEach((answer) => { selections[answer.questionId] = answer.selectedOptionIndex })
    this.pending = {}
    if (cache?.session.attempt.id === session.attempt.id) {
      session.questions.forEach((question) => {
        const index = cache.pending[question.id]
        if (Number.isInteger(index) && index >= 0 && index < question.options.length) {
          selections[question.id] = index
          this.pending[question.id] = index
        }
      })
    }
    const saveStatuses: Record<string, SaveStatus> = {}
    Object.keys(selections).forEach((id) => { saveStatuses[id] = id in this.pending ? 'waiting' : 'saved' })
    this.update({
      session, selections, saveStatuses, phase: 'ready', error: null, actionError: null,
      now: Date.now(), submissionPending: Boolean(cache?.submitting && cache.session.attempt.id === session.attempt.id), allowRetry: true,
    })
    this.persist()
  }

  private complete(result: AttemptResult) {
    clearAttemptCache(this.userId, this.examId)
    this.pending = {}
    this.update({
      phase: 'completed', completedId: result.attempt.id, busy: null,
      submissionPending: false, dialog: null, actionError: null,
    })
  }

  private closed(error: unknown) {
    clearAttemptCache(this.userId, this.examId)
    this.pending = {}
    this.update({ phase: 'error', error: attemptError(error), busy: null,
      submissionPending: false, dialog: null, allowRetry: false })
  }

  private initialize() {
    if (this.initializing) return this.initializing
    this.initialized = true
    this.update({ phase: 'loading', error: null, online: navigator.onLine })
    const work = async () => {
      const cached = readAttemptCache(this.userId, this.examId)
      if (cached) {
        try {
          const result = await attemptsApi.result(cached.session.attempt.id)
          this.complete(result)
          return
        } catch (error: unknown) {
          if (isCancelled(error) || (axios.isAxiosError(error) && error.response?.status === 404)) {
            this.closed(error)
            return
          }
          if (isNetworkError(error)) {
            const offlineSession = { ...cached.session, answers: Object.entries(cached.selections)
              .filter(([id, index]) => cached.session.questions.some((question) => question.id === id
                && index >= 0 && index < question.options.length))
              .map(([questionId, selectedOptionIndex]) => ({ questionId, selectedOptionIndex })) }
            this.applySession(offlineSession, cached)
            if (cached.submitting || this.expired()) void this.submit(true)
            return
          }
          if (!axios.isAxiosError(error) || error.response?.status !== 409) throw error
          if (cached.submitting || Date.now() >= Date.parse(cached.session.attempt.deadlineAt)) {
            this.applySession(cached.session, cached)
            await this.submit(true)
            return
          }
        }
      }
      const session = await startOnce(this.userId, this.examId)
      this.applySession(session, cached)
      if (this.expired()) void this.submit(true)
      else if (this.active) void this.flush()
    }
    this.initializing = work().catch((error: unknown) => {
      this.update({ phase: 'error', error: attemptError(error), allowRetry: true })
    }).finally(() => { this.initializing = null })
    return this.initializing
  }

  retryLoad = () => { void this.initialize() }

  select = (questionId: string, index: number) => {
    if (this.state.phase !== 'ready' || this.state.busy || this.state.submissionPending || this.expired()) return
    const question = this.state.session?.questions.find((item) => item.id === questionId)
    if (!question || !Number.isInteger(index) || index < 0 || index >= question.options.length) return
    this.pending[questionId] = index
    this.update({
      selections: { ...this.state.selections, [questionId]: index },
      saveStatuses: { ...this.state.saveStatuses, [questionId]: this.state.online ? 'saving' : 'waiting' },
      actionError: null,
    })
    this.persist()
    if (this.state.online) void this.flush()
  }

  private flush() {
    if (this.flushing) return this.flushing
    const work = async () => {
      while (this.active && this.state.phase === 'ready' && this.state.online
        && !this.expired() && !this.state.submissionPending && this.state.busy !== 'cancel') {
        const [entry] = Object.entries(this.pending)
        if (!entry || !this.state.session) break
        const [questionId, index] = entry
        this.update({ saveStatuses: { ...this.state.saveStatuses, [questionId]: 'saving' } })
        try {
          await attemptsApi.saveAnswer(this.state.session.attempt.id, questionId, index)
          if (this.pending[questionId] === index) delete this.pending[questionId]
          this.update({
            session: { ...this.state.session,
              answers: [...this.state.session.answers.filter((answer) => answer.questionId !== questionId),
                { questionId, selectedOptionIndex: index }] },
            saveStatuses: { ...this.state.saveStatuses,
              [questionId]: questionId in this.pending ? 'waiting' : 'saved' },
          })
          this.persist()
        } catch (error: unknown) {
          this.update({ saveStatuses: { ...this.state.saveStatuses, [questionId]: 'error' },
            actionError: attemptError(error) })
          this.persist()
          if (axios.isAxiosError(error) && error.response?.status === 409) void this.recoverResult(error)
          break
        }
      }
    }
    this.flushing = work().finally(() => { this.flushing = null })
    return this.flushing
  }

  retrySave = () => {
    this.update({ online: navigator.onLine, actionError: null })
    if (this.expired() || this.state.submissionPending) void this.submit(true)
    else void this.flush()
  }

  private recoverResult(originalError: unknown) {
    if (this.recovery) return this.recovery
    const session = this.state.session
    if (!session) return Promise.resolve()
    this.recovery = attemptsApi.result(session.attempt.id).then((result) => {
      this.complete(result)
    }).catch((error: unknown) => {
      if (isCancelled(error)) this.closed(error)
      else if (this.expired()) void this.submit(true)
      else this.update({ actionError: attemptError(originalError) })
    }).finally(() => { this.recovery = null })
    return this.recovery
  }

  openSubmit = () => {
    if (this.state.phase !== 'ready' || this.state.busy || this.state.submissionPending) return
    if (this.expired()) void this.submit(true)
    else this.update({ dialog: 'submit', actionError: null })
  }

  openCancel = () => {
    if (this.state.phase !== 'ready' || this.state.busy || this.state.submissionPending) return
    if (this.expired()) void this.submit(true)
    else this.update({ dialog: 'cancel', actionError: null })
  }

  closeDialog = () => { if (!this.state.busy) this.update({ dialog: null }) }
  confirmSubmit = () => { void this.submit(false) }
  retrySubmit = () => { void this.submit(true) }

  private submit(deadlineOrRecovery: boolean) {
    if (this.submission) return this.submission
    if (this.state.phase !== 'ready' || !this.state.session || this.state.busy === 'cancel') return Promise.resolve()
    const attemptId = this.state.session.attempt.id
    this.update({ busy: 'submit', dialog: null, actionError: null, online: navigator.onLine })
    const work = async () => {
      if (!deadlineOrRecovery && !this.expired() && !this.state.submissionPending) {
        await this.flush()
        if (Object.keys(this.pending).length && !this.expired()) {
          this.update({ busy: null,
            actionError: 'Có đáp án chưa lưu. Hãy thử lưu lại trước khi nộp bài.' })
          return
        }
      }
      const recovering = this.state.submissionPending
      this.update({ submissionPending: true })
      this.persist()
      if (!navigator.onLine) {
        this.update({ busy: null, actionError: 'Mất kết nối. Bài sẽ được nộp khi kết nối trở lại.' })
        return
      }
      if (recovering) {
        try {
          this.complete(await attemptsApi.result(attemptId))
          return
        } catch (error: unknown) {
          if (isCancelled(error)) { this.closed(error); return }
          if (!axios.isAxiosError(error) || error.response?.status !== 409) throw error
        }
      }
      try {
        this.complete(await attemptsApi.submit(attemptId))
      } catch (error: unknown) {
        if (isCancelled(error)) { this.closed(error); return }
        // A lost response can follow a successful submit. Fetch its result before retrying.
        try {
          this.complete(await attemptsApi.result(attemptId))
        } catch (resultError: unknown) {
          if (isCancelled(resultError)) { this.closed(resultError); return }
          if (axios.isAxiosError(resultError) && resultError.response?.status === 409 && !this.expired()) {
            this.update({ submissionPending: false })
            this.persist()
          }
          throw error
        }
      }
    }
    this.submission = work().catch((error: unknown) => {
      this.update({ busy: null, actionError: attemptError(error) })
    }).finally(() => {
      this.submission = null
      if (this.state.phase === 'ready' && this.state.busy === 'submit') this.update({ busy: null })
    })
    return this.submission
  }

  confirmCancel = async () => {
    if (this.state.phase !== 'ready' || !this.state.session || this.state.busy || this.state.submissionPending) return
    if (this.expired()) { void this.submit(true); return }
    const attemptId = this.state.session.attempt.id
    this.update({ busy: 'cancel', actionError: null })
    try {
      await this.flushing
      await attemptsApi.cancel(attemptId)
      clearAttemptCache(this.userId, this.examId)
      this.pending = {}
      this.update({ phase: 'cancelled', busy: null, dialog: null })
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        this.update({ busy: null, dialog: null })
        await this.recoverResult(error)
        return
      }
      // DELETE can also complete before its response is lost. Check only this user's history.
      try {
        const history = await attemptsApi.history({ examId: this.examId, status: 'CANCELLED', limit: 50 })
        if (history.items.some((item) => item.id === attemptId)) {
          clearAttemptCache(this.userId, this.examId)
          this.pending = {}
          this.update({ phase: 'cancelled', busy: null, dialog: null })
          return
        }
      } catch {
        // Keep the attempt recoverable when its cancellation cannot yet be confirmed.
      }
      this.update({ busy: null, dialog: null, actionError: attemptError(error) })
    }
  }
}

export function useExamAttempt(userId: string, examId: string) {
  const controller = useMemo(() => new AttemptController(userId, examId), [userId, examId])
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  useEffect(() => {
    controller.mount()
    return () => controller.unmount()
  }, [controller])
  return { state, controller }
}
