import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getShiftPackStates, scanTicket, setStartTicket, updateReconciliation } from '../api/shifts'
import FlagBadge, { isError } from '../components/FlagBadge'
import StatusPill from '../components/StatusPill'
import { useAuth } from '../context/AuthContext'

function extractFromBarcode(raw) {
  const trimmed = raw.trim()
  if (trimmed.length >= 13) return trimmed.substring(10, 13).replace(/^0+/, '') || '0'
  return trimmed
}
function isBarcode(raw) { return raw.trim().length >= 13 }
function fmt(n) { return n != null ? `$${Number(n).toFixed(2)}` : '—' }
function toNum(v) { return v === '' || v == null ? null : parseFloat(v) }

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, color = 'text-gray-700', bg = 'bg-gray-100' }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${bg}`}>
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({ filter, onFilter, search, onSearch, counts }) {
  const filters = [
    { key: 'all',       label: 'All',       count: counts.all,       errorStyle: false },
    { key: 'errors',    label: 'Errors',    count: counts.errors,    errorStyle: true  },
    { key: 'warnings',  label: 'Warnings',  count: counts.warnings,  errorStyle: false },
    { key: 'ok',        label: 'OK',        count: counts.ok,        errorStyle: false },
    { key: 'unscanned', label: 'Unscanned', count: counts.unscanned, errorStyle: false },
  ]
  return (
    <div className="flex items-center gap-3 flex-wrap mb-4">
      <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs shadow-sm">
        {filters.map((f) => {
          const isActive = filter === f.key
          const hasErrors = f.errorStyle && f.count > 0
          return (
            <button
              key={f.key}
              onClick={() => onFilter(f.key)}
              className={`px-3 py-1.5 font-medium transition-colors border-r border-gray-200 last:border-r-0 ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : hasErrors
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
              <span className={`ml-1.5 font-normal ${isActive ? 'text-blue-200' : hasErrors ? 'text-red-400' : 'text-gray-400'}`}>
                {f.count}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-1">
        <input
          className="input py-1 text-xs w-44"
          placeholder="Search pack #…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        {search && (
          <button
            className="text-gray-400 hover:text-gray-600 text-sm px-1"
            onClick={() => onSearch('')}
            title="Clear search"
          >✕</button>
        )}
      </div>
    </div>
  )
}

// ── Reconciliation panel ──────────────────────────────────────────────────────

function ReconField({ label, value, onChange, onBlur, isClosed, displayValue }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <label className="text-xs text-gray-500 whitespace-nowrap">{label}</label>
      {isClosed ? (
        <span className="font-mono text-xs font-semibold text-gray-700">{displayValue}</span>
      ) : (
        <input
          className="input py-0.5 text-xs w-28 text-right font-mono tabular-nums"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
        />
      )}
    </div>
  )
}

function ReconciliationPanel({ shift, shiftId, isClosed, instantSale, onCommit, canCommit }) {
  const qc = useQueryClient()
  const [fields, setFields] = useState({
    onlineSale:       shift.onlineSale       ?? '',
    atm:              shift.atm              ?? '',
    onlineCash:       shift.onlineCash       ?? '',
    instantCash:      shift.instantCash      ?? '',
    actualCashOnHand: shift.actualCashOnHand ?? '',
  })

  const saveMutation = useMutation({
    mutationFn: (data) => updateReconciliation(shiftId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts', shiftId, 'packstates'] }),
  })

  function handleBlur() {
    saveMutation.mutate({
      onlineSale:       toNum(fields.onlineSale),
      atm:              toNum(fields.atm),
      onlineCash:       toNum(fields.onlineCash),
      instantCash:      toNum(fields.instantCash),
      actualCashOnHand: toNum(fields.actualCashOnHand),
    })
  }
  function setField(name) { return (e) => setFields((p) => ({ ...p, [name]: e.target.value })) }

  const onlineSaleNum  = toNum(fields.onlineSale)  ?? 0
  const atmNum         = toNum(fields.atm)          ?? 0
  const onlineCashNum  = toNum(fields.onlineCash)   ?? 0
  const instantCashNum = toNum(fields.instantCash)  ?? 0
  const actualCOHNum   = toNum(fields.actualCashOnHand)

  const totalSale    = onlineSaleNum + instantSale
  const totalCash    = onlineCashNum + instantCashNum
  const expectedCOH  = totalSale - atmNum - totalCash
  const overallTotal = actualCOHNum != null ? actualCOHNum - expectedCOH : null

  const overallIsGood   = overallTotal != null && Math.abs(overallTotal) < 0.01
  const overallIsOver   = overallTotal != null && overallTotal > 0.01
  const overallIsUnder  = overallTotal != null && overallTotal < -0.01

  const overallBg    = overallIsGood  ? 'bg-emerald-50 border-emerald-200'
    : overallIsOver  ? 'bg-blue-50 border-blue-200'
    : overallIsUnder ? 'bg-red-50 border-red-200'
    : 'bg-gray-50 border-gray-200'

  const overallColor = overallIsGood  ? 'text-emerald-700'
    : overallIsOver  ? 'text-blue-700'
    : overallIsUnder ? 'text-red-600'
    : 'text-gray-400'

  const overallLabel = overallIsGood  ? 'Balanced'
    : overallIsOver  ? 'Over'
    : overallIsUnder ? 'Short'
    : '—'

  return (
    <div className="w-96 flex-shrink-0">
      <div className="card sticky top-20 p-0 overflow-hidden">

        {/* Panel header */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Reconciliation</p>
        </div>

        <div className="p-4 space-y-4">
          {/* Sales */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Sales</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between py-0.5">
                <span className="text-xs text-gray-500">Instant Sale</span>
                <span className="font-mono text-xs font-bold text-emerald-700">{fmt(instantSale)}</span>
              </div>
              <ReconField
                label="Online Sale"
                value={fields.onlineSale}
                onChange={setField('onlineSale')}
                onBlur={handleBlur}
                isClosed={isClosed}
                displayValue={fmt(toNum(fields.onlineSale))}
              />
            </div>
          </div>

          <div className="border-t border-dashed border-gray-200" />

          {/* Cash */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Cash</p>
            <div className="space-y-1">
              <ReconField label="ATM" value={fields.atm} onChange={setField('atm')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.atm))} />
              <ReconField label="Online Cash" value={fields.onlineCash} onChange={setField('onlineCash')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.onlineCash))} />
              <ReconField label="Instant Cash" value={fields.instantCash} onChange={setField('instantCash')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.instantCash))} />
              <ReconField label="Actual COH" value={fields.actualCashOnHand} onChange={setField('actualCashOnHand')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.actualCashOnHand))} />
            </div>
          </div>

          <div className="border-t border-dashed border-gray-200" />

          {/* Computed totals */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Totals</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-500">
                <span>Total Sale</span>
                <span className="font-mono tabular-nums">{fmt(totalSale)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Total Cash</span>
                <span className="font-mono tabular-nums">{fmt(totalCash)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Expected COH</span>
                <span className="font-mono tabular-nums">{fmt(expectedCOH)}</span>
              </div>
            </div>
          </div>

          {/* Overall Total — prominent display */}
          <div className={`rounded-lg border px-3 py-3 ${overallBg}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Overall Total</p>
                <p className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${overallColor}`}>
                  {overallTotal != null
                    ? (overallTotal > 0 ? `+${fmt(overallTotal)}` : fmt(overallTotal))
                    : '—'}
                </p>
              </div>
              {overallTotal != null && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  overallIsGood  ? 'bg-emerald-100 text-emerald-700'
                  : overallIsOver  ? 'bg-blue-100 text-blue-700'
                  : 'bg-red-100 text-red-700'
                }`}>{overallLabel}</span>
              )}
            </div>
          </div>

          {!isClosed && canCommit && (
            <button
              className="btn-primary w-full"
              onClick={onCommit}
            >
              Review &amp; Commit →
            </button>
          )}

          {saveMutation.isError && (
            <p className="text-red-500 text-xs text-center">Save failed — check connection</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiveScan() {
  const { id } = useParams()
  const shiftId = parseInt(id, 10)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [rowInputs, setRowInputs] = useState({})
  const [rowErrors, setRowErrors] = useState({})
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [panelOpen, setPanelOpen] = useState(true)
  const [editingStart, setEditingStart] = useState({})
  const [activeRow, setActiveRow] = useState(null)

  const inputRefs = useRef({})
  const justPressedEnter = useRef({}) // prevents blur from double-submitting after Enter

  const { data: shift, isLoading } = useQuery({
    queryKey: ['shifts', shiftId, 'packstates'],
    queryFn: () => getShiftPackStates(shiftId),
    refetchInterval: 300000,
  })

  const packStates = shift?.packStates || []

  // Focus first unscanned input when shift loads
  useEffect(() => {
    if (!packStates.length) return
    const first = packStates.find((ps) => ps.endTicket == null && ps.status !== 'CLOSED')
    if (first) setTimeout(() => inputRefs.current[first.id]?.focus(), 100)
  }, [shift?.id])

  const scanMutation = useMutation({
    mutationFn: ({ packId, ticket }) => scanTicket(shiftId, packId, ticket),
    onSuccess: (_, { psId }) => {
      qc.invalidateQueries({ queryKey: ['shifts', shiftId, 'packstates'] })
      setRowErrors((p) => ({ ...p, [psId]: null }))
    },
    onError: (e, { psId }) => {
      setRowErrors((p) => ({ ...p, [psId]: e.response?.data?.error || 'Failed' }))
    },
  })

  const startMutation = useMutation({
    mutationFn: ({ packId, startTicket }) => setStartTicket(shiftId, packId, startTicket),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts', shiftId, 'packstates'] }),
  })

  function getMode(psId) { return rowInputs[psId]?.mode || 'scanner' }
  function setMode(psId, mode) {
    setRowInputs((p) => ({ ...p, [psId]: { ...p[psId], mode } }))
    setTimeout(() => inputRefs.current[psId]?.focus(), 50)
  }
  function getValue(psId) { return rowInputs[psId]?.value || '' }
  function setValue(psId, value) { setRowInputs((p) => ({ ...p, [psId]: { ...p[psId], value } })) }

  function submit(ps, idx, rawValue) {
    const val = rawValue.trim()
    if (!val) return
    const mode = getMode(ps.id)
    const ticket = (mode === 'scanner' && isBarcode(val)) ? extractFromBarcode(val) : val
    // Clear input and advance focus immediately — don't wait for the API response.
    // This is the fix for the race condition: the next barcode scanned will land in
    // the correct (next) input because focus has already moved.
    setValue(ps.id, '')
    const nextPs = visiblePackStates[idx + 1]
    if (nextPs) inputRefs.current[nextPs.id]?.focus()
    scanMutation.mutate({ packId: ps.packId, ticket, psId: ps.id })
  }

  function handleKeyDown(e, ps, idx) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    justPressedEnter.current[ps.id] = true
    submit(ps, idx, getValue(ps.id))
  }

  function handleBlur(e, ps, idx) {
    // Skip if Enter already handled this — the input blurs as focus moves away
    if (justPressedEnter.current[ps.id]) {
      justPressedEnter.current[ps.id] = false
      return
    }
    submit(ps, idx, e.target.value)
  }

  const visiblePackStates = packStates.filter((ps) => {
    const flags = ps.flags || []
    if (search && !ps.pack.packId.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'errors')    return flags.some(isError)
    if (filter === 'warnings')  return flags.length > 0 && !flags.some(isError)
    if (filter === 'ok')        return ps.endTicket != null && flags.length === 0
    if (filter === 'unscanned') return ps.endTicket == null
    return true
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading shift…</div>
  )
  if (!shift) return (
    <div className="flex items-center justify-center h-40 text-red-500 text-sm">Shift not found</div>
  )

  const isClosed = shift.status === 'CLOSED'
  const scannedCount = packStates.filter((ps) => ps.endTicket != null).length
  const totalUnits = packStates.reduce((s, ps) => s + (ps.computedUnits || 0), 0)
  const totalAmount = packStates.reduce((s, ps) => s + (ps.computedAmount || 0), 0)
  const errorCount = packStates.filter((ps) => (ps.flags || []).some(isError)).length

  const counts = {
    all:       packStates.length,
    errors:    errorCount,
    warnings:  packStates.filter((ps) => { const f = ps.flags || []; return f.length > 0 && !f.some(isError) }).length,
    ok:        packStates.filter((ps) => ps.endTicket != null && (ps.flags || []).length === 0).length,
    unscanned: packStates.filter((ps) => ps.endTicket == null).length,
  }

  return (
    <div>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-gray-900">Live Scan</h2>
            {isClosed && <StatusPill status="CLOSED" />}
          </div>
          <p className="text-gray-500 text-sm">{shift.date} · {shift.shiftTag}</p>
        </div>
        {!isClosed && (
          <button
            className="btn-secondary btn-sm flex-shrink-0"
            onClick={() => navigate(`/shifts/${shiftId}/commit`)}
          >
            Review &amp; Commit →
          </button>
        )}
      </div>

      {/* ── Stat chips ────────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap mb-4">
        <StatChip
          label="Scanned"
          value={`${scannedCount} / ${packStates.length}`}
          bg={scannedCount === packStates.length ? 'bg-emerald-50' : 'bg-gray-100'}
          color={scannedCount === packStates.length ? 'text-emerald-700' : 'text-gray-700'}
        />
        <StatChip label="Units" value={totalUnits} />
        <StatChip
          label="Instant Sale"
          value={fmt(totalAmount)}
          bg="bg-emerald-50"
          color="text-emerald-700"
        />
        {errorCount > 0 && (
          <StatChip
            label="Errors"
            value={errorCount}
            bg="bg-red-50"
            color="text-red-600"
          />
        )}
      </div>

      {isClosed && (
        <div className="rounded-lg bg-gray-100 border border-gray-200 text-gray-600 text-xs px-3 py-2.5 mb-4">
          This shift is closed — showing committed data.
        </div>
      )}

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <FilterBar
        filter={filter} onFilter={setFilter}
        search={search} onSearch={setSearch}
        counts={counts}
      />

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="flex gap-3 items-start">

        {/* Scan table */}
        <div className="flex-1 min-w-0 card p-0 overflow-hidden">
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <table className="w-full text-sm" style={{ tableLayout: 'auto' }}>
            <thead className="bg-gray-50 border-b-2 border-gray-200 sticky top-0 z-10">
              <tr>
                {/* left-border accent spacer */}
                <th className="w-1 p-0 sticky left-0 bg-gray-50 z-20" />
                <th className="text-left px-2 py-2.5 text-xs font-medium text-gray-500 sticky left-1 bg-gray-50 z-20 w-8">#</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 sticky left-9 bg-gray-50 z-20 whitespace-nowrap">Pack</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Size</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Price</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Start</th>
                <th style={{ width: '152px' }} className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 bg-blue-50/50">Scan</th>
                <th style={{ width: '52px' }} className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">End</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Units</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Amount</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Mode</th>
                <th style={{ width: '110px' }} className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Flags</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {visiblePackStates.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center text-gray-400 text-sm py-12">
                    No packs match this filter.
                  </td>
                </tr>
              )}

              {visiblePackStates.map((ps, idx) => {
                const flags = ps.flags || []
                const hasError = flags.some(isError)
                const hasWarning = flags.length > 0 && !hasError
                const isScanned = ps.endTicket != null
                const isActive  = activeRow === ps.id
                const mode = getMode(ps.id)
                const liveVal = getValue(ps.id)

                const liveExtracted = liveVal && isBarcode(liveVal) ? extractFromBarcode(liveVal) : liveVal || null
                const displayEnd = ps.endTicket ?? (liveVal && mode === 'scanner' ? liveExtracted : null)

                // Row background
                const rowBg = isActive  ? 'bg-blue-100'
                  : hasError            ? 'bg-red-50'
                  : hasWarning          ? 'bg-amber-50/70'
                  : isScanned           ? (idx % 2 === 0 ? 'bg-emerald-50/50' : 'bg-emerald-50/80')
                  : idx % 2 === 0       ? 'bg-white'
                  : 'bg-slate-50/70'

                // Left-border accent color
                const accentColor = isActive   ? 'bg-blue-500'
                  : hasError                   ? 'bg-red-500'
                  : hasWarning                 ? 'bg-amber-400'
                  : isScanned                  ? 'bg-emerald-500'
                  : 'bg-transparent'

                // Number colors
                const unitsColor = ps.computedUnits == null ? 'text-gray-300'
                  : ps.computedUnits < 0      ? 'text-red-600 font-bold'
                  : ps.computedUnits === 0    ? 'text-gray-400'
                  : 'text-gray-900 font-semibold'
                const amountColor = ps.computedAmount == null ? 'text-gray-300'
                  : ps.computedAmount < 0     ? 'text-red-600 font-bold'
                  : 'text-emerald-700 font-semibold'

                // Sticky cell background (must be solid, no opacity)
                const stickyBg = isActive  ? 'bg-blue-100'
                  : hasError               ? 'bg-red-50'
                  : hasWarning             ? 'bg-amber-50'
                  : isScanned              ? 'bg-emerald-50'
                  : idx % 2 === 0          ? 'bg-white'
                  : 'bg-slate-50'

                return (
                  <tr
                    key={ps.id}
                    className={`${rowBg} hover:bg-blue-50/40 transition-colors duration-75 group`}
                  >
                    {/* Left border accent (narrow column) */}
                    <td className={`w-1 p-0 sticky left-0 z-10 ${stickyBg}`}>
                      <div className={`h-full w-1 min-h-[40px] ${accentColor}`} />
                    </td>

                    {/* Row number */}
                    <td className={`px-2 py-2.5 text-gray-400 text-xs sticky left-1 z-10 ${stickyBg}`}>
                      {idx + 1}
                    </td>

                    {/* Pack ID */}
                    <td className={`px-3 py-2.5 sticky left-9 z-10 ${stickyBg}`}>
                      <p className="font-mono font-bold text-xs whitespace-nowrap text-gray-800">{ps.pack.packId}</p>
                      {ps.pack.gameName && (
                        <p className="text-gray-400 text-[10px] whitespace-nowrap mt-0.5">{ps.pack.gameName}</p>
                      )}
                    </td>

                    {/* Size */}
                    <td className="px-3 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap tabular-nums">
                      {ps.pack.packSize}
                    </td>

                    {/* Price */}
                    <td className="px-3 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap tabular-nums">
                      ${ps.pack.ticketValue.toFixed(0)}
                    </td>

                    {/* Start */}
                    <td className="px-3 py-2.5 text-right">
                      {isClosed ? (
                        <span className="font-mono text-xs font-medium tabular-nums">{ps.startTicket ?? '—'}</span>
                      ) : isAdmin && editingStart[ps.id] ? (
                        <input
                          className="input w-20 text-xs py-1 font-mono text-right"
                          type="number"
                          autoFocus
                          defaultValue={ps.startTicket ?? ''}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target.value) {
                              startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) })
                              setEditingStart((p) => ({ ...p, [ps.id]: false }))
                            }
                            if (e.key === 'Escape') setEditingStart((p) => ({ ...p, [ps.id]: false }))
                          }}
                          onBlur={(e) => {
                            if (e.target.value) startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) })
                            setEditingStart((p) => ({ ...p, [ps.id]: false }))
                          }}
                        />
                      ) : ps.startTicket != null ? (
                        <span className="inline-flex items-center gap-1 group/start">
                          <span className="font-mono text-xs font-medium tabular-nums">{ps.startTicket}</span>
                          {isAdmin && (
                            <button
                              className="text-gray-200 group-hover/start:text-blue-400 hover:!text-blue-600 text-sm leading-none transition-colors"
                              title="Edit start ticket"
                              onClick={() => setEditingStart((p) => ({ ...p, [ps.id]: true }))}
                            >✎</button>
                          )}
                        </span>
                      ) : (
                        <input
                          className="input w-16 text-xs py-1 text-right"
                          type="number"
                          placeholder="Set…"
                          onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value) startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) }) }}
                          onBlur={(e) => { if (e.target.value) startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) }) }}
                        />
                      )}
                    </td>

                    {/* Scan cell */}
                    <td className="px-3 py-2 bg-blue-50/20">
                      {isClosed ? (
                        <span className="font-mono text-xs text-gray-500 truncate block max-w-[120px]" title={ps.rawBarcode || ''}>
                          {ps.rawBarcode || '—'}
                        </span>
                      ) : mode === 'scanner' ? (
                        <div>
                          <input
                            ref={(el) => (inputRefs.current[ps.id] = el)}
                            className={`input w-36 text-xs py-1.5 font-mono transition-all duration-100 focus:ring-2 ${
                              hasError    ? 'border-red-400 focus:ring-red-300'
                              : isScanned ? 'border-emerald-400 focus:ring-emerald-300'
                              : 'border-blue-300 focus:ring-blue-300'
                            }`}
                            type="text"
                            placeholder="Scan barcode…"
                            value={liveVal}
                            onChange={(e) => setValue(ps.id, e.target.value)}
                            onFocus={() => setActiveRow(ps.id)}
                            onBlur={(e) => { setActiveRow(null); handleBlur(e, ps, idx) }}
                            onKeyDown={(e) => handleKeyDown(e, ps, idx)}
                          />
                          {ps.rawBarcode && !liveVal && (
                            <p className="font-mono text-[10px] text-gray-400 truncate max-w-[144px] mt-0.5" title={ps.rawBarcode}>
                              {ps.rawBarcode}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs italic">manual mode</span>
                      )}
                      {rowErrors[ps.id] && (
                        <p className="text-red-600 text-[10px] font-medium mt-1 bg-red-50 px-1 py-0.5 rounded">
                          {rowErrors[ps.id]}
                        </p>
                      )}
                    </td>

                    {/* End */}
                    <td className="px-3 py-2.5 text-right">
                      {isClosed || mode === 'scanner' ? (
                        <span className="font-mono text-xs font-semibold tabular-nums">{displayEnd ?? '—'}</span>
                      ) : (
                        <input
                          ref={(el) => (inputRefs.current[ps.id] = el)}
                          className={`input w-16 text-xs py-1.5 font-mono text-right ${
                            hasError ? 'border-red-400' : isScanned ? 'border-emerald-400' : ''
                          }`}
                          type="text"
                          placeholder="#"
                          value={liveVal}
                          onChange={(e) => setValue(ps.id, e.target.value)}
                          onFocus={() => setActiveRow(ps.id)}
                          onBlur={(e) => { setActiveRow(null); handleBlur(e, ps, idx) }}
                          onKeyDown={(e) => handleKeyDown(e, ps, idx)}
                        />
                      )}
                    </td>

                    {/* Units */}
                    <td className={`px-3 py-2.5 text-xs text-right tabular-nums ${unitsColor}`}>
                      {ps.computedUnits ?? '—'}
                    </td>

                    {/* Amount */}
                    <td className={`px-3 py-2.5 text-xs text-right tabular-nums ${amountColor}`}>
                      {ps.computedAmount != null ? fmt(ps.computedAmount) : '—'}
                    </td>

                    {/* Mode toggle */}
                    <td className="px-3 py-2.5 text-center">
                      {!isClosed && (
                        <div className="flex rounded-lg overflow-hidden border border-gray-200 w-fit mx-auto text-xs shadow-sm">
                          <button
                            className={`px-2 py-1 font-medium transition-colors ${
                              mode === 'scanner' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                            }`}
                            onClick={() => setMode(ps.id, 'scanner')}
                          >
                            Scan
                          </button>
                          <button
                            className={`px-2 py-1 font-medium transition-colors ${
                              mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                            }`}
                            onClick={() => setMode(ps.id, 'manual')}
                          >
                            Manual
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Flags */}
                    <td className="px-3 py-2.5 max-w-[110px]">
                      <div className="flex gap-1 flex-wrap">
                        {flags.length === 0 && isScanned && (
                          <StatusPill status="OK" />
                        )}
                        {flags.map((f) => <FlagBadge key={f} flag={f} />)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {scannedCount > 0 && filter === 'all' && !search && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0 z-10">
                <tr>
                  <td colSpan={8} className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-right">
                    TOTAL — {scannedCount}/{packStates.length} scanned
                  </td>
                  <td className="px-3 py-2.5 text-xs font-bold text-right tabular-nums">{totalUnits}</td>
                  <td className="px-3 py-2.5 text-xs font-bold text-right text-emerald-700 tabular-nums">{fmt(totalAmount)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
          </div>
        </div>

        {/* Reconciliation panel (collapsible) */}
        <div className="flex-shrink-0 flex items-start gap-1">
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="mt-1 p-1.5 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors text-xs shadow-sm"
            title={panelOpen ? 'Hide panel' : 'Show reconciliation'}
          >
            {panelOpen ? '›' : '‹'}
          </button>
          {panelOpen && (
            <ReconciliationPanel
              shift={shift}
              shiftId={shiftId}
              isClosed={isClosed}
              instantSale={totalAmount}
              canCommit={true}
              onCommit={() => navigate(`/shifts/${shiftId}/commit`)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
