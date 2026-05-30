require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

// A small representative set of packs for the demo org
const DEMO_PACKS = [
  { packId: 'DEMO-001', packSize: 50,  ticketValue: 50, gameName: '$50 Pack', scannerNumber: '49001912790205005000000000073', lastTicket: 20 },
  { packId: 'DEMO-002', packSize: 50,  ticketValue: 30, gameName: '$30 Pack', scannerNumber: '54200228420313005080000000068', lastTicket: 10 },
  { packId: 'DEMO-003', packSize: 100, ticketValue: 20, gameName: '$20 Pack', scannerNumber: '51900341110312010080000000059', lastTicket: 30 },
  { packId: 'DEMO-004', packSize: 100, ticketValue: 10, gameName: '$10 Pack', scannerNumber: '47701240370611010070000000070', lastTicket: 15 },
  { packId: 'DEMO-005', packSize: 150, ticketValue:  5, gameName:  '$5 Pack', scannerNumber: '50400476541040515060000000076', lastTicket: 50 },
  { packId: 'DEMO-006', packSize: 200, ticketValue:  2, gameName:  '$2 Pack', scannerNumber: '53200019380280220040000000068', lastTicket:  5 },
  { packId: 'DEMO-007', packSize: 150, ticketValue:  1, gameName:  '$1 Pack', scannerNumber: '53700021791420115030000000070', lastTicket: 21 },
]

async function main() {
  console.log('Seeding PackTrack database...')

  // ── Super Admin (no org — can see everything) ────────────────────────────────
  const superHash = await bcrypt.hash('superadmin123', 10)
  await prisma.user.upsert({
    where:  { email: 'super@packtrack.app' },
    update: {},
    create: {
      name:          'Super Admin',
      email:         'super@packtrack.app',
      passwordHash:  superHash,
      role:          'SUPER_ADMIN',
      emailVerified: true,
      orgId:         null,
    },
  })

  // ── Demo Organization ────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where:  { slug: 'demo-store' },
    update: {},
    create: { name: 'Demo Store', slug: 'demo-store', status: 'ACTIVE' },
  })

  await prisma.orgSettings.upsert({
    where:  { orgId: org.id },
    update: {},
    create: { orgId: org.id, toleranceTickets: 2 },
  })

  // ── Demo Org Users ───────────────────────────────────────────────────────────
  const [adminHash, reviewerHash, operatorHash] = await Promise.all([
    bcrypt.hash('admin123',    10),
    bcrypt.hash('reviewer123', 10),
    bcrypt.hash('operator123', 10),
  ])

  for (const [email, name, role, hash] of [
    ['admin@demo.com',    'Demo Admin',    'ADMIN',    adminHash],
    ['reviewer@demo.com', 'Demo Reviewer', 'REVIEWER', reviewerHash],
    ['operator@demo.com', 'Demo Operator', 'OPERATOR', operatorHash],
  ]) {
    await prisma.user.upsert({
      where:  { email },
      update: {},
      create: { name, email, passwordHash: hash, role, orgId: org.id, emailVerified: true },
    })
  }

  // ── Demo Packs ───────────────────────────────────────────────────────────────
  for (const p of DEMO_PACKS) {
    const pack = await prisma.pack.upsert({
      where:  { orgId_packId: { orgId: org.id, packId: p.packId } },
      update: {},
      create: {
        orgId:         org.id,
        packId:        p.packId,
        packSize:      p.packSize,
        ticketValue:   p.ticketValue,
        gameName:      p.gameName,
        scannerNumber: p.scannerNumber,
      },
    })
    await prisma.scannerState.upsert({
      where:  { packId: pack.id },
      update: { lastCommittedTicket: p.lastTicket },
      create: { packId: pack.id, lastCommittedTicket: p.lastTicket },
    })
  }

  console.log(`✓ ${DEMO_PACKS.length} demo packs seeded`)
  console.log('')
  console.log('  Super Admin (no org):')
  console.log('    super@packtrack.app / superadmin123')
  console.log('')
  console.log('  Demo Store org users:')
  console.log('    admin@demo.com    / admin123')
  console.log('    reviewer@demo.com / reviewer123')
  console.log('    operator@demo.com / operator123')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
