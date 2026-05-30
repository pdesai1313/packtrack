const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole, requireOrg } = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

router.get('/', verifyAccessToken, requireOrg, async (req, res) => {
  const settings = await prisma.orgSettings.upsert({
    where:  { orgId: req.user.orgId },
    update: {},
    create: { orgId: req.user.orgId, toleranceTickets: 2 },
  })
  res.json(settings)
})

router.put('/', verifyAccessToken, requireOrg, requireRole('ADMIN'), async (req, res) => {
  const schema = z.object({
    toleranceTickets: z.number().int().min(0).max(100).optional(),
  })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const settings = await prisma.orgSettings.upsert({
    where:  { orgId: req.user.orgId },
    update: result.data,
    create: { orgId: req.user.orgId, toleranceTickets: 2, ...result.data },
  })
  res.json(settings)
})

module.exports = router
