import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'

export const ACCESS_TOKEN_KEY = 'online-exam.access-token'
export const REFRESH_TOKEN_KEY = 'online-exam.refresh-token'
export const SESSION_EXPIRED_EVENT = 'online-exam:session-expired'
export const TOKEN_REFRESHED_EVENT = 'online-exam:token-refreshed'

let memoryToken: string | null = null
let useMemoryStorage = false
let memoryRefreshToken: string | null = null
let useMemoryRefreshStorage = false
let sessionEpoch = 0
let refreshPromise: Promise<string> | null = null
const refreshedTokens = new Map<string, { epoch: number; accessToken: string }>()

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

interface RefreshResponsePayload {
  accessToken: string
  refreshToken?: string
  user?: unknown
}

function writeAccessToken(token: string | null): void {
  memoryToken = token
  try {
    if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token)
    else localStorage.removeItem(ACCESS_TOKEN_KEY)
    useMemoryStorage = false
  } catch {
    useMemoryStorage = true
    // Authentication can still work in memory for the current tab.
  }
}

function writeRefreshToken(token: string | null): void {
  memoryRefreshToken = token
  try {
    if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token)
    else localStorage.removeItem(REFRESH_TOKEN_KEY)
    useMemoryRefreshStorage = false
  } catch {
    useMemoryRefreshStorage = true
    // Refresh token can still work in memory for the current tab.
  }
}

export function getSessionEpoch(): number {
  return sessionEpoch
}

export function bumpSessionEpoch(): number {
  sessionEpoch += 1
  refreshedTokens.clear()
  return sessionEpoch
}

export function rememberRefreshedToken(oldToken: string, newToken: string, epoch = sessionEpoch): void {
  if (!oldToken || !newToken || oldToken === newToken) return
  if (refreshedTokens.size >= 10) {
    const oldestKey = refreshedTokens.keys().next().value
    if (oldestKey !== undefined) refreshedTokens.delete(oldestKey)
  }
  refreshedTokens.set(oldToken, { epoch, accessToken: newToken })
}

function decodeJwtSubject(token: string | null): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const parsed = JSON.parse(atob(padded)) as { sub?: unknown }
    return typeof parsed.sub === 'string' && parsed.sub ? parsed.sub : null
  } catch {
    return null
  }
}

export function isSameTokenSubject(first: string | null, second: string | null): boolean {
  const firstSub = decodeJwtSubject(first)
  const secondSub = decodeJwtSubject(second)
  return Boolean(firstSub && secondSub && firstSub === secondSub)
}

export function getAccessToken(): string | null {
  if (useMemoryStorage) return memoryToken
  try {
    memoryToken = localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    useMemoryStorage = true
    // Keep the current tab usable when browser storage is unavailable.
  }
  return memoryToken
}

export function setAccessToken(token: string | null): void {
  bumpSessionEpoch()
  writeAccessToken(token)
}

export function getRefreshToken(): string | null {
  if (useMemoryRefreshStorage) return memoryRefreshToken
  try {
    memoryRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    useMemoryRefreshStorage = true
    // Keep the current tab usable when browser storage is unavailable.
  }
  return memoryRefreshToken
}

export function setRefreshToken(token: string | null): void {
  writeRefreshToken(token)
}

export function expireSession(message = 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.'): void {
  bumpSessionEpoch()
  writeAccessToken(null)
  writeRefreshToken(null)
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { message } }))
}

const baseURL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') || 'http://localhost:3000/api/v1'

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15_000,
  // Axios sets JSON for object bodies and the correct multipart boundary for FormData.
  headers: { Accept: 'application/json' },
})

const refreshClient = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
})

async function performTokenRefresh(expiredToken: string): Promise<string> {
  const refreshEpoch = sessionEpoch
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    throw new Error('Missing refresh token')
  }

  try {
    const { data } = await refreshClient.post<RefreshResponsePayload>('/auth/refresh', { refreshToken })
    if (sessionEpoch !== refreshEpoch) {
      throw new axios.CanceledError('Session changed while refreshing token')
    }
    if (!data?.accessToken || typeof data.accessToken !== 'string') {
      throw new Error('Invalid refresh response')
    }
    writeAccessToken(data.accessToken)
    if (typeof data.refreshToken === 'string' && data.refreshToken) {
      writeRefreshToken(data.refreshToken)
    }
    rememberRefreshedToken(expiredToken, data.accessToken, refreshEpoch)
    window.dispatchEvent(new CustomEvent(TOKEN_REFRESHED_EVENT, {
      detail: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      },
    }))
    return data.accessToken
  } catch (refreshError) {
    if (sessionEpoch === refreshEpoch && !axios.isCancel(refreshError)) {
      if (axios.isAxiosError(refreshError)) {
        const status = refreshError.response?.status
        if (status === 400 || status === 401 || status === 403) {
          expireSession(getApiErrorMessage(refreshError))
        }
      } else {
        expireSession()
      }
    }
    throw refreshError
  }
}

// Installed once per module, so StrictMode never adds duplicate interceptors.
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) {
      return Promise.reject(error)
    }

    const originalConfig = error.config as RetryableRequestConfig
    const requestPath = (originalConfig.url ?? '').split('?')[0]
    const isPublicAuthEndpoint = /\/auth\/(login|register|forgot-password|reset-password|refresh|logout)\/?$/.test(requestPath)
    if (isPublicAuthEndpoint) {
      return Promise.reject(error)
    }

    const authorization = typeof originalConfig.headers?.get === 'function'
      ? originalConfig.headers.get('Authorization')
      : undefined
    const requestToken = typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : null

    if (!requestToken) {
      return Promise.reject(error)
    }

    if (!originalConfig._retry) {
      const refreshed = refreshedTokens.get(requestToken)
      if (refreshed && refreshed.epoch === sessionEpoch && getAccessToken() === refreshed.accessToken) {
        if (originalConfig.signal?.aborted) {
          return Promise.reject(error)
        }
        originalConfig._retry = true
        originalConfig.headers.set('Authorization', `Bearer ${refreshed.accessToken}`)
        return api(originalConfig)
      }
    }

    const currentToken = getAccessToken()
    if (!currentToken || requestToken !== currentToken) {
      return Promise.reject(error)
    }

    const refreshToken = getRefreshToken()
    if (originalConfig._retry || !refreshToken) {
      expireSession(getApiErrorMessage(error))
      return Promise.reject(error)
    }

    if (!refreshPromise) {
      refreshPromise = performTokenRefresh(requestToken).finally(() => {
        refreshPromise = null
      })
    }

    try {
      const newAccessToken = await refreshPromise
      if (originalConfig.signal?.aborted) {
        return Promise.reject(error)
      }
      originalConfig._retry = true
      originalConfig.headers.set('Authorization', `Bearer ${newAccessToken}`)
      return api(originalConfig)
    } catch (refreshError) {
      return Promise.reject(refreshError)
    }
  },
)

const errorTranslations: Record<string, string> = {
  'Email or password is incorrect': 'Email hoặc mật khẩu chưa đúng.',
  'Email is already registered': 'Email này đã được đăng ký. Bạn hãy đăng nhập.',
  'Invalid or expired token': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  'Token has been revoked': 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
  'Bearer token is required': 'Vui lòng đăng nhập để tiếp tục.',
  'Account no longer exists': 'Tài khoản không còn tồn tại.',
  'Account permissions have changed. Please sign in again': 'Quyền tài khoản đã thay đổi. Vui lòng đăng nhập lại.',
  'email must be an email': 'Vui lòng nhập địa chỉ email hợp lệ.',
  'password must be longer than or equal to 6 characters': 'Mật khẩu cần có ít nhất 6 ký tự.',
  'password must be shorter than or equal to 72 bytes': 'Mật khẩu không được vượt quá 72 byte.',
  'fullName should not be empty': 'Vui lòng nhập họ và tên.',
  'fullName must be shorter than or equal to 100 characters': 'Họ và tên không được quá 100 ký tự.',
  'Invalid or expired password reset token': 'Mã xác nhận không đúng hoặc đã hết hạn.',
  'Password reset token has expired. Please request a new one': 'Mã xác nhận đã hết hạn. Vui lòng gửi lại yêu cầu mã mới.',
  'Password must be at least 6 characters': 'Mật khẩu mới cần có ít nhất 6 ký tự.',
  'Password cannot exceed 72 bytes': 'Mật khẩu mới không được vượt quá 72 byte.',
  'Invalid email address': 'Vui lòng nhập địa chỉ email hợp lệ.',
  'Reset token is required': 'Vui lòng nhập mã xác nhận.',
  'Current password is incorrect': 'Mật khẩu hiện tại không chính xác.',
  'New password must be different from current password': 'Mật khẩu mới phải khác mật khẩu hiện tại.',
  'Current password is required': 'Vui lòng nhập mật khẩu hiện tại.',
  'currentPassword should not be empty': 'Vui lòng nhập mật khẩu hiện tại.',
  'currentPassword must be a string': 'Mật khẩu hiện tại không hợp lệ.',
  'newPassword must be longer than or equal to 6 characters': 'Mật khẩu mới cần có ít nhất 6 ký tự.',
  'newPassword must be shorter than or equal to 72 bytes': 'Mật khẩu mới không được vượt quá 72 byte.',
  'Refresh token is required': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  'Refresh token must be a string': 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  'Invalid or expired refresh token': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  'Invalid refresh token': 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  'Refresh token has been revoked': 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
  'Refresh token cannot be used as access token': 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  'ThrottlerException: Too Many Requests': 'Bạn đang thao tác quá nhanh, vui lòng thử lại sau vài giây!',
  'Too Many Requests': 'Bạn đang thao tác quá nhanh, vui lòng thử lại sau vài giây!',
}

export function getApiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError<{ message?: string | string[] }>(error)) {
    return 'Có lỗi xảy ra. Vui lòng thử lại.'
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.'
  }
  if (!error.response) {
    return 'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.'
  }

  const message = error.response.data?.message
  const messages = Array.isArray(message) ? message : [message]
  const translated = messages
    .filter((item): item is string => typeof item === 'string')
    .map((item) => errorTranslations[item])
    .filter(Boolean)
  if (translated.length) return [...new Set(translated)].join(' ')

  switch (error.response.status) {
    case 400:
      return 'Thông tin chưa hợp lệ. Vui lòng kiểm tra và thử lại.'
    case 401:
      return 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.'
    case 403:
      return 'Bạn chưa có quyền truy cập chức năng này.'
    case 404:
      return 'Không tìm thấy chức năng này trên máy chủ.'
    case 409:
      return 'Thông tin này đã được sử dụng. Vui lòng kiểm tra lại.'
    case 429:
      return 'Bạn đang thao tác quá nhanh, vui lòng thử lại sau vài giây!'
    default:
      return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.'
  }
}

export default api
