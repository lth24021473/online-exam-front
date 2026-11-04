import { useEffect, useRef, useState } from 'react'

/**
 * Shared hook to coordinate multi-tab state and profile synchronization.
 * Listens for window focus, visibility change, profile update events, and relevant localStorage changes.
 */
export function useTabSync(onSyncCallback?: (silent: boolean) => void): number {
  const [tick, setTick] = useState(0)
  const callbackRef = useRef(onSyncCallback)
  callbackRef.current = onSyncCallback

  useEffect(() => {
    const onSync = () => {
      setTick((t) => t + 1)
      callbackRef.current?.(true)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setTick((t) => t + 1)
        callbackRef.current?.(true)
      }
    }

    const onStorage = (e: StorageEvent) => {
      if (
        !e.key ||
        e.key.startsWith('online-exam.profile.') ||
        e.key.startsWith('online-exam.avatar.') ||
        e.key.startsWith('online-exam.avatar-removed.')
      ) {
        setTick((t) => t + 1)
        callbackRef.current?.(true)
      }
    }

    window.addEventListener('focus', onSync)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online-exam:profile-updated', onSync)
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener('focus', onSync)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online-exam:profile-updated', onSync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return tick
}
