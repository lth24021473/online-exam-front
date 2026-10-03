import { useContext } from 'react'
import { AccountProfileContext } from './account-profile-context'

export function useAccountProfile() {
  const context = useContext(AccountProfileContext)
  if (!context) throw new Error('useAccountProfile must be used inside AccountProfileProvider')
  return context
}
