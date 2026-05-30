import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { label: 'Dashboard',     to: '/dashboard', roles: ['ADMIN', 'REVIEWER', 'OPERATOR'] },
  { label: 'Shifts',        to: '/shifts',    roles: ['ADMIN', 'REVIEWER', 'OPERATOR'] },
  { label: 'Daily Summary', to: '/daily',     roles: ['ADMIN', 'REVIEWER', 'OPERATOR'] },
  { label: 'Packs',         to: '/packs',     roles: ['ADMIN'] },
  { label: 'Users',         to: '/users',     roles: ['ADMIN'] },
  { label: 'Reports',       to: '/reports',   roles: ['ADMIN', 'REVIEWER'] },
  { label: 'Audit',         to: '/audit',     roles: ['ADMIN'] },
  { label: 'Settings',      to: '/settings',  roles: ['ADMIN'] },
]

const ROLE_COLORS = {
  ADMIN:       'badge-red',
  REVIEWER:    'badge-blue',
  OPERATOR:    'badge-green',
  SUPER_ADMIN: 'badge-gray',
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="w-full px-6 h-14 flex items-center justify-between">
          <Link to="/shifts" className="font-bold text-blue-600 text-base tracking-tight">
            PackTrack
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {NAV.filter((n) => n.roles.includes(user?.role)).map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  location.pathname.startsWith(n.to)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className={ROLE_COLORS[user?.role] || 'badge-gray'}>{user?.role}</span>
            <span className="text-gray-600 text-xs hidden sm:inline">{user?.name}</span>
            <button onClick={handleLogout} className="btn-secondary btn-sm">Logout</button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="sm:hidden flex overflow-x-auto gap-1 px-4 pb-2">
          {NAV.filter((n) => n.roles.includes(user?.role)).map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`shrink-0 px-3 py-1 rounded-md text-xs font-medium ${
                location.pathname.startsWith(n.to)
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600'
              }`}
            >
              {n.label}
            </Link>
          ))}
        </div>
      </header>

      <main className="flex-1 w-full px-6 py-6">{children}</main>
    </div>
  )
}