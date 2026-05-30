import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../api/auth'

export default function ForgotPassword() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await forgotPassword(email)
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="card w-full max-w-sm text-center">
          <div className="text-4xl mb-4">✉️</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Check your email</h2>
          <p className="text-gray-500 text-sm mb-4">
            If <strong>{email}</strong> is registered, you'll receive a password reset link shortly.
          </p>
          <Link to="/login" className="text-xs text-blue-600 hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Reset your password</h1>
        <p className="text-gray-500 text-xs mb-6">
          Enter your email and we'll send you a reset link.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-5">
          <Link to="/login" className="text-blue-600 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
