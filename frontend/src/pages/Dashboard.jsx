import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getShifts } from '../api/shifts'
import { getReport } from '../api/reports'
import { getGroceryEntries } from '../api/grocery'
import { getAuditLogs } from '../api/audit'

function today() { return new Date().toISOString().split('T')[0] }

function fmt(n) {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const ACTION_COLOR = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  COMMIT: 'bg-purple-100 text-purple-700',
}

const ENTITY_DOT = {
  SHIFT:   'bg-blue-400',
  PACK:    'bg-amber-400',
  GROCERY: 'bg-emerald-400',
  USER:    'bg-gray-400',
}

function KPICard({ label, value, sub, accent, onClick }) {
  return (
    <div
      className={`rounded-2xl border bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md ${
        accent ? 'border-blue-100' : 'border-gray-100'
      } ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${accent ? 'text-blue-600' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const t = today()

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: getShifts,
  })

  const { data: report } = useQuery({
    queryKey: ['reports', t, t],
    queryFn: () => getReport(t, t),
  })

  const { data: grocery = [] } = useQuery({
    queryKey: ['grocery', t, t],
    queryFn: () => getGroceryEntries(t, t),
  })

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['audit', { limit: 10 }],
    queryFn: () => getAuditLogs({ limit: 10 }),
    enabled: user?.role === 'ADMIN',
  })

  const openShifts  = shifts.filter((s) => s.status === 'OPEN')
  const closedToday = shifts.filter((s) => s.status === 'CLOSED' && s.date === t)

  const todayLottery = report?.summary?.instantSale ?? null
  const todayGrocery = grocery.reduce((sum, e) => sum + (e.creditDebit ?? 0) + (e.ebt ?? 0) + (e.cashSales ?? 0), 0)
  const groceryHasData = grocery.length > 0

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const canViewReports = ['ADMIN', 'REVIEWER'].includes(user?.role)

  return (
    <div className="max-w-6xl">

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div className="mb-7">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
          {greeting}, {user?.name?.split(' ')[0]} 👋
        </h2>
        <p className="text-gray-400 text-sm mt-0.5">{dateLabel}</p>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard
          label="Open Shifts"
          value={shiftsLoading ? '…' : openShifts.length}
          sub={openShifts.length > 0 ? openShifts.map((s) => s.shiftTag).join(' · ') : 'No open shifts'}
          accent={openShifts.length > 0}
          onClick={() => navigate('/shifts')}
        />
        <KPICard
          label="Today's Lottery"
          value={todayLottery != null ? fmt(todayLottery) : '—'}
          sub={report?.summary ? `${report.summary.totalUnits} units · ${report.summary.shiftsCount} shift${report.summary.shiftsCount !== 1 ? 's' : ''}` : 'No data yet'}
        />
        <KPICard
          label="Today's Grocery"
          value={groceryHasData ? fmt(todayGrocery) : '—'}
          sub={groceryHasData ? `${grocery.length} entr${grocery.length !== 1 ? 'ies' : 'y'}` : 'No entries today'}
        />
        <KPICard
          label="Closed Today"
          value={closedToday.length}
          sub={closedToday.length > 0 ? closedToday.map((s) => s.shiftTag).join(' · ') : 'None yet'}
        />
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      {!['OPERATOR'].includes(user?.role) && (
        <div className="mb-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary btn-sm"
              onClick={() => navigate('/shifts')}
            >
              + New Shift
            </button>
            <button
              className="btn-secondary btn-sm"
              onClick={() => navigate('/grocery')}
            >
              + Grocery Entry
            </button>
            {canViewReports && (
              <button
                className="btn-secondary btn-sm"
                onClick={() => navigate('/reports')}
              >
                View Reports →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Two-column bottom ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Open shifts */}
        <div className="card p-0">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold">Open Shifts</p>
            <button
              className="text-xs text-blue-600 hover:underline"
              onClick={() => navigate('/shifts')}
            >
              All shifts →
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {openShifts.length === 0 && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">
                No open shifts right now.
              </p>
            )}
            {openShifts.slice(0, 5).map((s) => (
              <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{s.shiftTag}</p>
                  <p className="text-xs text-gray-400">{s.date} · {s._count?.packStates ?? 0} packs</p>
                </div>
                <button
                  className="btn-primary btn-sm"
                  onClick={() => navigate(`/shifts/${s.id}/scan`)}
                >
                  Scan →
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity (ADMIN) or Today's grocery summary */}
        {user?.role === 'ADMIN' ? (
          <div className="card p-0">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold">Recent Activity</p>
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() => navigate('/audit')}
              >
                Full audit →
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {auditLogs.length === 0 && (
                <p className="px-5 py-6 text-sm text-gray-400 text-center">No activity recorded yet.</p>
              )}
              {auditLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="px-5 py-2.5 flex items-start gap-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${ENTITY_DOT[log.entity] || 'bg-gray-300'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-700 truncate">{log.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {log.user?.name} · {timeAgo(log.createdAt)}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ACTION_COLOR[log.action] || 'bg-gray-100 text-gray-600'}`}>
                    {log.action}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card p-0">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <p className="text-sm font-semibold">Today's Grocery Entries</p>
            </div>
            <div className="divide-y divide-gray-50">
              {grocery.length === 0 && (
                <p className="px-5 py-6 text-sm text-gray-400 text-center">No grocery entries today.</p>
              )}
              {grocery.map((e) => {
                const total = e.creditDebit + e.ebt + e.cashSales
                const exp = e.openingCash + e.cashSales
                const diff = e.actualCashOnHand - exp
                return (
                  <div key={e.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{e.storeName || 'Entry'}</p>
                      <p className="text-xs text-gray-400">{e.preparedBy?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{fmt(total)}</p>
                      <p className={`text-xs font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {diff >= 0 ? '+' : ''}{fmt(diff)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
