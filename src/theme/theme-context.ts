import { createContext } from 'react'
import type { Theme } from './theme-storage'

interface ThemeContextValue {
  theme: Theme
  isDarkMode: boolean
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
