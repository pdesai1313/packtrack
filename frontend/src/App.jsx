import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

import Login          from './pages/Login'
import SignUp         from './pages/SignUp'
import VerifyEmail    from './pages/VerifyEmail'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword  from './pages/ResetPassword'

import Dashboard      from './pages/Dashboard'
import Shifts         from './pages/Shifts'
import LiveScan       from './pages/LiveScan'
import CommitShift    from './pages/CommitShift'
import DailySummary   from './pages/DailySummary'
import Exceptions     from './pages/Exceptions'
import PackManagement from './pages/PackManagement'
import Settings       from './pages/Settings'
import Reports        from './pages/Reports'
import Users          from './pages/Users'
import AuditLog       from './pages/AuditLog'

function AuthRedirect() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  return user ? <Navigate to="/shifts" replace /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login"          element={<Login />} />
      <Route path="/signup"         element={<SignUp />} />
      <Route path="/verify-email"   element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Root redirect */}
      <Route path="/" element={<AuthRedirect />} />

      {/* Protected app routes */}
      <Route path="/dashboard"              element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/shifts"                 element={<ProtectedRoute><Layout><Shifts /></Layout></ProtectedRoute>} />
      <Route path="/shifts/:id/scan"        element={<ProtectedRoute><Layout><LiveScan /></Layout></ProtectedRoute>} />
      <Route path="/shifts/:id/commit"      element={<ProtectedRoute roles={['ADMIN','REVIEWER']}><Layout><CommitShift /></Layout></ProtectedRoute>} />
      <Route path="/shifts/:id/exceptions"  element={<ProtectedRoute roles={['ADMIN','REVIEWER']}><Layout><Exceptions /></Layout></ProtectedRoute>} />
      <Route path="/daily"                  element={<ProtectedRoute><Layout><DailySummary /></Layout></ProtectedRoute>} />
      <Route path="/packs"                  element={<ProtectedRoute roles={['ADMIN']}><Layout><PackManagement /></Layout></ProtectedRoute>} />
      <Route path="/settings"               element={<ProtectedRoute roles={['ADMIN']}><Layout><Settings /></Layout></ProtectedRoute>} />
      <Route path="/reports"                element={<ProtectedRoute roles={['ADMIN','REVIEWER']}><Layout><Reports /></Layout></ProtectedRoute>} />
      <Route path="/users"                  element={<ProtectedRoute roles={['ADMIN']}><Layout><Users /></Layout></ProtectedRoute>} />
      <Route path="/audit"                  element={<ProtectedRoute roles={['ADMIN']}><Layout><AuditLog /></Layout></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}