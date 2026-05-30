import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ChevronDown, Trash2, ScanLine, ClipboardCheck, Eye, RotateCcw, Plus } from 'lucide-react'
import { getShifts, createShift, deleteShift, reopenShift } from '../api/shifts'
import { useAuth } from '../context/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthLabel(key) {
  const [year, month] = key.split('-')
  return new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1)
    .toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const PERIODS = [
  { key: 'all',       label: 'All' },
  { key: 'today',     label: 'Today' },
  { key: 'week',      label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'month',     label: 'This Month' },
  { key: 'custom',    label: 'Custom' },
]

function getPeriodDates(period, customFrom, customTo) {
  const t = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const todayStr = iso(t)
  if (period === 'today') return { from: todayStr, to: todayStr }
  if (period === 'week') {
    const sunday = new Date(t)
    sunday.setDate(t.getDate() - t.getDay())
    const saturday = new Date(sunday)
    saturday.setDate(sunday.getDate() + 6)
    return { from: iso(sunday), to: iso(saturday) }
  }
  if (period === 'last_week') {
    const lastSunday = new Date(t)
    lastSunday.setDate(t.getDate() - t.getDay() - 7)
    const lastSaturday = new Date(lastSunday)
    lastSaturday.setDate(lastSunday.getDate() + 6)
    return { from: iso(lastSunday), to: iso(lastSaturday) }
  }
  if (period === 'month') return { from: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-01`, to: todayStr }
  if (period === 'custom') return customFrom && customTo ? { from: customFrom, to: customTo } : null
  return null // 'all'
}

const MONTHS_PER_PAGE = 6

// ─── Create Shift Modal ───────────────────────────────────────────────────────

function CreateShiftModal({ onClose, closedShifts }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [shiftName, setShiftName] = useState('')
  const [startSource, setStartSource] = useState('previous_day')
  const [manualShiftId, setManualShiftId] = useState('')
  const [shiftFilter, setShiftFilter] = useState('')
  const [error, setError] = useState('')

  const filteredShifts = closedShifts.filter((s) => {
    if (!shiftFilter) return true
    const q = shiftFilter.toLowerCase()
    return s.date.includes(q) || s.shiftTag.toLowerCase().includes(q)
  })
  const filteredGroupMap = {}
  for (const s of filteredShifts) {
    const key = s.date.slice(0, 7)
    if (!filteredGroupMap[key]) filteredGroupMap[key] = []
    filteredGroupMap[key].push(s)
  }
  const filteredGroups = Object.entries(filteredGroupMap).sort(([a], [b]) => b.localeCompare(a))

  const createMutation = useMutation({
    mutationFn: () => createShift({
      date,
      shiftName: shiftName.trim(),
      startSource,
      manualShiftId: startSource === 'manual' && manualShiftId ? Number(manualShiftId) : null,
    }),
    onSuccess: (shift) => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      onClose()
      navigate(`/shifts/${shift.id}/scan`)
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to create shift'),
  })

  const canSubmit = shiftName.trim().length > 0 && (startSource !== 'manual' || !!manualShiftId)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold mb-4">New Shift</h3>

        <div className="space-y-4">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <label className="label">Shift Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Morning, Evening, Recount…"
              value={shiftName}
              autoFocus
              onChange={(e) => setShiftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) createMutation.mutate() }}
            />
          </div>

          <div>
            <label className="label mb-2">Start Ticket Source</label>
            <div className="space-y-2">
              {[
                { value: 'previous_day', label: "Previous day's last committed shift" },
                { value: 'today_last',   label: "Today's most recent committed shift" },
                { value: 'manual',       label: 'Select a specific shift manually' },
              ].map((opt) => (
                <label key={opt.value} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="startSource"
                    value={opt.value}
                    checked={startSource === opt.value}
                    onChange={() => setStartSource(opt.value)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {startSource === 'manual' && (
            <div>
              <label className="label">Copy Start Tickets From</label>
              {closedShifts.length === 0 ? (
                <p className="text-xs text-gray-400">No committed shifts available yet.</p>
              ) : (
                <>
                  <input
                    type="text"
                    className="input mb-2"
                    placeholder="Filter by date or name…"
                    value={shiftFilter}
                    onChange={(e) => setShiftFilter(e.target.value)}
                  />
                  <select
                    className="input"
                    value={manualShiftId}
                    onChange={(e) => setManualShiftId(e.target.value)}
                    size={Math.min(filteredShifts.length + 1, 7)}
                  >
                    <option value="">— Select a shift —</option>
                    {filteredGroups.map(([monthKey, monthShifts]) => (
                      <optgroup key={monthKey} label={monthLabel(monthKey)}>
                        {monthShifts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.date} · {s.shiftTag}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-red-600 text-xs mt-3">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </button>
          <button
            className="btn-primary flex-1"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !canSubmit}
          >
            {createMutation.isPending ? 'Creating…' : 'Create & Start Scanning'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shift Card ───────────────────────────────────────────────────────────────

function ShiftCard({ s, user, isAdmin, onScan, onCommit, onView, onReopen, onDelete }) {
  const isOpen = s.status === 'OPEN'

  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden
      ${isOpen ? 'border-l-[3px] border-l-blue-500' : 'border-l-[3px] border-l-gray-300'}`}>
      <div className="flex items-center gap-3 px-4 py-3.5">

        {/* Live / closed indicator */}
        <div className="relative flex-shrink-0">
          {isOpen ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-60" />
            </>
          ) : (
            <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          )}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 truncate">{s.shiftTag}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">{s.date}</span>
            {isOpen && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 flex-shrink-0">
                LIVE
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <span>{s._count?.packStates ?? 0} packs</span>
            {s.createdBy?.name && <><span>·</span><span>{s.createdBy.name}</span></>}
          </div>
        </div>

        {/* Financial total */}
        {s.totalAmount > 0 && (
          <div className="text-right flex-shrink-0 hidden sm:block">
            <div className={`font-bold text-sm ${isOpen ? 'text-blue-700' : 'text-gray-800'}`}>
              {fmt(s.totalAmount)}
            </div>
            <div className="text-xs text-gray-400">{s.totalUnits} units</div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isOpen && (
            <button
              className="btn-primary btn-sm flex items-center gap-1.5"
              onClick={onScan}
            >
              <ScanLine size={13} />
              Scan
            </button>
          )}
          {isOpen && ['ADMIN', 'REVIEWER'].includes(user?.role) && (
            <button
              className="btn-secondary btn-sm flex items-center gap-1.5"
              onClick={onCommit}
            >
              <ClipboardCheck size={13} />
              Commit
            </button>
          )}
          {!isOpen && (
            <button
              className="btn-secondary btn-sm flex items-center gap-1.5"
              onClick={onView}
            >
              <Eye size={13} />
              View
            </button>
          )}
          {!isOpen && isAdmin && (
            <button
              className="btn-secondary btn-sm flex items-center gap-1.5"
              onClick={onReopen}
            >
              <RotateCcw size={13} />
              Reopen
            </button>
          )}
          {isAdmin && (
            <button
              className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              onClick={onDelete}
              title="Delete shift"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Shifts() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmReopen, setConfirmReopen] = useState(null) // { id, originalDate, date }

  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { data: shifts = [], isLoading } = useQuery({ queryKey: ['shifts'], queryFn: getShifts })

  const isAdmin = user?.role === 'ADMIN'

  // Open shifts always shown — never filtered out
  const openShifts = shifts.filter((s) => s.status === 'OPEN')

  // Closed shifts filtered by selected period
  const dateRange = getPeriodDates(period, customFrom, customTo)
  const closedShifts = useMemo(() => {
    const all = shifts.filter((s) => s.status === 'CLOSED')
    if (!dateRange) return all
    return all.filter((s) => s.date >= dateRange.from && s.date <= dateRange.to)
  }, [shifts, dateRange?.from, dateRange?.to])

  const currentMonthKey = format(new Date(), 'yyyy-MM')
  const [expandedMonths, setExpandedMonths] = useState(() => ({ [currentMonthKey]: true }))
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [period, customFrom, customTo])

  const closedMonthGroups = useMemo(() => {
    const map = {}
    for (const s of closedShifts) {
      const key = s.date.slice(0, 7)
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a))
  }, [closedShifts])

  const totalMonthPages = Math.ceil(closedMonthGroups.length / MONTHS_PER_PAGE)
  const paginatedMonthGroups = closedMonthGroups.slice((page - 1) * MONTHS_PER_PAGE, page * MONTHS_PER_PAGE)

  const deleteMutation = useMutation({
    mutationFn: deleteShift,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shifts'] }); setConfirmDeleteId(null) },
  })

  const reopenMutation = useMutation({
    mutationFn: ({ id, date, originalDate }) => reopenShift(id, date !== originalDate ? date : undefined),
    onSuccess: (data, { id }) => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      setConfirmReopen(null)
      if (data.warning) alert(data.warning)
      else navigate(`/shifts/${id}/scan`)
    },
  })

  const shiftActions = (s) => ({
    onScan:   () => navigate(`/shifts/${s.id}/scan`),
    onCommit: () => navigate(`/shifts/${s.id}/commit`),
    onView:   () => navigate(`/shifts/${s.id}/commit`),
    onReopen: () => setConfirmReopen({ id: s.id, originalDate: s.date, date: s.date }),
    onDelete: () => setConfirmDeleteId(s.id),
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Shifts</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {openShifts.length > 0 && <span className="text-blue-500 font-medium">{openShifts.length} active · </span>}
            {closedShifts.length} closed{period !== 'all' ? ' in period' : ''}
          </p>
        </div>
        {['ADMIN', 'REVIEWER'].includes(user?.role) && (
          <button className="btn-primary btn-sm flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            New Shift
          </button>
        )}
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PERIODS.map((p) => (
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

      {/* Custom date range */}
      {period === 'custom' && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" className="input py-1 text-sm" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" className="input py-1 text-sm" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateShiftModal onClose={() => setShowCreate(false)} closedShifts={closedShifts} />
      )}

      {/* Reopen confirmation */}
      {confirmReopen && (() => {
        const shift = shifts.find((s) => s.id === confirmReopen.id)
        const dateChanged = confirmReopen.date !== confirmReopen.originalDate
        // Closed shifts on the original date (other than this one)
        const oldDateOthers = shifts.filter(
          (s) => s.status === 'CLOSED' && s.date === confirmReopen.originalDate && s.id !== confirmReopen.id
        )
        // Closed shifts already on the new date (if date changed)
        const newDateOthers = dateChanged
          ? shifts.filter((s) => s.status === 'CLOSED' && s.date === confirmReopen.date)
          : []
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
              <h3 className="font-bold text-lg mb-1">Reopen this shift?</h3>
              <p className="text-gray-500 text-sm mb-4">
                <span className="font-semibold">{shift?.shiftTag}</span> will be unlocked for re-scanning and re-committing. You can also correct the date below.
              </p>

              {/* Date correction field */}
              <div className="mb-4">
                <label className="label">Shift Date</label>
                <input
                  type="date"
                  className="input"
                  value={confirmReopen.date}
                  onChange={(e) => setConfirmReopen((p) => ({ ...p, date: e.target.value }))}
                />
                {dateChanged && (
                  <p className="text-xs text-blue-600 mt-1.5">
                    Date will change from <strong>{confirmReopen.originalDate}</strong> to <strong>{confirmReopen.date}</strong>.
                    Start tickets will be recalculated at commit time.
                  </p>
                )}
              </div>

              {/* Warnings */}
              {(oldDateOthers.length > 0 || newDateOthers.length > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4 space-y-1.5">
                  {oldDateOthers.length > 0 && (
                    <p className="text-amber-800 text-xs">
                      ⚠️ <strong>{oldDateOthers.map((s) => s.shiftTag).join(', ')}</strong> on {confirmReopen.originalDate} may have incorrect start tickets after this — consider reopening and re-committing {oldDateOthers.length === 1 ? 'it' : 'them'} too.
                    </p>
                  )}
                  {newDateOthers.length > 0 && (
                    <p className="text-amber-800 text-xs">
                      ⚠️ <strong>{newDateOthers.map((s) => s.shiftTag).join(', ')}</strong> already exist on {confirmReopen.date} — their start ticket chain may be affected after re-commit.
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={() => setConfirmReopen(null)} disabled={reopenMutation.isPending}>Cancel</button>
                <button className="btn-primary flex-1" onClick={() => reopenMutation.mutate(confirmReopen)} disabled={reopenMutation.isPending || !confirmReopen.date}>
                  {reopenMutation.isPending ? 'Reopening…' : 'Reopen Shift'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-lg mb-1">Delete this shift?</h3>
            <p className="text-gray-500 text-sm mb-5">All scan data and pack states will be permanently removed.</p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setConfirmDeleteId(null)} disabled={deleteMutation.isPending}>Cancel</button>
              <button className="btn-danger flex-1" onClick={() => deleteMutation.mutate(confirmDeleteId)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : openShifts.length === 0 && closedShifts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ScanLine size={32} className="mx-auto mb-3 opacity-30" />
          {shifts.length === 0 ? (
            <>
              <p className="font-medium">No shifts yet</p>
              <p className="text-xs mt-1">Create a shift to start scanning packs</p>
            </>
          ) : (
            <>
              <p className="font-medium">No shifts in this period</p>
              <p className="text-xs mt-1">Try selecting a different date range</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">

          {/* Active (OPEN) shifts — always visible at the top */}
          {openShifts.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-2.5">
                <div className="relative flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-60" />
                </div>
                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">Active</span>
                <div className="flex-1 h-px bg-blue-100" />
                <span className="text-xs text-blue-400">{openShifts.length} open</span>
              </div>
              <div className="space-y-2">
                {openShifts.map((s) => (
                  <ShiftCard key={s.id} s={s} user={user} isAdmin={isAdmin} {...shiftActions(s)} />
                ))}
              </div>
            </div>
          )}

          {/* Closed shifts grouped by month */}
          {paginatedMonthGroups.map(([monthKey, monthShifts]) => {
            const isExpanded = !!expandedMonths[monthKey]
            const monthTotal = monthShifts.reduce((sum, s) => sum + (s.totalAmount || 0), 0)
            return (
              <div key={monthKey}>
                {/* Month divider header */}
                <button
                  className="w-full flex items-center gap-3 mb-2.5 group"
                  onClick={() => setExpandedMonths((p) => ({ ...p, [monthKey]: !p[monthKey] }))}
                >
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap flex-shrink-0 group-hover:text-gray-600 transition-colors">
                    {monthLabel(monthKey)}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                    {fmt(monthTotal)} · {monthShifts.length} shift{monthShifts.length !== 1 ? 's' : ''}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
                  />
                </button>

                {isExpanded && (
                  <div className="space-y-2">
                    {monthShifts.map((s) => (
                      <ShiftCard key={s.id} s={s} user={user} isAdmin={isAdmin} {...shiftActions(s)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Pagination */}
          {totalMonthPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-400">
                Page {page} of {totalMonthPages} · {closedMonthGroups.length} month{closedMonthGroups.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 1}
                  className="px-2.5 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  ←
                </button>
                <span className="px-2 text-xs text-gray-500 tabular-nums">{page} / {totalMonthPages}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page === totalMonthPages}
                  className="px-2.5 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  →
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
