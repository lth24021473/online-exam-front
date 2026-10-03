import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ThemeContext } from './theme-context'
import { applyTheme, getStoredTheme, saveTheme } from './theme-storage'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(getStoredTheme)

  useLayoutEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => current === 'dark' ? 'light' : 'dark')
  }, [])

  const value = useMemo(() => ({ theme, isDarkMode: theme === 'dark', toggleTheme }), [theme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
