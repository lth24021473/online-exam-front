import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getAuthDestination } from './authRedirect'

export function GuestRoute() {
  const { loading, isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        <span className="loading-spinner" aria-hidden="true" />
        Đang kiểm tra phiên đăng nhập…
      </div>
    )
  }
  if (isAuthenticated) return <Navigate to={getAuthDestination(location.state, user?.role)} replace />
  return <Outlet />
}

export default GuestRoute
