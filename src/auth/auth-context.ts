import { createContext } from 'react'
import type { AuthResponse, AuthUser } from '../api/auth.api'

export interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  isAuthenticated: boolean
  authenticate: (response: AuthResponse) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
