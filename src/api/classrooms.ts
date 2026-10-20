import axios from 'axios'
import api, { getApiErrorMessage } from './axios'

export interface ClassroomManager {
  id: string
  fullName: string
  email: string
  avatar?: string | null
}

export interface Classroom {
  id: string
  name: string
  code: string
  description?: string | null
  password?: string
  managerId: string
  manager?: ClassroomManager
  memberCount?: number
  examCount?: number
  createdAt: string
  updatedAt: string
  joinedAt?: string
}

export interface ClassroomMember {
  id: string
  userId: string
  fullName: string
  email: string
  avatar?: string | null
  role: string
  joinedAt: string
}

export interface ClassroomExam {
  id: string
  title: string
  description?: string | null
  instructions?: string | null
  durationMinutes: number
  totalQuestions?: number | null
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
  opensAt?: string | null
  closesAt?: string | null
  maxAttempts?: number
  classroomId?: string | null
  createdAt?: string
  updatedAt?: string
  _count?: {
    questions?: number
    attempts?: number
  }
}

export interface CreateClassroomPayload {
  name: string
  description?: string
  password: string
}

export interface JoinClassroomPayload {
  code: string
  password: string
}

function extractList<T>(data: T[] | { items: T[] }): T[] {
  if (Array.isArray(data)) return data
  if (data && Array.isArray((data as { items?: T[] }).items)) return (data as { items: T[] }).items
  return []
}

export const classroomsApi = {
  async create(payload: CreateClassroomPayload): Promise<Classroom> {
    const { data } = await api.post<Classroom>('/classrooms', payload)
    return data
  },

  async getManaged(): Promise<Classroom[]> {
    const { data } = await api.get<Classroom[] | { items: Classroom[] }>('/classrooms/managed')
    return extractList(data)
  },

  async getJoined(): Promise<Classroom[]> {
    const { data } = await api.get<Classroom[] | { items: Classroom[] }>('/classrooms/joined')
    return extractList(data)
  },

  async getDetail(id: string): Promise<Classroom> {
    const { data } = await api.get<Classroom>(`/classrooms/${id}`)
    return data
  },

  async join(payload: JoinClassroomPayload): Promise<Classroom> {
    const { data } = await api.post<Classroom>('/classrooms/join', payload)
    return data
  },

  async getMembers(id: string): Promise<ClassroomMember[]> {
    const { data } = await api.get<ClassroomMember[] | { items: ClassroomMember[] }>(`/classrooms/${id}/members`)
    return extractList(data)
  },

  async getExams(id: string): Promise<any[]> {
    const { data } = await api.get<any[] | { items: any[] }>(`/classrooms/${id}/exams`)
    return extractList(data)
  },

  async removeMember(classroomId: string, userId: string): Promise<void> {
    await api.delete(`/classrooms/${classroomId}/members/${userId}`)
  },

  async deleteClassroom(id: string): Promise<void> {
    await api.delete(`/classrooms/${id}`)
  },
}

export function getClassroomErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ message?: string | string[] }>(error)) {
    const messages: Record<string, string> = {
      'Classroom not found': 'Không tìm thấy lớp học này.',
      'Mã lớp không tồn tại': 'Mã lớp không tồn tại.',
      'Classroom code already exists': 'Mã lớp này đã tồn tại. Vui lòng thử lại.',
      'Wrong classroom password': 'Mật khẩu lớp học không chính xác.',
      'Mật khẩu lớp không chính xác': 'Mật khẩu lớp học không chính xác.',
      'You have already joined this classroom': 'Bạn đã tham gia lớp học này rồi.',
      'Bạn đã tham gia lớp học này rồi': 'Bạn đã tham gia lớp học này rồi.',
      'You cannot join your own classroom': 'Bạn là giáo viên quản lý lớp này, không thể tham gia như học sinh.',
      'You do not have access to this classroom': 'Bạn không có quyền truy cập lớp học này.',
      'Only classroom manager or admin can remove members': 'Chỉ giáo viên quản lý lớp hoặc quản trị viên mới có quyền xóa học sinh.',
      'Cannot remove manager from classroom': 'Không thể xóa giáo viên quản lý khỏi lớp học.',
      'Member not found in classroom': 'Học sinh không thuộc lớp học này.',
      'Cannot delete classroom with existing exams or attempts': 'Không thể xóa lớp học đã có đề thi hoặc bài làm.',
      'Không thể xóa lớp học đã có đề thi hoặc bài làm': 'Không thể xóa lớp học đã có đề thi hoặc bài làm.',
      'You do not manage this classroom': 'Bạn không có quyền quản lý lớp học này.',
      'Only classroom manager or admin can delete classroom': 'Chỉ giáo viên quản lý lớp hoặc quản trị viên mới có quyền xóa lớp.',
    }
    const message = error.response?.data?.message
    const primary = Array.isArray(message) ? message[0] : message
    if (typeof primary === 'string') {
      if (messages[primary]) return messages[primary]
      if (/[à-ỹÀ-Ỹ]/.test(primary)) return primary
    }
    if (error.response?.status === 404) return 'Không tìm thấy lớp học này.'
    if (error.response?.status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
    if (error.response?.status === 409) return typeof primary === 'string' ? primary : 'Dữ liệu bị xung đột. Vui lòng thử lại.'
  }
  return getApiErrorMessage(error)
}

export default classroomsApi
