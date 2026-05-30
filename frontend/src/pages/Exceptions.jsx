import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getExceptions } from '../api/shifts'
import FlagBadge, { isError } from '../components/FlagBadge'

export default function Exceptions() {
  const { id } = useParams()
  const shiftId = parseInt(id, 10)
  const navigate = useNavigate()
  const [filter, setFilter] = useState('ALL') // ALL | ERROR | WARNING

  const { data: exceptions = [], isLoading } = useQuery({
    queryKey: ['shifts', shiftId, 'exceptions'],
    queryFn: () => getExceptions(shiftId),
  })

  const filtered = exceptions.filter((e) => {
    if (filter === 'ERROR') return e.flags.some(isError)
    if (filter === 'WARNING') return e.flags.every((f) => !isError(f))
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Exceptions</h2>
          <p className="text-gray-400 text-xs">Shift #{shiftId}</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={() => navigate(-1)}>← Back</button>
      </div>

      <div className="flex gap-2 mb-4">
        {['ALL', 'ERROR', 'WARNING'].map((f) => (
          <button
            key={f}
            className={filter === f ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <span className="badge-gray ml-auto">{filtered.length} items</span>
      </div>

      {isLoading && <p className="text-gray-400">Loading…</p>}

      {!isLoading && filtered.length === 0 && (
        <p className="text-gray-400 text-center py-8">No exceptions found.</p>
      )}

      <div className="space-y-3">
        {filtered.map((ps) => (
          <div key={ps.id} className={`card border ${ps.flags.some(isError) ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="font-mono font-semibold">{ps.pack.packId}</span>
                {ps.pack.gameName && <span className="text-gray-400 ml-2 text-xs">{ps.pack.gameName}</span>}
              </div>
              <div className="flex gap-1 flex-wrap">
                {ps.flags.map((f) => <FlagBadge key={f} flag={f} />)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><p className="text-gray-400">Start</p><p className="font-mono">{ps.startTicket ?? '—'}</p></div>
              <div><p className="text-gray-400">End</p><p className="font-mono">{ps.endTicket ?? '—'}</p></div>
              <div><p className="text-gray-400">Units</p><p className="font-semibold">{ps.computedUnits ?? '—'}</p></div>
            </div>
            {ps.overrideReason && (
              <p className="text-xs text-gray-500 mt-2">Override: {ps.overrideReason}</p>
            )}
            <button
              className="btn-secondary btn-sm mt-2"
              onClick={() => navigate(`/shifts/${shiftId}/commit`)}
            >
              Go to Commit →
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
