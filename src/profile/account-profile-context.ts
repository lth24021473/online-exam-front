import { createContext } from 'react'
import type { AccountProfile } from './account-profile-storage'

export interface AccountProfileContextValue {
  profile: AccountProfile
  saveProfile: (draft: AccountProfile) => AccountProfile
}

export const AccountProfileContext = createContext<AccountProfileContextValue | null>(null)
