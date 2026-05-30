const express = require('express')
const bcrypt = require('bcryptjs')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole } = require('../middleware/auth')
const { audit } = require('../lib/audit')

const router = express.Router()
const prisma = new PrismaClient()

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'REVIEWER', 'OPERATOR']),
})

router.get('/', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  res.json(users)
})

router.post('/', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const result = createUserSchema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const { name, email, password, role } = result.data
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ error: 'Email already registered' })

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })
  await audit(prisma, req.user.id, 'CREATE', 'USER', user.id, `Created user ${user.name} (${user.email}) — role: ${user.role}`)
  res.status(201).json(user)
})

router.put('/:id', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const schema = z.object({
    name: z.string().min(1).optional(),
    role: z.enum(['ADMIN', 'REVIEWER', 'OPERATOR']).optional(),
    active: z.boolean().optional(),
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
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true },
  })
  const changes = []
  if (result.data.role)          changes.push(`role → ${result.data.role}`)
  if (result.data.active === false) changes.push('deactivated')
  if (result.data.active === true)  changes.push('activated')
  if (result.data.name)          changes.push(`name → ${result.data.name}`)
  if (result.data.passwordHash)  changes.push('password changed')
  const desc = `Updated user ${user.name}${changes.length ? ': ' + changes.join(', ') : ''}`
  await audit(prisma, req.user.id, 'UPDATE', 'USER', id, desc)
  res.json(user)
})

module.exports = router
