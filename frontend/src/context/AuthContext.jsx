import { createContext, useContext, useEffect, useState } from 'react'
import { getMe, login as apiLogin, logout as apiLogout } from '../api/auth'
import { setTokens, clearTokens, getAccessToken } from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading, null = unauthenticated

  useEffect(() => {
    if (!getAccessToken()) { setUser(null); return }
    getMe()
      .then(setUser)
      .catch(() => { clearTokens(); setUser(null) })
  }, [])

  async function login(email, password) {
    const data = await apiLogin(email, password)
    setTokens(data.accessToken, data.refreshToken)
    setUser(data.user)
    return data.user
  }

  // Used after email verification — tokens already issued by the API
  function loginFromTokens(data) {
    setTokens(data.accessToken, data.refreshToken)
    setUser(data.user)
    return data.user
  }

  function logout() {
    // Clear local session immediately — don't wait for server
    clearTokens()
    setUser(null)
    // Fire-and-forget server call (server doesn't track sessions anyway)
    apiLogout().catch(() => {})
  }

  return (
    <AuthContext.Provider value={{ user, login, loginFromTokens, logout, isLoading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}