export interface AccountProfile {
  fullName: string
  workplace: string
  currentResidence: string
}

const storagePrefix = 'online-exam.profile.'

export function normalizeAccountProfile(draft: AccountProfile): AccountProfile {
  if (typeof draft.fullName !== 'string' || typeof draft.workplace !== 'string' || typeof draft.currentResidence !== 'string') {
    throw new Error('Thông tin tài khoản không hợp lệ. Vui lòng kiểm tra và thử lại.')
  }

  const fullName = draft.fullName.trim().replace(/\s+/g, ' ')
  const workplace = draft.workplace.trim()
  const currentResidence = draft.currentResidence.trim()

  if (!fullName) throw new Error('Vui lòng nhập tên tài khoản.')
  if (fullName.length > 100) throw new Error('Tên tài khoản phải có tối đa 100 ký tự.')
  if (workplace.length > 150) throw new Error('Nơi làm việc phải có tối đa 150 ký tự.')
  if (currentResidence.length > 150) throw new Error('Nơi ở hiện tại phải có tối đa 150 ký tự.')

  return { fullName, workplace, currentResidence }
}

export function recordProfileSync(userId: string, timestamp: number | string = Date.now()) {
  try {
    const time = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime()
    if (time > 0) {
      localStorage.setItem(`online-exam.profile-sync.${userId}`, String(time))
    }
  } catch {
    // ignore
  }
}

export function readAccountProfile(
  userId: string,
  defaultFullName: string,
  defaultWorkplace = '',
  defaultResidence = '',
  serverUpdatedAt?: string,
): AccountProfile {
  const fallback = { fullName: defaultFullName, workplace: defaultWorkplace, currentResidence: defaultResidence }
  try {
    const stored = localStorage.getItem(`${storagePrefix}${userId}`)
    if (!stored) return fallback
    const value: unknown = JSON.parse(stored)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
    const fields = value as Record<string, unknown>
    if (typeof fields.fullName !== 'string' || typeof fields.workplace !== 'string' || typeof fields.currentResidence !== 'string') return fallback

    const syncRaw = localStorage.getItem(`online-exam.profile-sync.${userId}`)
    const lastSyncTime = syncRaw ? Number(syncRaw) || new Date(syncRaw).getTime() : 0
    const serverTime = serverUpdatedAt ? new Date(serverUpdatedAt).getTime() : 0

    if (serverTime > 0 && serverTime > lastSyncTime) {
      const serverProfile: AccountProfile = {
        fullName: defaultFullName || fields.fullName,
        workplace: defaultWorkplace || fields.workplace,
        currentResidence: defaultResidence || fields.currentResidence,
      }
      try {
        localStorage.setItem(`${storagePrefix}${userId}`, JSON.stringify(serverProfile))
        recordProfileSync(userId, serverTime)
      } catch {
        // ignore cache write error
      }
      return normalizeAccountProfile(serverProfile)
    }

    return normalizeAccountProfile({
      fullName: fields.fullName,
      workplace: fields.workplace || defaultWorkplace,
      currentResidence: fields.currentResidence || defaultResidence,
    })
  } catch {
    return fallback
  }
}

export function writeAccountProfile(userId: string, draft: AccountProfile): AccountProfile {
  const profile = normalizeAccountProfile(draft)
  try {
    localStorage.setItem(`${storagePrefix}${userId}`, JSON.stringify(profile))
    recordProfileSync(userId, Date.now())
  } catch (error) {
    const isQuotaError = error instanceof DOMException &&
      ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(error.name)
    throw new Error(isQuotaError
      ? 'Bộ nhớ trình duyệt đã đầy. Hãy giải phóng bộ nhớ rồi thử lại.'
      : 'Không thể lưu thông tin tài khoản trên trình duyệt này. Vui lòng kiểm tra quyền lưu trữ rồi thử lại.', { cause: error })
  }
  return profile
}

