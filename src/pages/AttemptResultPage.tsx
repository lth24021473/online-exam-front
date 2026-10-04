import axios from 'axios'
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, Trophy, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { attemptsApi, getAttemptErrorMessage } from '../api/attempts'
import { clearAttemptCache, readAttemptCache } from '../attempts/attempt-storage'
import { useAuth } from '../auth/useAuth'

type Result = Awaited<ReturnType<typeof attemptsApi.result>>
type ResultState =
  | { key: string; kind: 'ready'; result: Result }
  | { key: string; kind: 'error'; message: string; canContinue: boolean }

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })

function formatDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(value))
}

function getResultError(error: unknown): { message: string; canContinue: boolean } {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    if (error.response?.data?.message === 'Attempt has not been submitted yet') {
      return { message: 'Bài thi chưa được nộp. Bạn có thể tiếp tục bài từ lịch sử làm bài.', canContinue: true }
    }
    if (error.response?.data?.message === 'Cancelled attempts have no graded result') {
      return { message: 'Bài thi đã được hủy nên không có kết quả chấm điểm.', canContinue: false }
    }
    if (error.response?.status === 404) {
      return { message: 'Không tìm thấy bài thi của bạn.', canContinue: false }
    }
    if (error.response?.status === 409) {
      return { message: 'Bài thi chưa có kết quả. Hãy kiểm tra trạng thái trong lịch sử làm bài.', canContinue: false }
    }
  }
  return { message: getAttemptErrorMessage(error), canContinue: false }
}

export default function AttemptResultPage() {
  const { user } = useAuth()
  const userId = user?.id
  const { attemptId = '' } = useParams()
  const location = useLocation()
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<ResultState | null>(null)
  const key = `${attemptId}:${version}`
  const navigationState: unknown = location.state
  const examId = navigationState && typeof navigationState === 'object' && 'examId' in navigationState && typeof navigationState.examId === 'string'
    ? navigationState.examId
    : null

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    async function load() {
      try {
        const result = await attemptsApi.result(attemptId, controller.signal)
        if (active) {
          if (userId && readAttemptCache(userId, result.attempt.examId)?.session.attempt.id === result.attempt.id) {
            clearAttemptCache(userId, result.attempt.examId)
          }
          setState({ key, kind: 'ready', result })
        }
      } catch (error) {
        if (active) setState({ key, kind: 'error', ...getResultError(error) })
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [attemptId, key, userId])

  const current = state?.key === key ? state : null

  if (!current) {
    return <section className="exam-state-panel" aria-live="polite" aria-busy="true">
      <span className="loading-spinner" aria-hidden="true" />
      <p>Đang tải kết quả bài làm…</p>
    </section>
  }

  if (current.kind === 'error') {
    return <section className="exam-state-panel">
      <h1>Kết quả bài làm</h1>
      <p className="form-error" role="alert">{current.message}</p>
      <div className="exam-actions">
        {current.canContinue && examId && <Link className="button button-primary button-inline" to={`/exams/${examId}/take`}>Tiếp tục bài <ArrowRight size={17} aria-hidden="true" /></Link>}
        <button className="button button-secondary button-inline" type="button" onClick={() => setVersion((value) => value + 1)}>Thử lại</button>
        <Link className="text-link" to="/history">Về lịch sử làm bài</Link>
      </div>
    </section>
  }

  const { result } = current
  const { attempt, summary } = result

  return <div className="exam-page result-page">
    <Link className="exam-back-link" to="/history"><ArrowLeft size={17} aria-hidden="true" /> Lịch sử làm bài</Link>
    <header className="exam-page-heading">
      <div><p className="exam-eyebrow">Đã hoàn thành</p><h1>Kết quả bài làm</h1><p>{attempt.examTitle}</p></div>
      <span className="attempt-status attempt-status-submitted"><CheckCircle2 size={16} aria-hidden="true" /> Đã nộp</span>
    </header>

    <section className="result-overview" aria-label="Tổng kết bài làm">
      <div className="result-score" aria-label="Điểm bài thi">
        <Trophy size={29} aria-hidden="true" />
        <span>Điểm bài thi</span>
        <strong>{typeof summary.score === 'number' ? numberFormat.format(summary.score) : '—'} <small>/ {numberFormat.format(summary.maxScore)}</small></strong>
      </div>
      <dl className="result-statistics">
        <div><dt>Tổng số câu</dt><dd>{summary.totalQuestions}</dd></div>
        <div><dt>Trả lời đúng</dt><dd>{summary.correctCount}</dd></div>
        <div><dt>Sai hoặc bỏ trống</dt><dd>{summary.incorrectCount}</dd></div>
        <div><dt>Chưa trả lời</dt><dd>{summary.unansweredCount}</dd></div>
      </dl>
    </section>
    <dl className="result-timing">
      <div><dt>Bắt đầu</dt><dd>{formatDate(attempt.startedAt)}</dd></div>
      <div><dt>Nộp bài</dt><dd>{formatDate(attempt.submittedAt)}</dd></div>
    </dl>
    <div className="exam-actions">
      <Link className="button button-primary button-inline" to={`/exams/${attempt.examId}`}><RotateCcw size={17} aria-hidden="true" /> Làm lại đề này</Link>
      <Link className="button button-secondary button-inline" to="/exams">Chọn đề khác <ArrowRight size={17} aria-hidden="true" /></Link>
    </div>

    <section className="result-review" aria-labelledby="answer-review-heading">
      <h2 id="answer-review-heading">Chi tiết đáp án</h2>
      {result.questions.map((question, index) => <article className="result-question exam-card" key={question.id}>
        <div className="result-question-heading">
          <h3>Câu {index + 1}</h3>
          <span className={`result-outcome ${question.isCorrect ? 'result-outcome-correct' : 'result-outcome-incorrect'}`}>
            {question.isCorrect ? <CheckCircle2 size={17} aria-hidden="true" /> : <XCircle size={17} aria-hidden="true" />}
            {question.selectedOptionIndex === null ? 'Chưa trả lời' : question.isCorrect ? 'Đúng' : 'Sai'}
          </span>
        </div>
        <p className="exam-question-content">{question.content}</p>
        <ol className="result-options" aria-label={`Đáp án câu ${index + 1}`}>
          {question.options.map((option, optionIndex) => {
            const selected = optionIndex === question.selectedOptionIndex
            const correct = optionIndex === question.correctOptionIndex
            return <li key={optionIndex} className={`result-option${correct ? ' result-option-correct' : ''}${selected && !correct ? ' result-option-incorrect' : ''}`}>
              <span className="option-letter" aria-hidden="true">{String.fromCharCode(65 + optionIndex)}</span>
              <span className="result-option-content">{option}</span>
              <span className="result-option-labels">{selected && <span>Bạn chọn</span>}{correct && <span>Đáp án đúng</span>}</span>
            </li>
          })}
        </ol>
      </article>)}
    </section>
  </div>
}
