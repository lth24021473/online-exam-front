import api from './axios'

export type AuthRole = 'STUDENT' | 'EXAM_MANAGER' | 'ADMIN'

export interface AuthUser {
  id: string
  email: string
  fullName: string
  role: AuthRole
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

  async me(signal?: AbortSignal): Promise<AuthUser> {
    const { data } = await api.get<AuthUser>('/users/me', { signal })
    return data
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout')
  },
}
