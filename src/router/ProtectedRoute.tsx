import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function ProtectedRoute() {
  const { loading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        <span className="loading-spinner" aria-hidden="true" />
        Đang kiểm tra phiên đăng nhập…
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  return <Outlet />
}

export default ProtectedRoute
