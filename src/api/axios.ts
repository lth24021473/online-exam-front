import axios from 'axios'

export const ACCESS_TOKEN_KEY = 'online-exam.access-token'
export const SESSION_EXPIRED_EVENT = 'online-exam:session-expired'

let memoryToken: string | null = null
let useMemoryStorage = false

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

const baseURL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') || 'http://localhost:3000/api/v1'

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15_000,
  // Axios sets JSON for object bodies and the correct multipart boundary for FormData.
  headers: { Accept: 'application/json' },
})

// Installed once per module, so StrictMode never adds duplicate interceptors.
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const authorization = error.config?.headers.get('Authorization')
      const token = getAccessToken()
      const isAuthForm = /\/auth\/(login|register)\/?$/.test(error.config?.url ?? '')
      if (token && authorization === `Bearer ${token}` && !isAuthForm) {
        setAccessToken(null)
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
      }
    }
    return Promise.reject(error)
  },
)

const errorTranslations: Record<string, string> = {
  'Email or password is incorrect': 'Email hoặc mật khẩu chưa đúng.',
  'Email is already registered': 'Email này đã được đăng ký. Bạn hãy đăng nhập.',
  'Invalid or expired token': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  'Token has been revoked': 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
  'Bearer token is required': 'Vui lòng đăng nhập để tiếp tục.',
  'Account no longer exists': 'Tài khoản không còn tồn tại.',
  'email must be an email': 'Vui lòng nhập địa chỉ email hợp lệ.',
  'password must be longer than or equal to 6 characters': 'Mật khẩu cần có ít nhất 6 ký tự.',
  'password must be shorter than or equal to 72 bytes': 'Mật khẩu không được vượt quá 72 byte.',
  'fullName should not be empty': 'Vui lòng nhập họ và tên.',
  'fullName must be shorter than or equal to 100 characters': 'Họ và tên không được quá 100 ký tự.',
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
      return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.'
    default:
      return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.'
  }
}

export default api
