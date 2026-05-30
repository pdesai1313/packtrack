import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../api/auth'

export default function ResetPassword() {
  const [searchParams]        = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  const token = searchParams.get('token')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (!token)               { setError('Invalid reset link');     return }
    setLoading(true)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="card w-full max-w-sm text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Password updated</h2>
          <p className="text-gray-500 text-sm mb-4">You can now sign in with your new password.</p>
          <Link to="/login" className="btn-primary inline-block text-sm">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Set new password</h1>
        <p className="text-gray-500 text-xs mb-6">Choose a password with at least 8 characters.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">New Password</label>
            <input
              className="input"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
