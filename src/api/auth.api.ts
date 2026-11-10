import api from './axios'

export type AuthRole = 'STUDENT' | 'EXAM_MANAGER' | 'ADMIN'

export interface AuthUser {
  id: string
  email: string
  fullName: string
  role: AuthRole
  avatar?: string | null
  cover?: string | null
  workplace?: string | null
  currentResidence?: string | null
  createdAt: string
  updatedAt: string
}

export interface AuthResponse {
  accessToken: string
  user: AuthUser
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload extends LoginPayload {
  fullName: string
}

export interface ForgotPasswordPayload {
  email: string
}

export interface ResetPasswordPayload {
  email: string
  token: string
  newPassword: string
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

export interface ChangePasswordResponse {
  message: string
  accessToken: string
}

export const authApi = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/login', {
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
    })
    return data
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/register', {
      fullName: payload.fullName.trim(),
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
    })
    return data
  },

  async forgotPassword(payload: ForgotPasswordPayload): Promise<{ message: string }> {
    const { data } = await api.post<{ message: string }>('/auth/forgot-password', {
      email: payload.email.trim().toLowerCase(),
    })
    return data
  },

  async resetPassword(payload: ResetPasswordPayload): Promise<{ message: string }> {
    const { data } = await api.post<{ message: string }>('/auth/reset-password', {
      email: payload.email.trim().toLowerCase(),
      token: payload.token.trim(),
      newPassword: payload.newPassword,
    })
    return data
  },

  async me(signal?: AbortSignal): Promise<AuthUser> {
    const { data } = await api.get<AuthUser>('/users/me', { signal })
    return data
  },

  async updateProfile(payload: {
    fullName?: string
    avatar?: string | null
    cover?: string | null
    workplace?: string | null
    currentResidence?: string | null
  }): Promise<AuthUser> {
    const { data } = await api.patch<AuthUser>('/users/me', payload)
    return data
  },

  async changePassword(payload: ChangePasswordPayload): Promise<ChangePasswordResponse> {
    const { data } = await api.post<ChangePasswordResponse>('/auth/change-password', payload)
    return data
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout')
  },
}
