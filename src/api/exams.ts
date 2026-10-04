import axios from 'axios'
import api from './axios'
import type { AuthRole } from './auth.api'

export interface ExamInfo {
  id: string; title: string; description: string | null; instructions: string | null
  durationMinutes: number; totalQuestions: number | null; status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
}
export interface ExamCatalog { items: ExamInfo[]; meta: { page: number; limit: number; total: number; totalPages: number }; demo: boolean }

const demoId = import.meta.env.VITE_DEMO_EXAM_ID?.trim()
const demo: ExamInfo | null = demoId && /^[a-f\d]{24}$/i.test(demoId) ? {
  id: demoId, title: import.meta.env.VITE_DEMO_EXAM_TITLE?.trim() || 'Đề thi Demo - Lập trình cơ bản',
  description: 'Ôn tập kiến thức lập trình, HTTP và ứng dụng web.',
  instructions: 'Mỗi câu chọn một đáp án. Bài làm tự nộp khi hết thời gian.',
  durationMinutes: Number(import.meta.env.VITE_DEMO_EXAM_MINUTES) || 15,
  totalQuestions: Number(import.meta.env.VITE_DEMO_EXAM_QUESTIONS) || 5, status: 'PUBLISHED',
} : null

function normalize(exam: ExamInfo & { questionCount?: number; _count?: { questions?: number }; questions?: unknown[] }): ExamInfo {
  return { ...exam, totalQuestions: exam.totalQuestions ?? exam.questionCount ?? exam._count?.questions ?? exam.questions?.length ?? null }
}

// Fall back only for an unavailable catalog route; connectivity/auth/server failures remain visible.
export const examsApi = {
  async list(page = 1, signal?: AbortSignal, role: AuthRole = 'STUDENT', status?: ExamInfo['status']): Promise<ExamCatalog> {
    const filterStatus = role === 'STUDENT' ? 'PUBLISHED' : status
    const matchesStatus = (exam: ExamInfo) => !filterStatus || exam.status === filterStatus
    try {
      const { data } = await api.get<ExamInfo[] | Omit<ExamCatalog, 'demo'>>('/exams', { params: { page, limit: 12, ...(filterStatus && { status: filterStatus }) }, signal })
      if (Array.isArray(data)) {
        const items = data.map(normalize).filter(matchesStatus)
        return { items: items.slice((page - 1) * 12, page * 12), meta: { page, limit: 12, total: items.length, totalPages: Math.ceil(items.length / 12) }, demo: false }
      }
      return { items: data.items.map(normalize).filter(matchesStatus), meta: data.meta, demo: false }
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error
      const matchingDemo = demo && matchesStatus(demo) ? demo : null
      return { items: page === 1 && matchingDemo ? [matchingDemo] : [], meta: { page, limit: 12, total: matchingDemo ? 1 : 0, totalPages: matchingDemo ? 1 : 0 }, demo: true }
    }
  },
  async detail(id: string, signal?: AbortSignal): Promise<ExamInfo | null> {
    try { return normalize((await api.get<ExamInfo>(`/exams/${id}`, { signal })).data) }
    catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error
      return demo?.id === id ? demo : null
    }
  },
}
