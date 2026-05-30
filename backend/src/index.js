require('dotenv').config()
require('express-async-errors')
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { PrismaClient } = require('@prisma/client')

const authRoutes = require('./routes/auth')
const packRoutes = require('./routes/packs')
const shiftRoutes = require('./routes/shifts')
const userRoutes = require('./routes/users')
const settingsRoutes = require('./routes/settings')
const reportsRoutes = require('./routes/reports')
const groceryRoutes = require('./routes/grocery')
const auditRoutes   = require('./routes/audit')
const posRoutes     = require('./routes/pos')

const app = express()
const prisma = new PrismaClient()

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRoutes)
app.use('/api/packs', packRoutes)
app.use('/api/shifts', shiftRoutes)
app.use('/api/users', userRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/grocery', groceryRoutes)
app.use('/api/audit',   auditRoutes)
app.use('/api/pos',     posRoutes)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = process.env.PORT || 4000

async function autoSeed() {
  const userCount = await prisma.user.count()
  if (userCount === 0) {
    console.log('Empty database detected — running seed...')
    const { execSync } = require('child_process')
    execSync('node prisma/seed.js', { stdio: 'inherit', cwd: process.cwd() })
    console.log('Seed complete.')
  }
}

app.listen(PORT, async () => {
  console.log(`Backend running on http://localhost:${PORT}`)
  await autoSeed()
})
