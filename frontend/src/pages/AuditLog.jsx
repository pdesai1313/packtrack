import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAuditLogs } from '../api/audit'

function today() { return new Date().toISOString().split('T')[0] }

function getPeriodDates(period) {
  const t = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (period === 'today') return { from: today(), to: today() }
  if (period === 'week') {
    const d = new Date(t)
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay()
    d.setDate(d.getDate() + diff)
    return { from: iso(d), to: today() }
  }
  if (period === 'month') {
    const pad2 = (n) => String(n).padStart(2, '0')
    return { from: `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-01`, to: today() }
  }
  if (period === 'year') return { from: `${t.getFullYear()}-01-01`, to: today() }
  return null
}

const ACTION_STYLE = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  COMMIT: 'bg-purple-100 text-purple-700',
}

const ENTITY_LABEL = {
  SHIFT:   'Shift',
  PACK:    'Pack',
  GROCERY: 'Grocery',
  USER:    'User',
}

const ENTITIES = ['SHIFT', 'PACK', 'GROCERY', 'USER']
const ACTIONS  = ['CREATE', 'UPDATE', 'DELETE', 'COMMIT']

function ActionBadge({ action }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ACTION_STYLE[action] || 'bg-gray-100 text-gray-700'}`}>
      {action}
    </span>
  )
}

function EntityBadge({ entity }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      {ENTITY_LABEL[entity] || entity}
    </span>
  )
}

function formatTs(iso) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  return { date, time }
}

export default function AuditLog() {
  const [period, setPeriod]       = useState('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]   = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [filterAction, setFilterAction] = useState('')

  const dates = period === 'custom'
    ? (customFrom && customTo ? { from: customFrom, to: customTo } : null)
    : getPeriodDates(period)

  const params = {
    ...(dates || {}),
    ...(filterEntity ? { entity: filterEntity } : {}),
    ...(filterAction ? { action: filterAction } : {}),
  }

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit', params],
    queryFn: () => getAuditLogs(params),
    enabled: !!dates,
  })

  const periods = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year',  label: 'This Year' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Audit Trail</h2>
        <p className="text-gray-400 text-xs">Track every create, update, delete, and commit action</p>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              period === p.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom range */}
      {period === 'custom' && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" className="input py-1 text-sm" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" className="input py-1 text-sm" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <select
          className="input py-1 text-xs w-auto"
          value={filterEntity}
          onChange={(e) => setFilterEntity(e.target.value)}
        >
          <option value="">All Entities</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e]}</option>)}
        </select>
        <select
          className="input py-1 text-xs w-auto"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
        >
          <option value="">All Actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {(filterEntity || filterAction) && (
          <button
            className="text-xs text-blue-600 hover:underline px-2"
            onClick={() => { setFilterEntity(''); setFilterAction('') }}
          >
            Clear filters
          </button>
        )}
      </div>

      {!dates && <p className="text-gray-400 text-sm">Select a date range to view the audit trail.</p>}
      {dates && isLoading && <p className="text-gray-400 text-sm">Loading…</p>}

      {dates && !isLoading && (
        <div className="card p-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold">Activity Log</p>
            <p className="text-xs text-gray-400">{logs.length} record{logs.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">Date & Time</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">User</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Action</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Entity</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-xs">
                      No activity found for this period.
                    </td>
                  </tr>
                )}
                {logs.map((log) => {
                  const { date, time } = formatTs(log.createdAt)
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <p className="text-xs font-medium text-gray-800">{date}</p>
                        <p className="text-xs text-gray-400">{time}</p>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <p className="text-xs font-medium text-gray-800">{log.user?.name ?? '—'}</p>
                        <p className="text-xs text-gray-400">{log.user?.role ?? ''}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <ActionBadge action={log.action} />
                      </td>
                      <td className="px-4 py-2.5">
                        <EntityBadge entity={log.entity} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-700">
                        {log.description}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
