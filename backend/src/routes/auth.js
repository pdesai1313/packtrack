const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken } = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

function issueTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role, name: user.name }
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY || '15m' })
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' })
  return { accessToken, refreshToken }
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials' })

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  const { accessToken, refreshToken } = issueTokens(user)
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken, refreshToken })
})

router.post('/refresh', async (req, res) => {
  const token = req.body?.refreshToken
  if (!token) return res.status(401).json({ error: 'No refresh token' })

  try {
    const { id } = jwt.verify(token, process.env.JWT_REFRESH_SECRET)
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user || !user.active) return res.status(401).json({ error: 'User not found' })

    const { accessToken, refreshToken } = issueTokens(user)
    res.json({ accessToken, refreshToken })
  } catch {
    return res.status(401).json({ error: 'Refresh token expired' })
  }
})

router.post('/logout', (req, res) => {
  res.json({ ok: true })
})

router.get('/me', verifyAccessToken, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user || !user.active) return res.status(401).json({ error: 'User not found' })
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role })
})

module.exports = router
