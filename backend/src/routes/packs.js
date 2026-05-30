const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole } = require('../middleware/auth')
const { audit } = require('../lib/audit')

const router = express.Router()
const prisma = new PrismaClient()

const packSchema = z.object({
  packId: z.string().min(1),
  packSize: z.number().int().positive(),
  ticketValue: z.number().positive(),
  gameName: z.string().optional().nullable(),
  scannerNumber: z.string().min(1),
})

router.get('/', verifyAccessToken, async (req, res) => {
  const packs = await prisma.pack.findMany({
    include: { scannerState: true },
    orderBy: { packId: 'asc' },
  })
  res.json(packs)
})

router.post('/', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const result = packSchema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const existing = await prisma.pack.findUnique({ where: { packId: result.data.packId } })
  if (existing) return res.status(409).json({ error: 'Pack ID already exists' })

  const pack = await prisma.$transaction(async (tx) => {
    const created = await tx.pack.create({ data: result.data })
    await tx.scannerState.create({ data: { packId: created.id, lastCommittedTicket: 0 } })
    return created
  })

  await audit(prisma, req.user.id, 'CREATE', 'PACK', pack.id, `Created pack ${pack.packId}${pack.gameName ? ` (${pack.gameName})` : ''}`)
  res.status(201).json(pack)
})

router.put('/:id', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid pack ID' })

  const schema = packSchema.partial().extend({ active: z.boolean().optional() })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const pack = await prisma.$transaction(async (tx) => {
    const updated = await tx.pack.update({ where: { id }, data: result.data })

    // When deactivating: remove from all open (non-committed) shifts
    if (result.data.active === false) {
      const openShifts = await tx.shift.findMany({ where: { status: 'OPEN' }, select: { id: true } })
      if (openShifts.length > 0) {
        await tx.packState.deleteMany({
          where: { packId: id, shiftId: { in: openShifts.map((s) => s.id) } },
        })
      }
    }

    return updated
  })

  const deactivated = result.data.active === false
  const activated = result.data.active === true
  const desc = deactivated ? `Deactivated pack ${pack.packId}`
    : activated ? `Activated pack ${pack.packId}`
    : `Updated pack ${pack.packId}`
  await audit(prisma, req.user.id, 'UPDATE', 'PACK', id, desc)
  res.json(pack)
})

router.delete('/:id', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid pack ID' })

  const pack = await prisma.pack.findUnique({ where: { id } })
  if (!pack) return res.status(404).json({ error: 'Pack not found' })

  await prisma.$transaction(async (tx) => {
    await tx.packState.deleteMany({ where: { packId: id } })
    await tx.packSale.deleteMany({ where: { packId: id } })
    await tx.scannerState.deleteMany({ where: { packId: id } })
    await tx.pack.delete({ where: { id } })
  })
  await audit(prisma, req.user.id, 'DELETE', 'PACK', id, `Deleted pack ${pack.packId}`)
  res.json({ status: 'ok' })
})

module.exports = router
