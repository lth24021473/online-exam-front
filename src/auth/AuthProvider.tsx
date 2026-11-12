import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import axios from 'axios'
import { authApi } from '../api/auth.api'
import type { AuthResponse, AuthUser } from '../api/auth.api'
import {
  ACCESS_TOKEN_KEY,
  bumpSessionEpoch,
  getAccessToken,
  getApiErrorMessage,
  getSessionEpoch,
  isSameTokenSubject,
  REFRESH_TOKEN_KEY,
  rememberRefreshedToken,
  SESSION_EXPIRED_EVENT,
  setAccessToken,
  setRefreshToken,
  TOKEN_REFRESHED_EVENT,
} from '../api/axios'
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
  const sessionRef = useRef(session)
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const clearSession = useCallback(() => {
    setRestoreError('')
    setSessionNotice('')
    setAccessToken(null)
    setRefreshToken(null)
    setSession({ token: null, user: null, loading: false })
  }, [])

  useEffect(() => {
    if (!session.token || !session.loading) return
    const controller = new AbortController()
    const epoch = getSessionEpoch()

    authApi.me(controller.signal).then((user) => {
      if (controller.signal.aborted || getSessionEpoch() !== epoch) return
      const currentToken = getAccessToken()
      if (!currentToken) return
      setSession({ token: currentToken, user, loading: false })
    }).catch((error: unknown) => {
      if (controller.signal.aborted || axios.isCancel(error)) return
      if (getSessionEpoch() !== epoch) return
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
    const onRefreshed = (event: Event) => {
      const detail = (event as CustomEvent<{ accessToken?: string; user?: AuthUser }>).detail
      const accessToken = detail?.accessToken
      if (!accessToken) return
      setSession((current) => {
        if (!current.token) return current
        const nextUser = detail.user && (!current.user || current.user.id === detail.user.id)
          ? detail.user
          : current.user
        return { ...current, token: accessToken, user: nextUser }
      })
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACCESS_TOKEN_KEY && event.key !== REFRESH_TOKEN_KEY && event.key !== null) return
      const token = getAccessToken()
      const current = sessionRef.current
      setRestoreError('')
      setSessionNotice('')
      if (!token) {
        if (current.token !== null) bumpSessionEpoch()
        setSession({ token: null, user: null, loading: false })
        return
      }
      if (current.token === token) return
      if (current.token && current.user && isSameTokenSubject(current.token, token)) {
        rememberRefreshedToken(current.token, token, getSessionEpoch())
        setSession((prev) => (prev.token ? { ...prev, token } : prev))
        return
      }
      bumpSessionEpoch()
      setSession({ token, user: null, loading: true })
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    window.addEventListener(TOKEN_REFRESHED_EVENT, onRefreshed)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
      window.removeEventListener(TOKEN_REFRESHED_EVENT, onRefreshed)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    const reconnect = () => { setRestoreError(''); setRetry((value) => value + 1) }
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [])

  const updateUser = useCallback((user: AuthUser) => {
    setSession((cur) => (cur.token && cur.user?.id === user.id)
      ? { ...cur, user }
      : cur)
  }, [])

  const refreshUser = useCallback(async () => {
    if (!session.token) return null
    try {
      const freshUser = await authApi.me()
      setSession((cur) => {
        if (!cur.token || cur.user?.id !== freshUser.id) return cur
        if (
          cur.user?.fullName === freshUser.fullName &&
          cur.user?.avatar === freshUser.avatar &&
          cur.user?.cover === freshUser.cover &&
          cur.user?.workplace === freshUser.workplace &&
          cur.user?.currentResidence === freshUser.currentResidence &&
          cur.user?.role === freshUser.role &&
          cur.user?.updatedAt === freshUser.updatedAt
        ) {
          return cur
        }
        return { ...cur, user: freshUser }
      })
      return freshUser
    } catch {
      return null
    }
  }, [session.token])

  useEffect(() => {
    if (!session.token) return
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && session.token) {
        refreshUser()
      }
    }
    window.addEventListener('focus', onVisibilityOrFocus)
    document.addEventListener('visibilitychange', onVisibilityOrFocus)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && session.token) {
        refreshUser()
      }
    }, 4000)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onVisibilityOrFocus)
      document.removeEventListener('visibilitychange', onVisibilityOrFocus)
    }
  }, [session.token, refreshUser])

  const authenticate = useCallback((response: AuthResponse) => {
    setRestoreError('')
    setSessionNotice('')
    setAccessToken(response.accessToken)
    setRefreshToken(response.refreshToken ?? null)
    setSession({ token: response.accessToken, user: response.user, loading: false })
  }, [])

  const logout = useCallback(async () => {
    const token = getAccessToken()
    const epoch = getSessionEpoch()
    try {
      if (token) await authApi.logout()
    } catch {
      // Always end the local session, including when the server is unavailable.
    } finally {
      if (getSessionEpoch() === epoch) clearSession()
    }
  }, [clearSession])

  const value = useMemo(() => ({
    user: session.user,
    loading: session.loading,
    isAuthenticated: Boolean(session.user),
    sessionNotice,
    authenticate,
    logout,
    updateUser,
    refreshUser,
  }), [session.user, session.loading, sessionNotice, authenticate, logout, updateUser, refreshUser])

  return <AuthContext.Provider value={value}>{session.token && session.loading && restoreError
    ? <div className="route-loading"><section className="exam-panel"><h1>Chưa thể kiểm tra phiên đăng nhập</h1><p className="form-error" role="alert">{restoreError}</p><p>Kết nối lại để tiếp tục bài làm. Thời gian làm bài vẫn tiếp tục chạy.</p><div className="exam-actions"><button className="button button-primary button-inline" onClick={() => { setRestoreError(''); setRetry((value) => value + 1) }}>Thử lại kết nối</button><button className="button button-inline exam-button-secondary" onClick={clearSession}>Về đăng nhập</button></div></section></div>
    : children}</AuthContext.Provider>

}

export default AuthProvider
