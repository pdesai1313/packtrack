import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getReport } from '../api/reports'

function fmt(n) {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function today() { return new Date().toISOString().split('T')[0] }

function exportCsv(data, from, to) {
  const cols = [
    'Date', 'Shift', 'Units',
    'Instant Sale', 'Online Sale', 'Total Sale',
    'ATM', 'Online Cash', 'Instant Cash', 'Total Cash',
    'Expected COH', 'Actual COH', 'Overall Total',
  ]
  const cell = (v) => (v == null ? '' : String(v).includes(',') ? `"${v}"` : v)
  const money = (v) => (v == null ? '' : Number(v).toFixed(2))
  const rows = [cols.join(',')]

  for (const day of data.byDay) {
    for (const shift of day.shifts) {
      rows.push([
        cell(day.date),
        cell(shift.shiftTag),
        cell(shift.units),
        money(shift.instantSale),
        money(shift.onlineSale),
        money(shift.totalSale),
        money(shift.atm),
        money(shift.onlineCash),
        money(shift.instantCash),
        money(shift.totalCash),
        money(shift.expectedCOH),
        money(shift.actualCOH),
        money(shift.overallTotal),
      ].join(','))
    }
  }

  // Summary totals row
  const s = data.summary
  rows.push([
    'TOTAL', '', cell(s.totalUnits),
    money(s.instantSale), money(s.onlineSale), money(s.totalSale),
    money(s.atm), money(s.onlineCash), money(s.instantCash), money(s.totalCash),
    money(s.expectedCOH), money(s.actualCOH), money(s.overallTotal),
  ].join(','))

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `report-${from}-to-${to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function getPeriodDates(period) {
  const t = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (period === 'today') return { from: today(), to: today() }
  if (period === 'week') {
    const sunday = new Date(t)
    sunday.setDate(t.getDate() - t.getDay()) // rewind to Sunday
    const saturday = new Date(sunday)
    saturday.setDate(sunday.getDate() + 6)   // forward to Saturday
    return { from: iso(sunday), to: iso(saturday) }
  }
  if (period === 'last_week') {
    const lastSunday = new Date(t)
    lastSunday.setDate(t.getDate() - t.getDay() - 7)
    const lastSaturday = new Date(lastSunday)
    lastSaturday.setDate(lastSunday.getDate() + 6)
    return { from: iso(lastSunday), to: iso(lastSaturday) }
  }
  if (period === 'month') return { from: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-01`, to: today() }
  if (period === 'year')  return { from: `${t.getFullYear()}-01-01`, to: today() }
  return null
}

const PAGE_SIZE = 7

function SummaryCard({ label, value, sub, highlight }) {
  const color  = highlight == null ? 'text-gray-900' : highlight >= 0 ? 'text-green-700' : 'text-red-600'
  const bg     = highlight == null ? 'bg-white'      : highlight >= 0 ? 'bg-green-50'    : 'bg-red-50'
  const border = highlight == null ? 'border-gray-100' : highlight >= 0 ? 'border-green-200' : 'border-red-200'
  return (
    <div className={`rounded-2xl border ${border} ${bg} px-4 py-3.5 shadow-sm hover:shadow-md transition-shadow`}>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function OverallCell({ value }) {
  if (value == null) return <span className="text-gray-300">—</span>
  return <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>{value >= 0 ? `+${fmt(value)}` : fmt(value)}</span>
}

const TH = ({ children, right }) => (
  <th className={`px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
)

function SectionLabel({ children }) {
  return <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">{children}</p>
}

export default function Reports() {
  const [period, setPeriod] = useState('month')
  const [expanded, setExpanded] = useState({})
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [dayPage, setDayPage] = useState(1)
  useEffect(() => { setDayPage(1) }, [period, customFrom, customTo])

  const dates = period === 'custom'
    ? (customFrom && customTo ? { from: customFrom, to: customTo } : null)
    : getPeriodDates(period)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['reports', dates?.from, dates?.to],
    queryFn: () => getReport(dates.from, dates.to),
    enabled: !!dates,
  })

  const s = data?.summary
  const periods = [
    { key: 'today',     label: 'Today' },
    { key: 'week',      label: 'This Week' },
    { key: 'last_week', label: 'Last Week' },
    { key: 'month',     label: 'This Month' },
    { key: 'year',      label: 'This Year' },
    { key: 'custom',    label: 'Custom' },
  ]

  const totalDayPages = data ? Math.ceil(data.byDay.length / PAGE_SIZE) : 0
  const paginatedDays = data ? data.byDay.slice((dayPage - 1) * PAGE_SIZE, dayPage * PAGE_SIZE) : []

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Reports</h2>
          <p className="text-gray-400 text-xs mt-0.5">Sales and cash reconciliation summary</p>
        </div>
        {data && dates && (
          <button
            className="btn-secondary btn-sm"
            onClick={() => exportCsv(data, dates.from, dates.to)}
          >
            ↓ CSV
          </button>
        )}
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

      {/* Custom date range */}
      {period === 'custom' && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" className="input py-1 text-sm" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" className="input py-1 text-sm" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      {!dates && <p className="text-gray-400 text-sm">Select a date range to view the report.</p>}
      {dates && isLoading && <p className="text-gray-400 text-sm">Loading…</p>}

      {s && (
        <>
          {/* Sales */}
          <SectionLabel>Sales</SectionLabel>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <SummaryCard label="Instant Sale" value={fmt(s.instantSale)} sub={`${s.totalUnits.toLocaleString()} units · ${s.shiftsCount} shift${s.shiftsCount !== 1 ? 's' : ''}`} />
            <SummaryCard label="Online Sale"  value={fmt(s.onlineSale)}  sub={s.onlineSale > 0 ? undefined : 'No online sale recorded'} />
            <SummaryCard label="Total Sale"   value={fmt(s.totalSale)} />
          </div>

          {/* Cash */}
          <SectionLabel>Cash</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="ATM"          value={s.atm > 0 ? fmt(s.atm) : '—'} sub={s.atm === 0 ? 'No ATM transactions' : undefined} />
            <SummaryCard label="Online Cash"  value={fmt(s.onlineCash)} />
            <SummaryCard label="Instant Cash" value={fmt(s.instantCash)} />
            <SummaryCard label="Total Cash"   value={fmt(s.totalCash)} />
          </div>

          {/* Reconciliation */}
          <SectionLabel>Reconciliation</SectionLabel>
          <div className="grid grid-cols-3 gap-3 mb-8">
            <SummaryCard label="Expected COH" value={fmt(s.expectedCOH)} />
            <SummaryCard label="Actual COH"   value={fmt(s.actualCOH)}   sub={s.actualCOH == null ? 'No data yet' : undefined} />
            <SummaryCard
              label="Overall Total"
              value={s.overallTotal != null ? (s.overallTotal >= 0 ? `+${fmt(s.overallTotal)}` : fmt(s.overallTotal)) : '—'}
              sub={s.overallTotal == null ? 'No reconciliation data' : s.overallTotal >= 0 ? 'Surplus' : 'Short'}
              highlight={s.overallTotal}
            />
          </div>

          <div className="grid grid-cols-1 gap-5">

            {/* Daily breakdown */}
            <div className="card p-0 shadow-sm">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <p className="text-sm font-semibold">Daily Breakdown</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <TH>Date</TH>
                      <TH>Shifts</TH>
                      <TH right>Instant Sale</TH>
                      <TH right>Online Sale</TH>
                      <TH right>Total Sale</TH>
                      <TH right>ATM</TH>
                      <TH right>Online Cash</TH>
                      <TH right>Instant Cash</TH>
                      <TH right>Total Cash</TH>
                      <TH right>Exp. COH</TH>
                      <TH right>Act. COH</TH>
                      <TH right>Overall</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byDay.length === 0 && (
                      <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400 text-xs">No data for this period.</td></tr>
                    )}
                    {paginatedDays.map((d, idx) => {
                      const isOpen = !!expanded[d.date]
                      const multiShift = d.shifts.length > 1
                      const zebra = idx % 2 === 0 ? '' : 'bg-gray-50/60'
                      return (
                        <>
                          <tr
                            key={d.date}
                            className={`${zebra} ${multiShift ? 'cursor-pointer hover:bg-blue-50/70' : 'hover:bg-blue-50/40'} border-b border-gray-100 transition-colors`}
                            onClick={() => multiShift && setExpanded((p) => ({ ...p, [d.date]: !p[d.date] }))}
                          >
                            <td className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap">
                              <span className="flex items-center gap-1">
                                {multiShift && <span className="text-gray-400 text-[10px]">{isOpen ? '▾' : '▸'}</span>}
                                {d.date}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{d.shifts.map((s) => s.shiftTag).join(', ')}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(d.instantSale)}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(d.onlineSale)}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums font-semibold">{fmt(d.totalSale)}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{d.atm > 0 ? fmt(d.atm) : <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(d.onlineCash)}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(d.instantCash)}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(d.totalCash)}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(d.expectedCOH)}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{d.actualCOH != null ? fmt(d.actualCOH) : <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums font-semibold"><OverallCell value={d.overallTotal} /></td>
                          </tr>
                          {isOpen && d.shifts.map((shift) => (
                            <tr key={shift.id} className="bg-blue-50/80 border-b border-blue-100">
                              <td className="pl-7 pr-3 py-2 text-xs text-gray-500 whitespace-nowrap">└─ {shift.shiftTag}</td>
                              <td className="px-3 py-2 text-xs text-gray-400">{shift.units} units</td>
                              <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-gray-700">{fmt(shift.instantSale)}</td>
                              <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-gray-700">{shift.onlineSale != null ? fmt(shift.onlineSale) : <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-xs text-right font-mono tabular-nums font-semibold text-gray-700">{fmt(shift.totalSale)}</td>
                              <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-gray-700">{shift.atm != null && shift.atm > 0 ? fmt(shift.atm) : <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-gray-700">{shift.onlineCash != null ? fmt(shift.onlineCash) : <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-gray-700">{shift.instantCash != null ? fmt(shift.instantCash) : <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-gray-700">{shift.totalCash != null ? fmt(shift.totalCash) : <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-gray-700">{shift.expectedCOH != null ? fmt(shift.expectedCOH) : <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-gray-700">{shift.actualCOH != null ? fmt(shift.actualCOH) : <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-xs text-right font-mono tabular-nums font-semibold"><OverallCell value={shift.overallTotal} /></td>
                            </tr>
                          ))}
                        </>
                      )
                    })}
                  </tbody>
                  {data.byDay.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td colSpan={2} className="px-3 py-2.5 text-xs font-bold text-gray-700">TOTAL</td>
                        <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(s.instantSale)}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(s.onlineSale)}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(s.totalSale)}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(s.atm)}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(s.onlineCash)}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(s.instantCash)}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(s.totalCash)}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(s.expectedCOH)}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{s.actualCOH != null ? fmt(s.actualCOH) : '—'}</td>
                        <td className={`px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums ${s.overallTotal == null ? 'text-gray-300' : s.overallTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {s.overallTotal != null ? (s.overallTotal >= 0 ? `+${fmt(s.overallTotal)}` : fmt(s.overallTotal)) : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {totalDayPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    Days {(dayPage - 1) * PAGE_SIZE + 1}–{Math.min(dayPage * PAGE_SIZE, data.byDay.length)} of {data.byDay.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDayPage(p => p - 1)}
                      disabled={dayPage === 1}
                      className="px-2.5 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                    >
                      ←
                    </button>
                    <span className="px-2 text-xs text-gray-500 tabular-nums">{dayPage} / {totalDayPages}</span>
                    <button
                      onClick={() => setDayPage(p => p + 1)}
                      disabled={dayPage === totalDayPages}
                      className="px-2.5 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* By game type */}
            <div className="card p-0 shadow-sm">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <p className="text-sm font-semibold">By Game Type</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Game</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Units Sold</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byGame.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-xs">No game data for this period.</td></tr>
                    )}
                    {data.byGame.map((g, idx) => {
                      const pct = s.instantSale > 0 ? Math.round((g.amount / s.instantSale) * 100) : 0
                      const zebra = idx % 2 === 0 ? '' : 'bg-gray-50/60'
                      return (
                        <tr key={g.gameName} className={`${zebra} border-b border-gray-100 hover:bg-blue-50/40 transition-colors`}>
                          <td className="px-4 py-3 text-xs font-semibold text-gray-800">{g.gameName}</td>
                          <td className="px-4 py-3 text-xs text-right font-mono tabular-nums text-gray-600">{g.units.toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs text-right font-mono tabular-nums font-semibold">{fmt(g.amount)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-1.5 rounded-full bg-blue-500 transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold tabular-nums text-gray-600 w-8 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {data.byGame.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td className="px-4 py-2.5 text-xs font-bold text-gray-700">TOTAL</td>
                        <td className="px-4 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{s.totalUnits.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(s.instantSale)}</td>
                        <td className="px-4 py-2.5 text-xs font-bold text-gray-500">100%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

          </div>

          {isFetching && <p className="text-gray-400 text-xs mt-4">Refreshing…</p>}
        </>
      )}
    </div>
  )
}
