import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '../api/auth.api'
import { useAuth } from '../auth/useAuth'
import { AccountProfileContext } from './account-profile-context'
import { readAccountProfile, writeAccountProfile } from './account-profile-storage'
import type { AccountProfile } from './account-profile-storage'

import { authApi } from '../api/auth.api'

function AccountProfileSession({ user, children }: { user: AuthUser | null, children: ReactNode }) {
  const { updateUser } = useAuth()
  const [profile, setProfile] = useState<AccountProfile>(() => user
    ? readAccountProfile(user.id, user.fullName, user.workplace || '', user.currentResidence || '', user.updatedAt)
    : { fullName: '', workplace: '', currentResidence: '' })

  useEffect(() => {
    if (user) {
      setProfile((prev) => {
        const next = readAccountProfile(user.id, user.fullName, user.workplace || '', user.currentResidence || '', user.updatedAt)
        return (prev.fullName === next.fullName && prev.workplace === next.workplace && prev.currentResidence === next.currentResidence)
          ? prev
          : next
      })
    }
  }, [user])

  const saveProfile = useCallback((draft: AccountProfile) => {
    if (!user) throw new Error('Vui lòng đăng nhập để chỉnh sửa thông tin tài khoản.')
    const savedProfile = writeAccountProfile(user.id, draft)
    setProfile(savedProfile)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('online-exam:profile-updated', {
        detail: { userId: user.id, profile: savedProfile }
      }))
    }
    authApi.updateProfile({
      fullName: savedProfile.fullName,
      workplace: savedProfile.workplace,
      currentResidence: savedProfile.currentResidence,
    }).then((updatedUser) => {
      if (updatedUser && updatedUser.fullName === savedProfile.fullName) {
        updateUser(updatedUser)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('online-exam:profile-updated', {
            detail: { userId: user.id, user: updatedUser }
          }))
        }
      }
    }).catch(() => {
      // Background sync; keep local cache working seamlessly
    })
    return savedProfile
  }, [user, updateUser])

  const value = useMemo(() => ({ profile, saveProfile }), [profile, saveProfile])
  return <AccountProfileContext.Provider value={value}>{children}</AccountProfileContext.Provider>
}

export function AccountProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return (
    <AccountProfileSession key={user ? `account:${user.id}` : 'signed-out'} user={user}>
      {children}
    </AccountProfileSession>
  )
}
