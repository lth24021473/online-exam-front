import axios from 'axios'
import api, { getApiErrorMessage } from './axios'
import type { ExamInfo } from './exams'
import type { AttemptStatus } from './attempts'

export type ExamStatus = ExamInfo['status']
export const examStatusLabels = { DRAFT: 'Bản nháp', PUBLISHED: 'Đang mở', CLOSED: 'Đã đóng' }
export const attemptStatusLabels = { IN_PROGRESS: 'Đang làm', SUBMITTED: 'Đã nộp', CANCELLED: 'Đã hủy' }
export interface ManagerOption { id: string; content: string; position: number; isCorrect: boolean }
export interface ManagerQuestion { id: string; content: string; position: number; options: ManagerOption[] }
export interface ManagerExam extends ExamInfo { managerId?: string; questions?: ManagerQuestion[] }
export interface ExamPayload { title: string; description: string; instructions: string; durationMinutes: number }
export interface QuestionPayload { content: string; position: number; options: string[]; correctOptionIndex: number }
export interface ExamStudentResult {
  id: string; status: AttemptStatus; startedAt: string; deadlineAt: string; submittedAt: string | null; cancelledAt: string | null
  score: number | null; totalQuestions: number; correctCount: number | null; incorrectCount: number | null
  user: { id: string; fullName: string; email: string }
}
export interface ManagerResults {
  exam: { id: string; title: string; status: ExamStatus; durationMinutes: number }
  data: ExamStudentResult[]
  meta: { page: number; limit: number; total: number; totalPages: number }
  summary: { totalAttempts: number; inProgressCount: number; submittedCount: number; cancelledCount: number; averageScore: number | null; highestScore: number | null; lowestScore: number | null }
}
function normalize(exam: ManagerExam & { _count?: { questions?: number } }): ManagerExam {
  return { ...exam, totalQuestions: exam.totalQuestions ?? exam._count?.questions ?? exam.questions?.length ?? null }
}
export const managerExamsApi = {
  async list(signal?: AbortSignal): Promise<ManagerExam[]> {
    const data = (await api.get<ManagerExam[] | { items: ManagerExam[] }>('/exams', { signal })).data
    return (Array.isArray(data) ? data : data.items).map(normalize)
  },
  async detail(id: string, signal?: AbortSignal): Promise<ManagerExam> {
    return normalize((await api.get<ManagerExam>(`/exams/${id}`, { signal })).data)
  },
  async create(payload: ExamPayload): Promise<ManagerExam> { return (await api.post<ManagerExam>('/exams', payload)).data },
  async update(id: string, payload: ExamPayload): Promise<ManagerExam> { return (await api.patch<ManagerExam>(`/exams/${id}`, payload)).data },
  async remove(id: string): Promise<void> { await api.delete(`/exams/${id}`) },
  async publish(id: string): Promise<ManagerExam> { return (await api.put<ManagerExam>(`/exams/${id}/publish`)).data },
  async close(id: string): Promise<ManagerExam> { return (await api.put<ManagerExam>(`/exams/${id}/close`)).data },
  async createQuestion(id: string, payload: QuestionPayload): Promise<ManagerQuestion> {
    return (await api.post<ManagerQuestion>(`/exams/${id}/questions`, payload)).data
  },
  async updateQuestion(id: string, questionId: string, payload: QuestionPayload): Promise<ManagerQuestion> {
    return (await api.patch<ManagerQuestion>(`/exams/${id}/questions/${questionId}`, payload)).data
  },
  async removeQuestion(id: string, questionId: string): Promise<void> { await api.delete(`/exams/${id}/questions/${questionId}`) },
  async results(id: string, params: { page: number; limit: number; status?: AttemptStatus }, signal?: AbortSignal): Promise<ManagerResults> {
    return (await api.get<ManagerResults>(`/exams/${id}/results`, { params, signal })).data
  },
}
export function getManagerErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    const messages: Record<string, string> = {
      'Exam not found': 'Không tìm thấy đề thi này.',
      'Question not found': 'Không tìm thấy câu hỏi này. Hãy tải lại đề thi.',
      'You do not own this exam': 'Bạn chưa có quyền quản lý đề thi này.',
      'Only DRAFT exams can be modified': 'Chỉ có thể chỉnh sửa đề thi bản nháp.',
      'Only DRAFT exams can be deleted': 'Chỉ có thể xóa đề thi bản nháp.',
      'Exam content is referenced by another exam attempt': 'Không thể xóa vì bài làm của đề khác đang tham chiếu đến nội dung đề này. Hãy kiểm tra dữ liệu trước khi xóa.',
      'Exam changed concurrently. Please retry the operation': 'Đề thi đang được cập nhật đồng thời. Vui lòng thử lại thao tác.',
      'Only DRAFT exams can be published': 'Chỉ có thể mở đề thi bản nháp.',
      'Only PUBLISHED exams can be closed': 'Chỉ có thể đóng đề thi đang mở.',
      'Exam must have at least one question before publishing': 'Hãy thêm ít nhất một câu hỏi trước khi mở đề.',
      'Each question must have at least two non-empty options and exactly one correct option': 'Mỗi câu cần ít nhất hai đáp án có nội dung và đúng một đáp án đúng.',
      'A question with this position already exists': 'Vị trí câu hỏi đã được dùng. Hãy chọn vị trí khác.',
      'Position already taken': 'Vị trí câu hỏi đã được dùng. Hãy chọn vị trí khác.',
      'correctOptionIndex is out of range': 'Hãy chọn một đáp án đúng trong danh sách.',
      'Question has no correct option': 'Câu hỏi chưa có đáp án đúng. Hãy chỉnh sửa trước khi mở đề.',
    }
    const message = error.response?.data?.message
    if (typeof message === 'string' && messages[message]) return messages[message]
    if (error.response?.status === 409) return 'Đề thi đã thay đổi hoặc vị trí câu hỏi bị trùng. Hãy tải lại để kiểm tra.'
    if (error.response?.status === 404) return 'Không tìm thấy đề thi hoặc câu hỏi này.'
  }
  return getApiErrorMessage(error)
}
