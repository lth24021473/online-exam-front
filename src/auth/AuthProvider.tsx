import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import axios from 'axios'
import { authApi } from '../api/auth.api'
import type { AuthResponse, AuthUser } from '../api/auth.api'
import { ACCESS_TOKEN_KEY, getAccessToken, getApiErrorMessage, SESSION_EXPIRED_EVENT, setAccessToken } from '../api/axios'
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
  const [restoreError, setRestoreError] = useState('')
  const [sessionNotice, setSessionNotice] = useState('')
  const [retry, setRetry] = useState(0)

  const clearSession = useCallback(() => {
    setRestoreError('')
    setSessionNotice('')
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
      if (getAccessToken() !== token) return
      if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) clearSession()
      else setRestoreError(getApiErrorMessage(error))
    })

    return () => controller.abort()
  }, [session.token, session.loading, clearSession, retry])

  useEffect(() => {
    const onExpired = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message
      setSessionNotice(typeof message === 'string' ? message : 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.')
      setRestoreError('')
      setSession({ token: null, user: null, loading: false })
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACCESS_TOKEN_KEY && event.key !== null) return
      const token = getAccessToken()
      setRestoreError('')
      setSessionNotice('')
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

  useEffect(() => {
    const reconnect = () => { setRestoreError(''); setRetry((value) => value + 1) }
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [])

  const authenticate = useCallback((response: AuthResponse) => {
    setRestoreError('')
    setSessionNotice('')
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
    sessionNotice,
    authenticate,
    logout,
  }), [session.user, session.loading, sessionNotice, authenticate, logout])

  return <AuthContext.Provider value={value}>{session.token && session.loading && restoreError
    ? <div className="route-loading"><section className="exam-panel"><h1>Chưa thể kiểm tra phiên đăng nhập</h1><p className="form-error" role="alert">{restoreError}</p><p>Kết nối lại để tiếp tục bài làm. Thời gian làm bài vẫn tiếp tục chạy.</p><div className="exam-actions"><button className="button button-primary button-inline" onClick={() => { setRestoreError(''); setRetry((value) => value + 1) }}>Thử lại kết nối</button><button className="button button-inline exam-button-secondary" onClick={clearSession}>Về đăng nhập</button></div></section></div>
    : children}</AuthContext.Provider>
}

export default AuthProvider
