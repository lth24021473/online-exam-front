import axios from 'axios'
import api, { getApiErrorMessage } from './axios'
import type { AuthRole, AuthUser } from './auth.api'

export type UpdatedAdminUser = Pick<AuthUser, 'id' | 'email' | 'fullName' | 'role' | 'updatedAt'>

export const adminUsersApi = {
  async list(signal?: AbortSignal): Promise<AuthUser[]> {
    return (await api.get<AuthUser[]>('/admin/users', { signal })).data
  },
  async detail(id: string, signal?: AbortSignal): Promise<AuthUser> {
    return (await api.get<AuthUser>(`/admin/users/${id}`, { signal })).data
  },
  async updateRole(id: string, role: AuthRole): Promise<UpdatedAdminUser> {
    return (await api.patch<UpdatedAdminUser>(`/admin/users/${id}/role`, { role })).data
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/admin/users/${id}`)
  },
}

export function getAdminErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    if (error.response?.status === 404) return 'Tài khoản không còn tồn tại. Hãy làm mới danh sách.'
    if (error.response?.data?.message === 'User cannot be deleted while they own exams or attempts') {
      return 'Không thể xóa tài khoản đang có đề thi hoặc bài làm. Hãy giữ tài khoản hoặc thay đổi vai trò phù hợp.'
    }
  }
  return getApiErrorMessage(error)
}
