const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { stringify } = require('csv-stringify/sync')
const { verifyAccessToken, requireRole, requireOrg } = require('../middleware/auth')
const { computeDelta, resolveStartTicket, getEffectiveStartTicket, parseFlags, serializeFlags, isErrorFlag } = require('../lib/delta')
const { audit } = require('../lib/audit')

const router = express.Router()
const prisma = new PrismaClient()

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatShift(shift) {
  return {
    ...shift,
    packStates: shift.packStates?.map((ps) => ({ ...ps, flags: parseFlags(ps.flags) })),
    packSales:  shift.packSales?.map((ps)  => ({ ...ps, flags: parseFlags(ps.flags) })),
  }
}

async function getSettings(orgId) {
  return prisma.orgSettings.upsert({
    where:  { orgId },
    update: {},
    create: { orgId, toleranceTickets: 2 },
  })
}

// ── List shifts ───────────────────────────────────────────────────────────────

router.get('/', verifyAccessToken, requireOrg, async (req, res) => {
  const shifts = await prisma.shift.findMany({
    where:   { orgId: req.user.orgId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    include: {
      createdBy:  { select: { name: true } },
      _count:     { select: { packStates: true } },
      packSales:  { select: { amount: true, unitsSold: true } },
      packStates: { select: { computedAmount: true, computedUnits: true } },
    },
  })
  res.json(shifts.map((s) => {
    const { packSales, packStates, ...rest } = s
    const totalAmount = s.status === 'CLOSED'
      ? packSales.reduce((sum, ps) => sum + (ps.amount || 0), 0)
      : packStates.reduce((sum, ps) => sum + (ps.computedAmount || 0), 0)
    const totalUnits = s.status === 'CLOSED'
      ? packSales.reduce((sum, ps) => sum + (ps.unitsSold || 0), 0)
      : packStates.reduce((sum, ps) => sum + (ps.computedUnits || 0), 0)
    return { ...rest, totalAmount, totalUnits }
  }))
})

// ── Daily summary ─────────────────────────────────────────────────────────────

router.get('/daily', verifyAccessToken, requireOrg, async (req, res) => {
  const dateResult = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.date)
  if (!dateResult.success) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' })

  const { orgId } = req.user
  const date = dateResult.data

  const shifts = await prisma.shift.findMany({
    where:   { orgId, date },
    orderBy: { createdAt: 'asc' },
    include: {
      packSales:  { include: { pack: true } },
      packStates: { include: { pack: true } },
    },
  })

  const packs = await prisma.pack.findMany({
    where:   { orgId, active: true },
    orderBy: { packId: 'asc' },
  })

  const summary = packs.map((pack) => {
    const row = { packId: pack.packId, gameName: pack.gameName, scannerNumber: pack.scannerNumber, shifts: {} }
    for (const s of shifts) {
      const sale  = s.packSales.find((ps) => ps.packId === pack.id)
      const state = s.packStates.find((ps) => ps.packId === pack.id)
      row.shifts[s.id] = sale
        ? { unitsSold: sale.unitsSold, amount: sale.amount, startTicket: sale.startTicket, endTicket: sale.endTicket, committed: true, flags: parseFlags(sale.flags) }
        : state
        ? { unitsSold: state.computedUnits, amount: state.computedAmount, startTicket: state.startTicket, endTicket: state.endTicket, committed: false, flags: parseFlags(state.flags) }
        : null
    }
    return row
  })

  res.json({
    date,
    shifts: shifts.map((s) => ({ id: s.id, shiftTag: s.shiftTag, status: s.status })),
    summary,
  })
})

// ── Create shift ──────────────────────────────────────────────────────────────

router.post('/', verifyAccessToken, requireOrg, requireRole(['ADMIN', 'REVIEWER']), async (req, res) => {
  const schema = z.object({
    date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shiftName:     z.string().min(1).max(100),
    startSource:   z.enum(['previous_day', 'today_last', 'manual']).default('previous_day'),
    manualShiftId: z.number().int().optional().nullable(),
  })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const { date, shiftName, startSource, manualShiftId } = result.data
  const { orgId } = req.user

  const packs = await prisma.pack.findMany({ where: { orgId, active: true }, orderBy: { packId: 'asc' } })

  const shift = await prisma.$transaction(async (tx) => {
    const created = await tx.shift.create({
      data: { orgId, date, shiftTag: shiftName, isAuthoritative: true, status: 'OPEN', createdById: req.user.id },
    })

    for (const pack of packs) {
      const startTicket = await resolveStartTicket({
        startSource, manualShiftId: manualShiftId ?? null,
        packId: pack.id, packSize: pack.packSize, date, orgId, prisma: tx,
      })
      await tx.packState.create({
        data: { orgId, packId: pack.id, shiftId: created.id, startTicket: startTicket ?? null },
      })
    }

    return tx.shift.findUnique({
      where:   { id: created.id },
      include: { packStates: { include: { pack: true } } },
    })
  })

  await audit(prisma, req.user.id, orgId, 'CREATE', 'SHIFT', shift.id, `Created shift ${shift.date} — ${shift.shiftTag}`)
  res.status(201).json(formatShift(shift))
})

// ── Get shift packstates (auto-syncs new active packs for OPEN shifts) ────────

router.get('/:id/packstates', verifyAccessToken, requireOrg, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { orgId } = req.user

  const fetchShift = () => prisma.shift.findFirst({
    where: { id, orgId },
    include: {
      packStates: { include: { pack: { include: { scannerState: true } } }, orderBy: { pack: { packId: 'asc' } } },
      createdBy:  { select: { name: true, email: true } },
    },
  })

  let shift = await fetchShift()
  if (!shift) return res.status(404).json({ error: 'Shift not found' })

  if (shift.status === 'OPEN') {
    const existingPackIds = new Set(shift.packStates.map((ps) => ps.packId))
    const allActive = await prisma.pack.findMany({ where: { orgId, active: true }, orderBy: { packId: 'asc' } })
    const missing = allActive.filter((p) => !existingPackIds.has(p.id))

    if (missing.length > 0) {
      for (const pack of missing) {
        const startTicket = await resolveStartTicket({
          startSource: 'previous_day', manualShiftId: null,
          packId: pack.id, packSize: pack.packSize, date: shift.date, orgId, prisma,
        })
        await prisma.packState.create({
          data: { orgId, packId: pack.id, shiftId: shift.id, startTicket: startTicket ?? null },
        })
      }
      shift = await fetchShift()
    }
  }

  res.json(formatShift(shift))
})

// ── Scan endpoint ─────────────────────────────────────────────────────────────

router.post('/:id/packs/:packId/scan', verifyAccessToken, requireOrg, async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)
  const packId  = parseInt(req.params.packId, 10)
  const { orgId } = req.user

  const result = z.object({ scannedTicket: z.string().min(1) }).safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const [shift, pack, packState, settings] = await Promise.all([
    prisma.shift.findFirst({ where: { id: shiftId, orgId } }),
    prisma.pack.findFirst({ where: { id: packId, orgId } }),
    prisma.packState.findUnique({ where: { orgId_packId_shiftId: { orgId, packId, shiftId } } }),
    getSettings(orgId),
  ])

  if (!shift)     return res.status(404).json({ error: 'Shift not found' })
  if (shift.status === 'CLOSED') return res.status(409).json({ error: 'Shift is already closed' })
  if (!pack)      return res.status(404).json({ error: 'Pack not found' })
  if (!packState) return res.status(404).json({ error: 'PackState not found' })

  const otherStates = await prisma.packState.findMany({
    where:  { shiftId, orgId, packId: { not: packId }, endTicket: { not: null } },
    select: { endTicket: true },
  })

  const { endTicket, computedUnits, computedAmount, flags, rawBarcode } = computeDelta({
    rawInput:         result.data.scannedTicket,
    startTicket:      packState.startTicket,
    packSize:         pack.packSize,
    ticketValue:      pack.ticketValue,
    toleranceTickets: settings.toleranceTickets,
    existingEndTickets: otherStates.map((s) => s.endTicket),
  })

  const updated = await prisma.packState.update({
    where: { id: packState.id },
    data:  { endTicket, computedUnits, computedAmount, flags: serializeFlags(flags), rawBarcode },
  })

  res.json({ packState: { ...updated, flags } })
})

// ── Set start ticket manually ─────────────────────────────────────────────────

router.put('/:id/packs/:packId/start', verifyAccessToken, requireOrg, requireRole(['ADMIN', 'REVIEWER']), async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)
  const packId  = parseInt(req.params.packId, 10)
  const { orgId } = req.user

  const result = z.object({ startTicket: z.number().int().min(0) }).safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const [pack, packState, settings] = await Promise.all([
    prisma.pack.findFirst({ where: { id: packId, orgId } }),
    prisma.packState.findUnique({ where: { orgId_packId_shiftId: { orgId, packId, shiftId } } }),
    getSettings(orgId),
  ])
  if (!packState) return res.status(404).json({ error: 'PackState not found' })

  let updateData = { startTicket: result.data.startTicket }
  if (packState.endTicket != null) {
    const { computedUnits, computedAmount, flags } = computeDelta({
      rawInput:         String(packState.endTicket),
      startTicket:      result.data.startTicket,
      packSize:         pack.packSize,
      ticketValue:      pack.ticketValue,
      toleranceTickets: settings.toleranceTickets,
      existingEndTickets: [],
    })
    updateData = { ...updateData, computedUnits, computedAmount, flags: serializeFlags(flags) }
  }

  const updated = await prisma.packState.update({ where: { id: packState.id }, data: updateData })
  res.json({ ...updated, flags: parseFlags(updated.flags) })
})

// ── Reconciliation (draft save) ───────────────────────────────────────────────

router.put('/:id/reconciliation', verifyAccessToken, requireOrg, async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)

  const schema = z.object({
    onlineSale:       z.number().nullable().optional(),
    atm:              z.number().nullable().optional(),
    onlineCash:       z.number().nullable().optional(),
    instantCash:      z.number().nullable().optional(),
    actualCashOnHand: z.number().nullable().optional(),
  })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const shift = await prisma.shift.findFirst({ where: { id: shiftId, orgId: req.user.orgId } })
  if (!shift) return res.status(404).json({ error: 'Shift not found' })

  const updated = await prisma.shift.update({ where: { id: shiftId }, data: result.data })
  await audit(prisma, req.user.id, req.user.orgId, 'UPDATE', 'SHIFT', shiftId, `Updated reconciliation for shift ${shift.date} — ${shift.shiftTag}`)
  res.json(updated)
})

// ── Exceptions list ───────────────────────────────────────────────────────────

router.get('/:id/exceptions', verifyAccessToken, requireOrg, async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)
  const packStates = await prisma.packState.findMany({
    where:   { shiftId, orgId: req.user.orgId },
    include: { pack: true },
  })
  const exceptions = packStates
    .map((ps) => ({ ...ps, flags: parseFlags(ps.flags) }))
    .filter((ps) => ps.flags.length > 0)
  res.json(exceptions)
})

// ── Commit shift ──────────────────────────────────────────────────────────────

router.post('/:id/commit', verifyAccessToken, requireOrg, requireRole(['ADMIN', 'REVIEWER']), async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)
  const { orgId } = req.user

  const commitSchema = z.object({
    packCommits: z.array(z.object({
      packStateId:    z.number().int(),
      overrideReason: z.string().optional().nullable(),
    })),
  })
  const result = commitSchema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const shift = await prisma.shift.findFirst({
    where:   { id: shiftId, orgId },
    include: { packStates: { include: { pack: true } } },
  })
  if (!shift) return res.status(404).json({ error: 'Shift not found' })
  if (shift.status === 'CLOSED') return res.status(409).json({ error: 'Shift already committed' })

  const overrideMap = {}
  for (const c of result.data.packCommits) overrideMap[c.packStateId] = c.overrideReason || null

  for (const ps of shift.packStates) {
    const flags    = parseFlags(ps.flags)
    const hasErrors = flags.some(isErrorFlag)
    if (hasErrors && !overrideMap[ps.id]) {
      return res.status(422).json({
        error: `Pack ${ps.pack.packId} has unresolved error flags: ${flags.filter(isErrorFlag).join(', ')}. Provide overrideReason.`,
      })
    }
  }

  const committed = await prisma.$transaction(async (tx) => {
    const sales = []
    for (const ps of shift.packStates) {
      const override      = overrideMap[ps.id] || null
      const flags         = parseFlags(ps.flags)
      const effectiveStart = await getEffectiveStartTicket(tx, shiftId, ps.packId, orgId)
      const correctStart  = effectiveStart ?? ps.startTicket ?? 0

      let correctUnits  = ps.computedUnits  ?? 0
      let correctAmount = ps.computedAmount ?? 0
      if (effectiveStart != null && ps.endTicket != null) {
        const rawUnits = ps.endTicket > effectiveStart
          ? effectiveStart + ps.pack.packSize - ps.endTicket
          : effectiveStart - ps.endTicket
        if (rawUnits >= 0) {
          correctUnits  = rawUnits
          correctAmount = parseFloat((rawUnits * ps.pack.ticketValue).toFixed(2))
        }
      }

      const saleData = {
        orgId,
        packId:    ps.packId,
        shiftId,
        startTicket:    correctStart,
        endTicket:      ps.endTicket ?? 0,
        unitsSold:      correctUnits,
        amount:         correctAmount,
        flags:          serializeFlags(flags),
        overrideReason: override,
      }
      const sale = await tx.packSale.upsert({
        where:  { orgId_packId_shiftId: { orgId, packId: ps.packId, shiftId } },
        update: { ...saleData, committedAt: new Date() },
        create: saleData,
      })
      sales.push(sale)

      await tx.packState.update({
        where: { id: ps.id },
        data:  { status: 'CLOSED', overrideReason: override },
      })

      if (ps.endTicket != null) {
        await tx.scannerState.upsert({
          where:  { packId: ps.packId },
          update: { lastCommittedTicket: ps.endTicket, lastCommittedAt: new Date() },
          create: { packId: ps.packId, lastCommittedTicket: ps.endTicket, lastCommittedAt: new Date() },
        })
      }
    }

    await tx.shift.update({ where: { id: shiftId }, data: { status: 'CLOSED' } })
    return sales
  }, { timeout: 60000 })

  const totalAmount = committed.reduce((sum, s) => sum + s.amount, 0)
  await audit(prisma, req.user.id, orgId, 'COMMIT', 'SHIFT', shiftId, `Committed shift ${shift.date} — ${shift.shiftTag} (${committed.length} packs, $${totalAmount.toFixed(2)})`)
  res.json({ status: 'ok', committedAt: new Date().toISOString(), salesCount: committed.length })
})

// ── CSV export ────────────────────────────────────────────────────────────────

router.get('/:id/export', verifyAccessToken, requireOrg, async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)
  const shift = await prisma.shift.findFirst({ where: { id: shiftId, orgId: req.user.orgId } })
  if (!shift) return res.status(404).json({ error: 'Shift not found' })

  const sales = await prisma.packSale.findMany({
    where:   { shiftId, orgId: req.user.orgId },
    include: { pack: true },
    orderBy: { pack: { packId: 'asc' } },
  })

  const rows = sales.map((s) => ({
    date:           shift.date,
    shift_tag:      shift.shiftTag,
    pack_id:        s.pack.packId,
    game_name:      s.pack.gameName || '',
    scanner_number: s.pack.scannerNumber,
    start_ticket:   s.startTicket,
    end_ticket:     s.endTicket,
    units_sold:     s.unitsSold,
    ticket_value:   s.pack.ticketValue,
    amount:         s.amount,
    flags:          parseFlags(s.flags).join(';'),
    override_reason: s.overrideReason || '',
    committed_at:   s.committedAt,
  }))

  const csv = stringify(rows, { header: true })
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="shift-${shiftId}-${shift.date}-${shift.shiftTag}.csv"`)
  res.send(csv)
})

// ── Reopen shift (ADMIN only) ─────────────────────────────────────────────────

router.post('/:id/reopen', verifyAccessToken, requireOrg, requireRole(['ADMIN']), async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)
  const { orgId } = req.user

  const shift = await prisma.shift.findFirst({ where: { id: shiftId, orgId } })
  if (!shift) return res.status(404).json({ error: 'Shift not found' })
  if (shift.status !== 'CLOSED') return res.status(409).json({ error: 'Shift is not closed' })

  const { newDate } = req.body || {}
  if (newDate && !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return res.status(400).json({ error: 'Invalid date format — use YYYY-MM-DD' })
  }
  const targetDate  = newDate || shift.date
  const dateChanged = targetDate !== shift.date

  const oldDateOtherCount = await prisma.shift.count({
    where: { orgId, date: shift.date, status: 'CLOSED', id: { not: shiftId } },
  })
  const newDateOtherCount = dateChanged
    ? await prisma.shift.count({ where: { orgId, date: targetDate, status: 'CLOSED' } })
    : 0

  await prisma.$transaction(async (tx) => {
    await tx.shift.update({ where: { id: shiftId }, data: { status: 'OPEN', date: targetDate } })
    await tx.packState.updateMany({
      where: { shiftId },
      data:  {
        status: 'OPEN',
        overrideReason: null,
        ...(dateChanged ? { startTicket: null } : {}),
      },
    })
  })

  const warnings = []
  if (oldDateOtherCount > 0) {
    warnings.push(`${oldDateOtherCount} committed shift(s) on ${shift.date} may now have incorrect start tickets — consider reopening and re-committing them too.`)
  }
  if (dateChanged && newDateOtherCount > 0) {
    warnings.push(`${newDateOtherCount} committed shift(s) already exist on ${targetDate} — their start ticket chain may be affected after you re-commit.`)
  }

  await audit(prisma, req.user.id, orgId, 'UPDATE', 'SHIFT', shiftId, `Reopened shift ${shift.date}${dateChanged ? ` → ${targetDate}` : ''} — ${shift.shiftTag} for re-commit`)
  res.json({ status: 'ok', warning: warnings.length > 0 ? warnings.join(' ') : null })
})

// ── Delete shift ──────────────────────────────────────────────────────────────

router.delete('/:id', verifyAccessToken, requireOrg, requireRole(['ADMIN']), async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)
  const { orgId } = req.user

  const shift = await prisma.shift.findFirst({ where: { id: shiftId, orgId } })
  if (!shift) return res.status(404).json({ error: 'Shift not found' })

  await prisma.$transaction(async (tx) => {
    await tx.packState.deleteMany({ where: { shiftId } })
    await tx.packSale.deleteMany({ where: { shiftId } })
    await tx.shift.delete({ where: { id: shiftId } })
  })
  await audit(prisma, req.user.id, orgId, 'DELETE', 'SHIFT', shiftId, `Deleted shift ${shift.date} — ${shift.shiftTag}`)
  res.json({ status: 'ok' })
})

module.exports = router
