const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole } = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

router.get('/', verifyAccessToken, async (req, res) => {
  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, toleranceTickets: 2, posApiToken: '', posStoreId: '' },
  })
  res.json(settings)
})

router.put('/', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const schema = z.object({
    toleranceTickets: z.number().int().min(0).max(100).optional(),
    posApiToken: z.string().optional(),
    posStoreId: z.string().optional(),
  })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    update: result.data,
    create: { id: 1, toleranceTickets: 2, posApiToken: '', posStoreId: '', ...result.data },
  })
  res.json(settings)
})

module.exports = router
