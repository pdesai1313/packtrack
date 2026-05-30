const express = require('express')
const bcrypt = require('bcryptjs')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole, requireOrg } = require('../middleware/auth')
const { audit } = require('../lib/audit')

const router = express.Router()
const prisma = new PrismaClient()

const createUserSchema = z.object({
  name:     z.string().min(1),
  email:    z.string().email(),
  password: z.string().min(6),
  role:     z.enum(['ADMIN', 'REVIEWER', 'OPERATOR']),
})

router.get('/', verifyAccessToken, requireOrg, requireRole('ADMIN'), async (req, res) => {
  const users = await prisma.user.findMany({
    where:   { orgId: req.user.orgId },
    select:  { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  res.json(users)
})

router.post('/', verifyAccessToken, requireOrg, requireRole('ADMIN'), async (req, res) => {
  const result = createUserSchema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const { name, email, password, role } = result.data
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ error: 'Email already registered' })

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data:   { name, email, passwordHash, role, orgId: req.user.orgId, emailVerified: true },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })
  await audit(prisma, req.user.id, req.user.orgId, 'CREATE', 'USER', user.id, `Created user ${user.name} (${user.email}) — role: ${user.role}`)
  res.status(201).json(user)
})

router.put('/:id', verifyAccessToken, requireOrg, requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id, 10)

  const existing = await prisma.user.findFirst({ where: { id, orgId: req.user.orgId } })
  if (!existing) return res.status(404).json({ error: 'User not found' })

  const schema = z.object({
    name:     z.string().min(1).optional(),
    role:     z.enum(['ADMIN', 'REVIEWER', 'OPERATOR']).optional(),
    active:   z.boolean().optional(),
    password: z.string().min(6).optional(),
  })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const data = { ...result.data }
  if (data.password) {
    data.passwordHash = await bcrypt.hash(data.password, 10)
    delete data.password
  }

  const user = await prisma.user.update({
    where:  { id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true },
  })

  const changes = []
  if (result.data.role)             changes.push(`role → ${result.data.role}`)
  if (result.data.active === false) changes.push('deactivated')
  if (result.data.active === true)  changes.push('activated')
  if (result.data.name)             changes.push(`name → ${result.data.name}`)
  if (result.data.password)         changes.push('password changed')
  await audit(prisma, req.user.id, req.user.orgId, 'UPDATE', 'USER', id, `Updated user ${user.name}${changes.length ? ': ' + changes.join(', ') : ''}`)
  res.json(user)
})

module.exports = router
