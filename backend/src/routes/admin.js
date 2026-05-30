const express = require('express')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole } = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

// All routes here require SUPER_ADMIN — no requireOrg (super admin has no orgId)

// GET /api/admin/stats
router.get('/stats', verifyAccessToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  const [totalOrgs, activeOrgs, totalUsers, totalShifts] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
    prisma.shift.count(),
  ])
  res.json({
    totalOrgs,
    activeOrgs,
    suspendedOrgs: totalOrgs - activeOrgs,
    totalUsers,
    totalShifts,
  })
})

// GET /api/admin/orgs
router.get('/orgs', verifyAccessToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  const orgs = await prisma.organization.findMany({
    include: {
      _count: { select: { users: true, shifts: true, packs: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(orgs)
})

// GET /api/admin/orgs/:id
router.get('/orgs/:id', verifyAccessToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      users:    { select: { id: true, name: true, email: true, role: true, active: true, emailVerified: true, createdAt: true } },
      settings: true,
      _count:   { select: { shifts: true, packs: true, packSales: true } },
    },
  })
  if (!org) return res.status(404).json({ error: 'Organization not found' })
  res.json(org)
})

// PUT /api/admin/orgs/:id  — suspend or activate
router.put('/orgs/:id', verifyAccessToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { status } = req.body || {}
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ error: 'status must be ACTIVE or SUSPENDED' })
  }
  const org = await prisma.organization.findUnique({ where: { id } })
  if (!org) return res.status(404).json({ error: 'Organization not found' })

  const updated = await prisma.organization.update({ where: { id }, data: { status } })
  res.json(updated)
})

module.exports = router
