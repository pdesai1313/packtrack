import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { getDailySummary } from '../api/shifts'
import FlagBadge from '../components/FlagBadge'
import StatusPill from '../components/StatusPill'

export default function DailySummary() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['shifts', 'daily', date],
    queryFn: () => getDailySummary(date),
    enabled: !!date,
  })

  const shifts = data?.shifts || []
  const summary = data?.summary || []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Daily Summary</h2>
        <input
          type="date"
          className="input w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {isLoading && <p className="text-gray-400">Loading…</p>}
      {error && <p className="text-red-500">Failed to load summary</p>}

      {shifts.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {shifts.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(`/shifts/${s.id}/scan`)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              {s.shiftTag}
              <StatusPill status={s.status} tooltip="" />
            </button>
          ))}
        </div>
      )}

      {!isLoading && summary.length === 0 && (
        <p className="text-gray-400 text-center py-8">No shifts found for {date}.</p>
      )}

      {summary.length > 0 && shifts.length > 0 && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">Pack</th>
                {shifts.map((s) => (
                  <th key={s.id} className="text-left px-3 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span>{s.shiftTag}</span>
                      <StatusPill status={s.status} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.map((row) => (
                <tr key={row.packId} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <p className="font-mono font-semibold text-xs">{row.packId}</p>
                    {row.gameName && <p className="text-gray-400 text-xs">{row.gameName}</p>}
                  </td>
                  {shifts.map((s) => {
                    const d = row.shifts[s.id]
                    if (!d) {
                      return <td key={s.id} className="px-3 py-2 text-xs text-gray-300">—</td>
                    }
                    const hasError = d.flags?.some((f) => f.startsWith('ERROR_') || f === 'MISSING_START')
                    return (
                      <td key={s.id} className={`px-3 py-2 text-xs ${hasError ? 'bg-red-50' : ''}`}>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="font-semibold">{d.unitsSold ?? '—'}</span>
                          <span className="text-gray-300">/</span>
                          <span className="text-green-700 font-semibold">
                            {d.amount != null ? `$${d.amount.toFixed(2)}` : '—'}
                          </span>
                          {!d.committed && <StatusPill status="DRAFT" />}
                        </div>
                        {d.startTicket != null && (
                          <p className="text-gray-400 text-xs font-mono mt-0.5">
                            {d.startTicket} → {d.endTicket ?? '?'}
                          </p>
                        )}
                        {d.flags?.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {d.flags.map((f) => <FlagBadge key={f} flag={f} />)}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
