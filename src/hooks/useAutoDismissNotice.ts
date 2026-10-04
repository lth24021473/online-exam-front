import { useCallback, useEffect, useState } from 'react'

export function useAutoDismissNotice(initialText = '') {
  const [notice, setNotice] = useState({ text: initialText })
  const updateNotice = useCallback((text: string) => {
    // A fresh object restarts the timer even when the same message is shown again.
    setNotice({ text })
  }, [])

  useEffect(() => {
    if (!notice.text) return
    const timeout = window.setTimeout(() => setNotice({ text: '' }), 2000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  return [notice.text, updateNotice] as const
}
