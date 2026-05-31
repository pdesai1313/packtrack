import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { verifyEmail } from '../api/auth'

export default function VerifyEmail() {
  const [searchParams]      = useSearchParams()
  const { loginFromTokens } = useAuth()
  const [status, setStatus] = useState('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { setStatus('error'); setErrorMsg('No verification token found in the link.'); return }

    verifyEmail(token)
      .then((data) => {
        loginFromTokens(data)
        setStatus('success')
        // Use full redirect so AuthContext re-initializes cleanly with stored tokens
        setTimeout(() => { window.location.href = '/shifts' }, 2000)
      })
      .catch((err) => {
        setStatus('error')
        setErrorMsg(err.response?.data?.error || 'Verification failed. The link may have expired.')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="card w-full max-w-sm text-center">
        {status === 'loading' && (
          <>
            <div className="text-4xl mb-4 animate-pulse">🔐</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Verifying your email…</h2>
            <p className="text-gray-400 text-sm">Just a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Email verified!</h2>
            <p className="text-gray-500 text-sm mb-4">Taking you to the app…</p>
            <a href="/shifts" className="btn-primary inline-block text-sm">
              Enter app →
            </a>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-4xl mb-4">❌</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Verification failed</h2>
            <p className="text-gray-500 text-sm mb-4">{errorMsg}</p>
            <Link to="/login" className="btn-primary inline-block text-sm">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
