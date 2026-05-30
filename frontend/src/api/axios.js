import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export function getAccessToken() { return localStorage.getItem('accessToken') }
export function setTokens(access, refresh) {
  localStorage.setItem('accessToken', access)
  localStorage.setItem('refreshToken', refresh)
}
export function clearTokens() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let isRefreshing = false
let failedQueue = []

function processQueue(error) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve()))
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry && !original.url.startsWith('/auth/')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(() => api(original)).catch((e) => Promise.reject(e))
      }

      original._retry = true
      isRefreshing = true

      try {
        const refreshToken = localStorage.getItem('refreshToken')
        const { data } = await axios.post('/api/auth/refresh', { refreshToken })
        setTokens(data.accessToken, data.refreshToken)
        processQueue(null)
        return api(original)
      } catch (refreshError) {
        processQueue(refreshError)
        clearTokens()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

export default api
