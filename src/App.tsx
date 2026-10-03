import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { AccountProfileProvider } from './profile/AccountProfileProvider'
import AppRouter from './router/AppRouter'
import { ThemeProvider } from './theme/ThemeProvider'
import './App.css'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AccountProfileProvider>
            <AppRouter />
          </AccountProfileProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
