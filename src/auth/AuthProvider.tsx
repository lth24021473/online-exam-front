import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import axios from 'axios'
import { authApi } from '../api/auth.api'
import type { AuthResponse, AuthUser } from '../api/auth.api'
import { ACCESS_TOKEN_KEY, getAccessToken, SESSION_EXPIRED_EVENT, setAccessToken } from '../api/axios'
import { AuthContext } from './auth-context'

interface Session {
  token: string | null
  user: AuthUser | null
  loading: boolean
}

function initialSession(): Session {
  const token = getAccessToken()
  return { token, user: null, loading: Boolean(token) }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(initialSession)

  const clearSession = useCallback(() => {
    setAccessToken(null)
    setSession({ token: null, user: null, loading: false })
  }, [])

  useEffect(() => {
    if (!session.token || !session.loading) return
    const controller = new AbortController()
    const token = session.token

    authApi.me(controller.signal).then((user) => {
      if (controller.signal.aborted || getAccessToken() !== token) return
      setSession({ token, user, loading: false })
    }).catch((error: unknown) => {
      if (controller.signal.aborted || axios.isCancel(error)) return
      if (getAccessToken() === token) clearSession()
    })

    return () => controller.abort()
  }, [session.token, session.loading, clearSession])

  useEffect(() => {
    const onExpired = () => {
      setSession({ token: null, user: null, loading: false })
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACCESS_TOKEN_KEY && event.key !== null) return
      const token = getAccessToken()
      setSession((current) => current.token === token
        ? current
        : { token, user: null, loading: Boolean(token) })
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const authenticate = useCallback((response: AuthResponse) => {
    setAccessToken(response.accessToken)
    setSession({ token: response.accessToken, user: response.user, loading: false })
  }, [])

  const logout = useCallback(async () => {
    const token = getAccessToken()
    try {
      if (token) await authApi.logout()
    } catch {
      // Always end the local session, including when the server is unavailable.
    } finally {
      if (getAccessToken() === token) clearSession()
    }
  }, [clearSession])

  const value = useMemo(() => ({
    user: session.user,
    loading: session.loading,
    isAuthenticated: Boolean(session.user),
    authenticate,
    logout,
  }), [session.user, session.loading, authenticate, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
