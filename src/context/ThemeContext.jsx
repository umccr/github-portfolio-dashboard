import { createContext, useContext, useState, useEffect } from 'react'
import { STORAGE_KEYS } from '../config/dashboard'

const ThemeCtx = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.theme)

      if (stored === 'dark' || stored === 'light') {
        return stored
      }

      if (stored !== null) {
        console.warn(
          `Invalid theme value found in localStorage: "${stored}". Falling back to 'dark'.`,
        )
      }
    } catch (error) {
      console.warn('Failed to read theme from localStorage:', error)
    }

    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme)
    } catch (error) {
      console.warn('Failed to save theme to localStorage:', error)
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  return <ThemeCtx.Provider value={{ theme, toggleTheme }}>{children}</ThemeCtx.Provider>
}

export const useTheme = () => {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
