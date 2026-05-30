import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getShifts, getShiftPackStates, commitShift, exportCsv, updateReconciliation } from '../api/shifts'
import FlagBadge, { isError } from '../components/FlagBadge'
import StatusPill from '../components/StatusPill'
import { useAuth } from '../context/AuthContext'

function ConfirmModal({ totalAmount, shiftsCount, onConfirm, onCancel, isPending }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
        <h3 className="text-lg font-bold mb-1">Commit this shift?</h3>
        <p className="text-gray-500 text-sm mb-4">
          This will lock the shift. Admins can reopen it later if corrections are needed.
        </p>
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 mb-5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Instant Sale</span><span className="font-bold text-green-700">${totalAmount.toFixed(2)}</span></div>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onCancel} disabled={isPending}>Cancel</button>
          <button className="btn-primary flex-1" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Committing…' : 'Yes, Commit'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CommitShift() {
  const { id } = useParams()
  const shiftId = parseInt(id, 10)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const [overrides, setOverrides] = useState({})
  const [commitError, setCommitError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [recon, setRecon] = useState(null)
  const [reconSaved, setReconSaved] = useState(false)

  const { data: allShifts = [] } = useQuery({ queryKey: ['shifts'], queryFn: getShifts })

  const { data: shift, isLoading } = useQuery({
    queryKey: ['shifts', shiftId, 'packstates'],
    queryFn: () => getShiftPackStates(shiftId),
    onSuccess: (data) => {
      if (recon === null) setRecon({
        onlineSale:       data.onlineSale       ?? '',
        atm:              data.atm              ?? '',
        onlineCash:       data.onlineCash       ?? '',
        instantCash:      data.instantCash      ?? '',
        actualCashOnHand: data.actualCashOnHand ?? '',
      })
    },
  })

  const commitMutation = useMutation({
    mutationFn: () => {
      const packCommits = shift.packStates.map((ps) => ({
        packStateId: ps.id,
        overrideReason: overrides[ps.id] || null,
      }))
      return commitShift(shiftId, packCommits)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      navigate('/shifts')
    },
    onError: (e) => setCommitError(e.response?.data?.error || 'Commit failed'),
  })

  if (isLoading) return <p className="text-gray-400">Loading…</p>
  if (!shift) return <p className="text-red-500">Shift not found</p>

  const isClosed = shift.status === 'CLOSED'
  const canCommit = ['ADMIN', 'REVIEWER'].includes(user?.role)
  const isAdmin = user?.role === 'ADMIN'

  const reconFields = [
    { key: 'onlineSale',       label: 'Online Sale' },
    { key: 'atm',              label: 'ATM' },
    { key: 'onlineCash',       label: 'Online Cash' },
    { key: 'instantCash',      label: 'Instant Cash' },
    { key: 'actualCashOnHand', label: 'Actual COH' },
  ]

  const initRecon = recon ?? {
    onlineSale:       shift.onlineSale       ?? '',
    atm:              shift.atm              ?? '',
    onlineCash:       shift.onlineCash       ?? '',
    instantCash:      shift.instantCash      ?? '',
    actualCashOnHand: shift.actualCashOnHand ?? '',
  }

  async function saveRecon() {
    const payload = {}
    for (const { key } of reconFields) {
      const val = initRecon[key]
      payload[key] = val === '' ? null : Number(val)
    }
    await updateReconciliation(shiftId, payload)
    qc.invalidateQueries({ queryKey: ['shifts', shiftId, 'packstates'] })
    setReconSaved(true)
    setTimeout(() => setReconSaved(false), 2000)
  }
  const packStates = shift.packStates || []

  const totalUnits = packStates.reduce((s, ps) => s + (ps.computedUnits || 0), 0)
  const totalAmount = packStates.reduce((s, ps) => s + (ps.computedAmount || 0), 0)
  const flaggedPacks = packStates.filter((ps) => (ps.flags || []).length > 0)
  const unresolvedErrors = packStates.filter((ps) => (ps.flags || []).some(isError) && !overrides[ps.id])

  // Shifts created before this one (lower id) on the same day that are still open
  const openPriorSameDayShifts = shift
    ? allShifts.filter((s) => s.date === shift.date && s.status === 'OPEN' && s.id < shiftId)
    : []

  return (
    <div>
      {showConfirm && (
        <ConfirmModal
          totalAmount={totalAmount}
          onConfirm={() => { setShowConfirm(false); commitMutation.mutate() }}
          onCancel={() => setShowConfirm(false)}
          isPending={commitMutation.isPending}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">{isClosed ? 'Shift Summary' : 'Review & Commit'}</h2>
          <p className="text-gray-500 text-xs">{shift.date} · {shift.shiftTag?.replace('_', ' ')}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={() => navigate(`/shifts/${shiftId}/scan`)}>
            ← Back to Scan
          </button>
          <button
            className="btn-secondary btn-sm"
            onClick={() => exportCsv(shiftId, `shift-${shiftId}-${shift.date}-${shift.shiftTag}.csv`)}
          >
            ↓ CSV
          </button>
          {!isClosed && canCommit && (
            <button
              className="btn-primary btn-sm"
              disabled={unresolvedErrors.length > 0 || commitMutation.isPending}
              onClick={() => {
                if (openPriorSameDayShifts.length > 0) {
                  setCommitError(
                    `Cannot commit: "${openPriorSameDayShifts.map((s) => s.shiftTag).join(', ')}" on the same day is still open. Commit that shift first.`
                  )
                  return
                }
                setCommitError('')
                setShowConfirm(true)
              }}
            >
              {commitMutation.isPending ? 'Committing…' : 'Commit Shift'}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="card text-center py-2">
          <p className="text-gray-400 text-xs">Packs</p>
          <p className="text-xl font-bold">{packStates.length}</p>
        </div>
        <div className="card text-center py-2">
          <p className="text-gray-400 text-xs">Units</p>
          <p className="text-xl font-bold">{totalUnits}</p>
        </div>
        <div className="card text-center py-2">
          <p className="text-gray-400 text-xs">Instant Sale</p>
          <p className="text-xl font-bold text-green-700">${totalAmount.toFixed(2)}</p>
        </div>
        <div className={`card text-center py-2 ${unresolvedErrors.length > 0 ? 'bg-red-50' : flaggedPacks.length > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}>
          <p className="text-gray-400 text-xs">Flags</p>
          <p className="text-xl font-bold">{flaggedPacks.length}</p>
        </div>
      </div>

      {unresolvedErrors.length > 0 && !isClosed && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3 text-xs text-red-700">
          {unresolvedErrors.length} pack(s) have unresolved errors — add override reasons below before committing.
        </div>
      )}

      {commitError && <p className="text-red-600 text-xs mb-3">{commitError}</p>}

      {/* Reconciliation */}
      {(isAdmin || isClosed) && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Reconciliation</p>
            {isAdmin && (
              <button
                className="btn-primary btn-sm"
                onClick={saveRecon}
              >
                {reconSaved ? 'Saved ✓' : 'Save'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {reconFields.map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs text-gray-400 font-medium block mb-1">{label}</label>
                {isAdmin ? (
                  <input
                    type="number"
                    step="0.01"
                    className="input py-1 text-sm"
                    placeholder="0.00"
                    value={recon?.[key] ?? shift[key] ?? ''}
                    onChange={(e) => setRecon((p) => ({ ...p, [key]: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm font-semibold">
                    {shift[key] != null ? `$${Number(shift[key]).toFixed(2)}` : '—'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compact table */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Pack</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Game</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Start</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">End</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Units</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Amount</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Flags</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {packStates.map((ps) => {
              const flags = ps.flags || []
              const hasErrors = flags.some(isError)
              const rowBg = hasErrors ? 'bg-red-50' : flags.length > 0 ? 'bg-yellow-50' : ''

              return (
                <tr key={ps.id} className={rowBg}>
                  <td className="px-3 py-1.5 font-mono font-semibold text-xs">{ps.pack.packId}</td>
                  <td className="px-3 py-1.5 text-gray-500 text-xs">{ps.pack.gameName || '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-right">{ps.startTicket ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-right">{ps.endTicket ?? '—'}</td>
                  <td className="px-3 py-1.5 text-xs font-semibold text-right">{ps.computedUnits ?? '—'}</td>
                  <td className="px-3 py-1.5 text-xs font-semibold text-right">
                    {ps.computedAmount != null ? `$${ps.computedAmount.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1 flex-wrap">
                      {flags.length === 0 ? <StatusPill status="OK" /> : flags.map((f) => <FlagBadge key={f} flag={f} />)}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    {isClosed ? (
                      <span className="text-gray-400 text-xs">{ps.overrideReason || ''}</span>
                    ) : flags.length > 0 ? (
                      <input
                        className="input py-0.5 text-xs w-48"
                        placeholder={hasErrors ? 'Required *' : 'Optional note'}
                        value={overrides[ps.id] || ''}
                        onChange={(e) => setOverrides((p) => ({ ...p, [ps.id]: e.target.value }))}
                      />
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">TOTAL</td>
              <td className="px-3 py-2 text-xs font-bold text-right">{totalUnits}</td>
              <td className="px-3 py-2 text-xs font-bold text-right">${totalAmount.toFixed(2)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
