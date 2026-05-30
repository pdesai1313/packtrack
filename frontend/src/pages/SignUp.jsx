import { useState } from 'react'
import { Link } from 'react-router-dom'
import { signup } from '../api/auth'

export default function SignUp() {
  const [form, setForm] = useState({ orgName: '', name: '', email: '', password: '', confirm: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await signup({ orgName: form.orgName, name: form.name, email: form.email, password: form.password })
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Sign up failed')
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
            We sent a verification link to <strong>{form.email}</strong>.<br />
            Click it to activate your account.
          </p>
          <p className="text-xs text-gray-400">
            Already verified?{' '}
            <Link to="/login" className="text-blue-600 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Create your account</h1>
        <p className="text-gray-500 text-xs mb-6">Start tracking lottery packs for your store</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Store Name</label>
            <input
              className="input"
              type="text"
              placeholder="Joe's Corner Store"
              value={form.orgName}
              onChange={set('orgName')}
              required
            />
          </div>
          <div>
            <label className="label">Your Name</label>
            <input
              className="input"
              type="text"
              placeholder="John Smith"
              value={form.name}
              onChange={set('name')}
              required
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="john@example.com"
              value={form.email}
              onChange={set('email')}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={set('password')}
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={form.confirm}
              onChange={set('confirm')}
              required
            />
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
