import type { AuthRole } from '../api/auth.api'

export const roleLabels: Record<AuthRole, string> = {
  STUDENT: 'Học viên',
  EXAM_MANAGER: 'Quản lý đề thi',
  ADMIN: 'Quản trị viên',
}

export const accountRoles = Object.keys(roleLabels) as AuthRole[]
