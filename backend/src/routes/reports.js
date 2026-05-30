const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken } = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

/**
 * Convert accumulated machine readings (onlineSale, onlineCash, instantCash)
 * into per-shift deltas for multi-shift days.
 * Shifts must be sorted date ASC, createdAt ASC.
 */
/**
 * Convert accumulated machine/register readings into per-shift deltas
 * for multi-shift days. All five reconciliation fields are entered as
 * day-running totals, so each shift's effective value = raw - previous.
 * Shifts must be sorted date ASC, createdAt ASC.
 */
function applyDayDeltas(shifts) {
  const prev = {}
  return shifts.map((s) => {
    const p = prev[s.date] || {
      onlineSale: null, onlineCash: null, instantCash: null,
      atm: null, actualCashOnHand: null,
    }

    const delta = (raw, prevVal) => {
      if (raw == null) return null
      if (prevVal == null) return raw
      return raw - prevVal
    }

    const effOnlineSale       = delta(s.onlineSale,       p.onlineSale)
    const effOnlineCash       = delta(s.onlineCash,       p.onlineCash)
    const effInstantCash      = delta(s.instantCash,      p.instantCash)
    const effAtm              = delta(s.atm,              p.atm)
    const effActualCashOnHand = delta(s.actualCashOnHand, p.actualCashOnHand)

    prev[s.date] = {
      onlineSale:       s.onlineSale       != null ? s.onlineSale       : p.onlineSale,
      onlineCash:       s.onlineCash       != null ? s.onlineCash       : p.onlineCash,
      instantCash:      s.instantCash      != null ? s.instantCash      : p.instantCash,
      atm:              s.atm              != null ? s.atm              : p.atm,
      actualCashOnHand: s.actualCashOnHand != null ? s.actualCashOnHand : p.actualCashOnHand,
    }

    return {
      ...s,
      onlineSale:       effOnlineSale,
      onlineCash:       effOnlineCash,
      instantCash:      effInstantCash,
      atm:              effAtm,
      actualCashOnHand: effActualCashOnHand,
    }
  })
}

router.get('/', verifyAccessToken, async (req, res) => {
  const schema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  const result = schema.safeParse(req.query)
  if (!result.success) return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' })

  const { from, to } = result.data

  const shifts = applyDayDeltas(await prisma.shift.findMany({
    where: { date: { gte: from, lte: to }, status: 'CLOSED' },
    include: { packSales: { include: { pack: true } } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  }))

  // ── Summary ──────────────────────────────────────────────────────────────
  let instantSale = 0, totalUnits = 0
  let onlineSale = 0, atm = 0, onlineCash = 0, instantCash = 0, actualCOH = 0
  let reconCount = 0

  for (const s of shifts) {
    for (const sale of s.packSales) {
      instantSale += sale.amount
      totalUnits  += sale.unitsSold
    }
    if (s.onlineSale != null)       { onlineSale  += s.onlineSale;       reconCount++ }
    if (s.atm != null)               atm          += s.atm
    if (s.onlineCash != null)        onlineCash   += s.onlineCash
    if (s.instantCash != null)       instantCash  += s.instantCash
    if (s.actualCashOnHand != null)  actualCOH    += s.actualCashOnHand
  }

  const totalSale    = parseFloat((onlineSale + instantSale).toFixed(2))
  const totalCash    = parseFloat((onlineCash + instantCash).toFixed(2))
  const expectedCOH  = parseFloat((totalSale - atm - totalCash).toFixed(2))
  const overallTotal = reconCount > 0 ? parseFloat((actualCOH - expectedCOH).toFixed(2)) : null

  // ── By day ────────────────────────────────────────────────────────────────
  const dayMap = {}
  for (const s of shifts) {
    if (!dayMap[s.date]) dayMap[s.date] = {
      date: s.date, shifts: [],
      instantSale: 0, units: 0,
      onlineSale: 0, atm: 0, onlineCash: 0, instantCash: 0, actualCOH: null, hasRecon: false,
    }
    const d = dayMap[s.date]
    const shiftInstant = s.packSales.reduce((sum, sale) => sum + sale.amount, 0)
    const shiftUnits   = s.packSales.reduce((sum, sale) => sum + sale.unitsSold, 0)
    const shiftOnline   = s.onlineSale     ?? null
    const shiftAtm      = s.atm            ?? null
    const shiftOCash    = s.onlineCash     ?? null
    const shiftICash    = s.instantCash    ?? null
    const shiftTCash    = shiftOCash != null || shiftICash != null
      ? parseFloat(((shiftOCash || 0) + (shiftICash || 0)).toFixed(2)) : null
    const shiftTS       = parseFloat((shiftInstant + (shiftOnline || 0)).toFixed(2))
    const shiftExpCOH   = shiftOnline != null
      ? parseFloat((shiftTS - (shiftAtm || 0) - (shiftTCash || 0)).toFixed(2)) : null
    const shiftActCOH   = s.actualCashOnHand != null ? parseFloat(s.actualCashOnHand.toFixed(2)) : null
    d.shifts.push({
      id: s.id,
      shiftTag: s.shiftTag,
      units: shiftUnits,
      instantSale: parseFloat(shiftInstant.toFixed(2)),
      onlineSale: shiftOnline != null ? parseFloat(shiftOnline.toFixed(2)) : null,
      totalSale: shiftTS,
      atm: shiftAtm != null ? parseFloat(shiftAtm.toFixed(2)) : null,
      onlineCash: shiftOCash != null ? parseFloat(shiftOCash.toFixed(2)) : null,
      instantCash: shiftICash != null ? parseFloat(shiftICash.toFixed(2)) : null,
      totalCash: shiftTCash,
      expectedCOH: shiftExpCOH,
      actualCOH: shiftActCOH,
      overallTotal: shiftActCOH != null && shiftExpCOH != null
        ? parseFloat((shiftActCOH - shiftExpCOH).toFixed(2)) : null,
    })
    d.instantSale += shiftInstant
    d.units       += shiftUnits
    if (s.onlineSale != null)      { d.onlineSale  += s.onlineSale;      d.hasRecon = true }
    if (s.atm != null)               d.atm         += s.atm
    if (s.onlineCash != null)        d.onlineCash  += s.onlineCash
    if (s.instantCash != null)       d.instantCash += s.instantCash
    if (s.actualCashOnHand != null)  d.actualCOH    = (d.actualCOH || 0) + s.actualCashOnHand
  }

  const byDay = Object.values(dayMap).map((d) => {
    const ts   = parseFloat((d.onlineSale + d.instantSale).toFixed(2))
    const tc   = parseFloat((d.onlineCash + d.instantCash).toFixed(2))
    const exp  = parseFloat((ts - d.atm - tc).toFixed(2))
    const overall = d.hasRecon && d.actualCOH != null ? parseFloat((d.actualCOH - exp).toFixed(2)) : null
    return {
      date: d.date,
      shifts: d.shifts,
      units: d.units,
      instantSale: parseFloat(d.instantSale.toFixed(2)),
      onlineSale: parseFloat(d.onlineSale.toFixed(2)),
      totalSale: ts,
      atm: parseFloat(d.atm.toFixed(2)),
      onlineCash: parseFloat(d.onlineCash.toFixed(2)),
      instantCash: parseFloat(d.instantCash.toFixed(2)),
      totalCash: tc,
      expectedCOH: exp,
      actualCOH: d.actualCOH != null ? parseFloat(d.actualCOH.toFixed(2)) : null,
      overallTotal: overall,
    }
  })

  // ── By game ───────────────────────────────────────────────────────────────
  const gameMap = {}
  for (const s of shifts) {
    for (const sale of s.packSales) {
      const name = sale.pack.gameName || 'Other'
      if (!gameMap[name]) gameMap[name] = { gameName: name, units: 0, amount: 0 }
      gameMap[name].units  += sale.unitsSold
      gameMap[name].amount += sale.amount
    }
  }
  const byGame = Object.values(gameMap)
    .map((g) => ({ ...g, amount: parseFloat(g.amount.toFixed(2)) }))
    .sort((a, b) => b.amount - a.amount)

  res.json({
    from, to,
    summary: {
      instantSale: parseFloat(instantSale.toFixed(2)),
      totalUnits,
      onlineSale: parseFloat(onlineSale.toFixed(2)),
      totalSale,
      atm: parseFloat(atm.toFixed(2)),
      onlineCash: parseFloat(onlineCash.toFixed(2)),
      instantCash: parseFloat(instantCash.toFixed(2)),
      totalCash,
      expectedCOH,
      actualCOH: reconCount > 0 ? parseFloat(actualCOH.toFixed(2)) : null,
      overallTotal,
      shiftsCount: shifts.length,
    },
    byDay,
    byGame,
  })
})

module.exports = router
module.exports.applyDayDeltas = applyDayDeltas
