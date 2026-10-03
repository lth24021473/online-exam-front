import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '../api/auth.api'
import { useAuth } from '../auth/useAuth'
import { AccountProfileContext } from './account-profile-context'
import { readAccountProfile, writeAccountProfile } from './account-profile-storage'
import type { AccountProfile } from './account-profile-storage'

function AccountProfileSession({ user, children }: { user: AuthUser | null, children: ReactNode }) {
  const [profile, setProfile] = useState<AccountProfile>(() => user
    ? readAccountProfile(user.id, user.fullName)
    : { fullName: '', workplace: '', currentResidence: '' })

  const saveProfile = useCallback((draft: AccountProfile) => {
    if (!user) throw new Error('Vui lòng đăng nhập để chỉnh sửa thông tin tài khoản.')
    const savedProfile = writeAccountProfile(user.id, draft)
    setProfile(savedProfile)
    return savedProfile
  }, [user])

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
