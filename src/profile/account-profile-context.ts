import { createContext } from 'react'
import type { AccountProfile } from './account-profile-storage'

interface AccountProfileContextValue {
  profile: AccountProfile
  saveProfile: (draft: AccountProfile) => AccountProfile
}

export const AccountProfileContext = createContext<AccountProfileContextValue | null>(null)
