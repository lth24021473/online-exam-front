import { readAccountProfile } from '../profile/account-profile-storage'

export interface UserDisplayInfo {
  fullName: string
  email: string
  avatar: string | null
  initial: string
}

export function getUserDisplayInfo(
  user?: {
    id?: string
    userId?: string
    fullName?: string | null
    email?: string | null
    avatar?: string | null
  } | null,
  currentUser?: {
    id: string
    fullName: string
    avatar?: string | null
  } | null,
): UserDisplayInfo {
  if (!user) {
    return {
      fullName: 'Chưa cập nhật',
      email: '—',
      avatar: null,
      initial: '?',
    }
  }

  const id = user.userId || user.id
  const isMe = Boolean(currentUser && id && id === currentUser.id)

  // 1. Full name resolution
  let fullName = user.fullName?.trim() || ''

  if (id) {
    try {
      const localProfile = readAccountProfile(id, fullName)
      if (localProfile?.fullName?.trim()) {
        fullName = localProfile.fullName.trim()
      }
    } catch {
      // ignore
    }
  }

  if (isMe && currentUser?.fullName?.trim()) {
    fullName = currentUser.fullName.trim()
  }

  if (!fullName) {
    fullName = 'Chưa cập nhật'
  }

  // 2. Avatar resolution
  let avatar = user.avatar ?? null

  if (id) {
    try {
      const isRemoved = localStorage.getItem(`online-exam.avatar-removed.${id}`)
      if (isRemoved) {
        avatar = null
      } else {
        const localAvatar = localStorage.getItem(`online-exam.avatar.${id}`)
        if (localAvatar) {
          avatar = localAvatar
        }
      }
    } catch {
      // ignore
    }
  }

  if (isMe && currentUser?.avatar !== undefined) {
    avatar = currentUser.avatar
  }

  const initial = fullName
    ? fullName.charAt(0).toUpperCase()
    : '?'

  return {
    fullName,
    email: user.email || '—',
    avatar,
    initial,
  }
}
