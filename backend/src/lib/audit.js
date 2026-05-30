const { PrismaClient } = require('@prisma/client')
const _prisma = new PrismaClient()

async function audit(prisma, userId, action, entity, entityId, description) {
  try {
    const client = prisma || _prisma
    await client.auditLog.create({
      data: { userId, action, entity, entityId: String(entityId), description },
    })
  } catch (e) {
    console.error('Audit log write failed:', e.message)
  }
}

module.exports = { audit }
