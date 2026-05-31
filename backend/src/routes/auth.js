const express  = require('express')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const crypto   = require('crypto')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken } = require('../middleware/auth')
const { sendEmail } = require('../lib/email')

const router = express.Router()
const prisma = new PrismaClient()

// ── Helpers ───────────────────────────────────────────────────────────────────

function issueTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role, name: user.name, orgId: user.orgId ?? null }
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY || '15m' })
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' })
  return { accessToken, refreshToken }
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex')
}

function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000)
}

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50) || 'org'
}

async function uniqueSlug(base) {
  const slug = toSlug(base)
  if (!(await prisma.organization.findUnique({ where: { slug } }))) return slug
  for (let i = 2; i <= 99; i++) {
    const candidate = `${slug}-${i}`
    if (!(await prisma.organization.findUnique({ where: { slug: candidate } }))) return candidate
  }
  return `${slug}-${crypto.randomBytes(3).toString('hex')}`
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
// Nothing is written to users/orgs until email is verified.
router.post('/signup', async (req, res) => {
  const { orgName, name, email, password } = req.body || {}

  if (!orgName?.trim() || !name?.trim() || !email?.trim() || !password)
    return res.status(400).json({ error: 'All fields are required' })
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' })

  const normalizedEmail = email.toLowerCase().trim()

  // Block if already a verified user
  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existingUser) return res.status(409).json({ error: 'Email already registered' })

  // Replace any previous pending signup for this email
  await prisma.pendingSignup.deleteMany({ where: { email: normalizedEmail } })

  const passwordHash = await bcrypt.hash(password, 10)
  const token        = makeToken()
  const expiresAt    = hoursFromNow(24)

  await prisma.pendingSignup.create({
    data: { token, orgName: orgName.trim(), name: name.trim(), email: normalizedEmail, passwordHash, expiresAt },
  })

  const verifyUrl = `${process.env.APP_URL}/verify-email?token=${token}`
  await sendEmail({
    to:      normalizedEmail,
    subject: 'Verify your PackTrack account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:8px">Welcome to PackTrack!</h2>
        <p>Hi ${name.trim()}, please verify your email address to activate your account.</p>
        <a href="${verifyUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          Verify Email
        </a>
        <p style="color:#6b7280;font-size:13px">Or paste this link in your browser:<br>${verifyUrl}</p>
        <p style="color:#6b7280;font-size:13px">This link expires in 24 hours.</p>
      </div>
    `,
  })

  res.status(201).json({ message: 'Check your email to verify your address.' })
})

// ── POST /api/auth/verify-email ───────────────────────────────────────────────
// Reads the pending signup, creates org + user, then deletes the pending record.
router.post('/verify-email', async (req, res) => {
  const { token } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Token required' })

  const pending = await prisma.pendingSignup.findUnique({ where: { token } })
  if (!pending) return res.status(400).json({ error: 'Invalid or expired link' })

  if (pending.expiresAt < new Date()) {
    await prisma.pendingSignup.delete({ where: { token } })
    return res.status(400).json({ error: 'Verification link expired. Sign up again.', code: 'TOKEN_EXPIRED' })
  }

  // Double-check email not taken (race condition guard)
  const taken = await prisma.user.findUnique({ where: { email: pending.email } })
  if (taken) {
    await prisma.pendingSignup.delete({ where: { token } })
    return res.status(409).json({ error: 'Email already registered' })
  }

  const slug = await uniqueSlug(pending.orgName)

  const user = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: pending.orgName, slug } })
    await tx.orgSettings.create({ data: { orgId: org.id } })
    const newUser = await tx.user.create({
      data: {
        name:          pending.name,
        email:         pending.email,
        passwordHash:  pending.passwordHash,
        role:          'ADMIN',
        orgId:         org.id,
        emailVerified: true,
      },
    })
    await tx.pendingSignup.delete({ where: { token } })
    return newUser
  })

  const { accessToken, refreshToken } = issueTokens(user)
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, orgId: user.orgId },
    accessToken,
    refreshToken,
  })
})

// ── POST /api/auth/resend-verification ───────────────────────────────────────
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Email required' })

  const normalizedEmail = email.toLowerCase().trim()
  const SAFE = { message: 'If that email exists, a new verification link was sent' }

  const pending = await prisma.pendingSignup.findUnique({ where: { email: normalizedEmail } })
  if (!pending) return res.json(SAFE)

  const token     = makeToken()
  const expiresAt = hoursFromNow(24)
  await prisma.pendingSignup.update({ where: { email: normalizedEmail }, data: { token, expiresAt } })

  const verifyUrl = `${process.env.APP_URL}/verify-email?token=${token}`
  await sendEmail({
    to:      normalizedEmail,
    subject: 'Verify your PackTrack account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <p>Hi ${pending.name},</p>
        <p>Click below to verify your email address.</p>
        <a href="${verifyUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          Verify Email
        </a>
        <p style="color:#6b7280;font-size:13px">This link expires in 24 hours.</p>
      </div>
    `,
  })

  res.json(SAFE)
})

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials' })

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  if (!user.emailVerified) {
    return res.status(403).json({ error: 'Please verify your email before logging in.', code: 'EMAIL_NOT_VERIFIED' })
  }

  const { accessToken, refreshToken } = issueTokens(user)
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, orgId: user.orgId },
    accessToken,
    refreshToken,
  })
})

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
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

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Email required' })

  const SAFE = { message: "If that email is registered you'll receive a reset link shortly" }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (!user || !user.emailVerified) return res.json(SAFE)

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
  const token     = makeToken()
  const expiresAt = hoursFromNow(1)
  await prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } })

  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`
  await sendEmail({
    to:      user.email,
    subject: 'Reset your PackTrack password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <p>Hi ${user.name},</p>
        <p>We received a request to reset your PackTrack password.</p>
        <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          Reset Password
        </a>
        <p style="color:#6b7280;font-size:13px">Or paste this link in your browser:<br>${resetUrl}</p>
        <p style="color:#6b7280;font-size:13px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  })

  res.json(SAFE)
})

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {}
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

  const record = await prisma.passwordResetToken.findUnique({ where: { token } })
  if (!record || record.used)       return res.status(400).json({ error: 'Invalid or already used reset link' })
  if (record.expiresAt < new Date()) return res.status(400).json({ error: 'Reset link expired. Request a new one.' })

  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { token }, data: { used: true } }),
  ])

  res.json({ message: 'Password updated successfully' })
})

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => res.json({ ok: true }))

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', verifyAccessToken, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user || !user.active) return res.status(401).json({ error: 'User not found' })
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, orgId: user.orgId })
})

module.exports = router
