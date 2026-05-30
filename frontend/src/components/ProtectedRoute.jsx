import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, roles }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center text-gray-400">Loading…</div>
  }

  if (!user) return <Navigate to="/login" replace />

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium">Access denied</p>
          <p className="text-gray-500 text-xs mt-1">Required role: {roles.join(' or ')}</p>
        </div>
      </div>
    )
  }

  return children
}
