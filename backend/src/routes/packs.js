const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole, requireOrg } = require('../middleware/auth')
const { audit } = require('../lib/audit')

const router = express.Router()
const prisma = new PrismaClient()

const packSchema = z.object({
  packId:        z.string().min(1),
  packSize:      z.number().int().positive(),
  ticketValue:   z.number().positive(),
  gameName:      z.string().optional().nullable(),
  scannerNumber: z.string().min(1),
  ticketOrder:   z.enum(['DESCENDING', 'ASCENDING']).optional(),
})

router.get('/', verifyAccessToken, requireOrg, async (req, res) => {
  const packs = await prisma.pack.findMany({
    where:   { orgId: req.user.orgId },
    include: {
      scannerState: true,
      _count:       { select: { packSales: true } },  // for ticketOrder lock state in UI
    },
    orderBy: { packId: 'asc' },
  })
  res.json(packs)
})

router.post('/', verifyAccessToken, requireOrg, requireRole('ADMIN'), async (req, res) => {
  const result = packSchema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const { orgId } = req.user
  const existing = await prisma.pack.findUnique({
    where: { orgId_packId: { orgId, packId: result.data.packId } },
  })
  if (existing) return res.status(409).json({ error: 'Pack ID already exists' })

  // Default ticketOrder from org settings if not specified
  let ticketOrder = result.data.ticketOrder
  if (!ticketOrder) {
    const settings = await prisma.orgSettings.findUnique({ where: { orgId } })
    ticketOrder = settings?.ticketOrder || 'DESCENDING'
  }

  const pack = await prisma.$transaction(async (tx) => {
    const created = await tx.pack.create({ data: { ...result.data, ticketOrder, orgId } })
    await tx.scannerState.create({ data: { packId: created.id, lastCommittedTicket: 0 } })
    return created
  })

  await audit(prisma, req.user.id, orgId, 'CREATE', 'PACK', pack.id, `Created pack ${pack.packId}${pack.gameName ? ` (${pack.gameName})` : ''}`)
  res.status(201).json(pack)
})

router.put('/:id', verifyAccessToken, requireOrg, requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid pack ID' })

  const existing = await prisma.pack.findFirst({ where: { id, orgId: req.user.orgId } })
  if (!existing) return res.status(404).json({ error: 'Pack not found' })

  const schema = packSchema.partial().extend({ active: z.boolean().optional() })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  // Lock ticketOrder once any PackSale exists for this pack
  if (result.data.ticketOrder && result.data.ticketOrder !== existing.ticketOrder) {
    const saleCount = await prisma.packSale.count({ where: { packId: id } })
    if (saleCount > 0) {
      return res.status(409).json({ error: 'Cannot change ticket order — pack has committed sales' })
    }
  }

  const pack = await prisma.$transaction(async (tx) => {
    const updated = await tx.pack.update({ where: { id }, data: result.data })

    // Deactivating: remove from open shifts; if ticketOrder changed, clear start tickets
    if (result.data.active === false) {
      const openShifts = await tx.shift.findMany({
        where:  { orgId: req.user.orgId, status: 'OPEN' },
        select: { id: true },
      })
      if (openShifts.length > 0) {
        await tx.packState.deleteMany({
          where: { packId: id, shiftId: { in: openShifts.map((s) => s.id) } },
        })
      }
    }

    // If ticketOrder changed on an unused pack, clear any pre-set start tickets in OPEN shifts
    // so they get recomputed correctly with the new direction.
    if (result.data.ticketOrder && result.data.ticketOrder !== existing.ticketOrder) {
      const openShifts = await tx.shift.findMany({
        where:  { orgId: req.user.orgId, status: 'OPEN' },
        select: { id: true },
      })
      if (openShifts.length > 0) {
        await tx.packState.updateMany({
          where: { packId: id, shiftId: { in: openShifts.map((s) => s.id) } },
          data:  { startTicket: null, endTicket: null, computedUnits: null, computedAmount: null, flags: '[]', rawBarcode: null },
        })
      }
    }

    return updated
  })

  const deactivated = result.data.active === false
  const activated   = result.data.active === true
  const desc = deactivated ? `Deactivated pack ${pack.packId}`
    : activated ? `Activated pack ${pack.packId}`
    : `Updated pack ${pack.packId}`
  await audit(prisma, req.user.id, req.user.orgId, 'UPDATE', 'PACK', id, desc)
  res.json(pack)
})

router.delete('/:id', verifyAccessToken, requireOrg, requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid pack ID' })

  const pack = await prisma.pack.findFirst({ where: { id, orgId: req.user.orgId } })
  if (!pack) return res.status(404).json({ error: 'Pack not found' })

  await prisma.$transaction(async (tx) => {
    await tx.packState.deleteMany({ where: { packId: id } })
    await tx.packSale.deleteMany({ where: { packId: id } })
    await tx.scannerState.deleteMany({ where: { packId: id } })
    await tx.pack.delete({ where: { id } })
  })
  await audit(prisma, req.user.id, req.user.orgId, 'DELETE', 'PACK', id, `Deleted pack ${pack.packId}`)
  res.json({ status: 'ok' })
})

module.exports = router
