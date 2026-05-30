const express = require('express')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole } = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

router.get('/', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const { from, to, entity, action } = req.query

  const where = {}
  if (from && to) {
    where.createdAt = {
      gte: new Date(from + 'T00:00:00.000Z'),
      lte: new Date(to   + 'T23:59:59.999Z'),
    }
  }
  if (entity) where.entity = entity
  if (action) where.action = action

  const logs = await prisma.auditLog.findMany({
    where,
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  res.json(logs)
})

module.exports = router
