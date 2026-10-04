import api, { getApiErrorMessage } from './axios'
import axios from 'axios'

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED'
export interface AttemptQuestion { id: string; content: string; position: number; options: string[] }
export interface AttemptSession {
  resumed: boolean
  attempt: { id: string; examId: string; status: AttemptStatus; startedAt: string; deadlineAt: string; totalQuestions: number }
  exam: { id: string; title: string; instructions: string | null; durationMinutes: number }
  questions: AttemptQuestion[]
  answers: { questionId: string; selectedOptionIndex: number }[]
}
export interface AttemptResult {
  attempt: { id: string; examId: string; examTitle: string; status: AttemptStatus; startedAt: string; deadlineAt: string; submittedAt: string }
  summary: { score: number; maxScore: number; totalQuestions: number; correctCount: number; incorrectCount: number; unansweredCount: number }
  questions: (AttemptQuestion & { selectedOptionIndex: number | null; correctOptionIndex: number | null; isCorrect: boolean })[]
}
export interface AttemptHistoryItem {
  id: string; status: AttemptStatus; startedAt: string; deadlineAt: string
  submittedAt: string | null; cancelledAt: string | null; score: number | null
  totalQuestions: number; correctCount: number | null; incorrectCount: number | null
  exam: { id: string; title: string }; maxScore: number; expired: boolean
}
export interface AttemptHistoryResponse {
  items: AttemptHistoryItem[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}
export const attemptsApi = {
  async start(examId: string): Promise<AttemptSession> { return (await api.post<AttemptSession>(`/exams/${examId}/attempts`)).data },
  async saveAnswer(attemptId: string, questionId: string, selectedOptionIndex: number) {
    return (await api.put<{ questionId: string; selectedOptionIndex: number; savedAt: string }>(`/attempts/${attemptId}/answers/${questionId}`, { selectedOptionIndex })).data
  },
  async submit(id: string): Promise<AttemptResult> { return (await api.post<AttemptResult>(`/attempts/${id}/submit`)).data },
  async result(id: string, signal?: AbortSignal): Promise<AttemptResult> { return (await api.get<AttemptResult>(`/attempts/${id}/result`, { signal })).data },
  async cancel(id: string): Promise<void> { await api.delete(`/attempts/${id}`) },
  async history(params: { page?: number; limit?: number; examId?: string; status?: AttemptStatus } = {}, signal?: AbortSignal): Promise<AttemptHistoryResponse> {
    return (await api.get<AttemptHistoryResponse>('/attempts', { params, signal })).data
  },
}

export function getAttemptErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    const messages: Record<string, string> = {
      'Exam not found': 'Không tìm thấy đề thi này.',
      'Exam is closed': 'Đề thi đã đóng.',
      'Exam has no questions': 'Đề thi chưa có câu hỏi.',
      'Attempt not found': 'Không tìm thấy bài làm của bạn.',
      'Question not found in this exam': 'Câu hỏi không thuộc đề thi này.',
      'Attempt is not in progress': 'Bài làm đã kết thúc. Hãy kiểm tra lịch sử.',
      'Attempt has already been submitted': 'Bài làm đã được nộp.',
      'Attempt has not been submitted yet': 'Bài làm chưa được nộp.',
      'Attempt was cancelled': 'Bài làm đã được hủy.',
      'Cancelled attempts have no graded result': 'Bài làm đã được hủy nên không có điểm.',
      'Cancelled attempts cannot be submitted': 'Bài làm đã được hủy và không thể nộp.',
      'Attempt is no longer in progress': 'Bài làm đã kết thúc. Hãy kiểm tra lịch sử.',
      'Time is over for this attempt': 'Thời gian làm bài đã hết.',
      'Only in-progress attempts can be cancelled': 'Chỉ có thể hủy bài đang làm.',
      'Attempt was already submitted or cancelled': 'Bài làm đã được nộp hoặc hủy.',
      'Question not found in exam': 'Câu hỏi không thuộc đề thi này.',
      'Selected option does not exist': 'Đáp án không hợp lệ. Hãy tải lại bài.',
      'Time is over': 'Thời gian làm bài đã hết.',
    }
    const message = error.response?.data?.message
    if (message && messages[message]) return messages[message]
    if (error.response?.status === 404) return 'Không tìm thấy đề thi hoặc bài làm của bạn.'
    if (error.response?.status === 409) return 'Bài làm đã thay đổi hoặc hết thời gian. Hãy kiểm tra lại lịch sử.'
  }
  return getApiErrorMessage(error)
}
