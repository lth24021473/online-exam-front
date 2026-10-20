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
  let fullName = user.fullName?.trim() || 'Chưa cập nhật'
  let avatar = user.avatar ?? null

  // If this target user matches the currently logged in user, prioritize local session
  if (currentUser && id && id === currentUser.id) {
    if (currentUser.fullName) {
      fullName = currentUser.fullName.trim()
    }
    if (currentUser.avatar) {
      avatar = currentUser.avatar
    }
  }

  // Check localStorage profile and avatar overrides
  if (id) {
    try {
      const localProfile = readAccountProfile(id, fullName)
      if (localProfile?.fullName) {
        fullName = localProfile.fullName.trim()
      }
    } catch {
      // ignore
    }

    try {
      const localAvatar = localStorage.getItem(`online-exam.avatar.${id}`)
      if (localAvatar) {
        avatar = localAvatar
      }
    } catch {
      // ignore
    }
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
