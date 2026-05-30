import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { resendVerification } from '../api/auth'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [unverifiedEmail, setUnverifiedEmail] = useState(null)
  const [resendSent, setResendSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setUnverifiedEmail(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/shifts')
    } catch (err) {
      const data = err.response?.data
      if (data?.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(email)
        setError(data.error)
      } else {
        setError(data?.error || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    try {
      await resendVerification(unverifiedEmail)
      setResendSent(true)
    } catch {
      setError('Could not resend. Try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">PackTrack</h1>
        <p className="text-gray-500 text-xs mb-6">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Password</label>
              <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <p className="text-red-600 text-xs">{error}</p>
              {unverifiedEmail && !resendSent && (
                <button
                  type="button"
                  onClick={handleResend}
                  className="text-xs text-blue-600 hover:underline mt-1"
                >
                  Resend verification email
                </button>
              )}
              {resendSent && (
                <p className="text-xs text-green-600 mt-1">Verification email sent — check your inbox.</p>
              )}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-5">
          Don't have an account?{' '}
          <Link to="/signup" className="text-blue-600 hover:underline font-medium">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  )
}
