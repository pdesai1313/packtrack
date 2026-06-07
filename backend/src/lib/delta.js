const FLAGS = {
  ERROR_NEGATIVE_DELTA:     'ERROR_NEGATIVE_DELTA',
  ERROR_OVERFLOW:           'ERROR_OVERFLOW',
  ERROR_NON_NUMERIC_TICKET: 'ERROR_NON_NUMERIC_TICKET',
  WARNING_SMALL_MISMATCH:   'WARNING_SMALL_MISMATCH',
  WARNING_DUPLICATE_SCAN:   'WARNING_DUPLICATE_SCAN',
  WARNING_NEW_BOOK:         'WARNING_NEW_BOOK',
  MISSING_START:            'MISSING_START',
}

function parseFlags(str) {
  try { return JSON.parse(str || '[]') } catch { return [] }
}

function serializeFlags(arr) {
  return JSON.stringify(arr || [])
}

function isErrorFlag(flag) {
  return flag.startsWith('ERROR_') || flag === FLAGS.MISSING_START
}

/**
 * Extract ticket number from a hardware-scanner barcode string.
 * Formula: MID(barcode, 11, 3) → characters at 0-indexed positions 10-12.
 */
function extractTicketNumber(raw) {
  const trimmed = raw.trim()
  if (trimmed.length >= 13) {
    const extracted = trimmed.substring(10, 13)
    const num = parseInt(extracted, 10)
    return { ticketNumber: isNaN(num) ? null : num, rawBarcode: trimmed }
  }
  const num = parseInt(trimmed, 10)
  return { ticketNumber: isNaN(num) ? null : num, rawBarcode: null }
}

/**
 * The first ticket number for a fresh (full) pack.
 *   DESCENDING: tickets count down from packSize-1 to 0
 *   ASCENDING:  tickets count up from 0 to packSize-1
 */
function initialTicket(packSize, ticketOrder) {
  return ticketOrder === 'ASCENDING' ? 0 : packSize - 1
}

/**
 * Compute units sold between a known start and end ticket, handling new-book wrap.
 *   DESCENDING normal: end <= start → units = start - end
 *   DESCENDING wrap:   end > start  → units = start + (packSize - end)   (new book opened)
 *   ASCENDING normal:  end >= start → units = end - start
 *   ASCENDING wrap:    end < start  → units = (packSize - start) + end   (new book opened)
 */
function unitsBetween(startTicket, endTicket, packSize, ticketOrder) {
  if (ticketOrder === 'ASCENDING') {
    return endTicket >= startTicket
      ? endTicket - startTicket
      : (packSize - startTicket) + endTicket
  }
  return startTicket >= endTicket
    ? startTicket - endTicket
    : startTicket + (packSize - endTicket)
}

function isWrap(startTicket, endTicket, ticketOrder) {
  return ticketOrder === 'ASCENDING' ? endTicket < startTicket : endTicket > startTicket
}

function computeDelta({
  rawInput,
  startTicket,
  packSize,
  ticketValue,
  toleranceTickets,
  existingEndTickets = [],
  ticketOrder = 'DESCENDING',
}) {
  const flags = []
  const { ticketNumber, rawBarcode } = extractTicketNumber(rawInput)

  if (ticketNumber === null) {
    flags.push(FLAGS.ERROR_NON_NUMERIC_TICKET)
    return { endTicket: null, computedUnits: null, computedAmount: null, flags, rawBarcode }
  }

  const endTicket = ticketNumber

  if (startTicket == null) {
    flags.push(FLAGS.MISSING_START)
    return { endTicket, computedUnits: null, computedAmount: null, flags, rawBarcode }
  }

  const wrapped = isWrap(startTicket, endTicket, ticketOrder)
  if (wrapped) flags.push(FLAGS.WARNING_NEW_BOOK)

  const computedUnits  = unitsBetween(startTicket, endTicket, packSize, ticketOrder)
  const computedAmount = parseFloat((computedUnits * ticketValue).toFixed(2))

  if (computedUnits < 0)            flags.push(FLAGS.ERROR_NEGATIVE_DELTA)
  if (computedUnits > 2 * packSize) flags.push(FLAGS.ERROR_OVERFLOW)

  // Small-mismatch warning — endTicket is within tolerance of the LAST ticket in the book
  if (flags.length === 0 || (flags.length === 1 && flags[0] === FLAGS.WARNING_NEW_BOOK)) {
    const lastTicket = ticketOrder === 'ASCENDING' ? packSize - 1 : 0
    const distance   = Math.abs(endTicket - lastTicket)
    if (distance >= 0 && distance <= toleranceTickets && !wrapped) {
      flags.push(FLAGS.WARNING_SMALL_MISMATCH)
    }
  }

  if (existingEndTickets.includes(endTicket)) {
    flags.push(FLAGS.WARNING_DUPLICATE_SCAN)
  }

  return { endTicket, computedUnits, computedAmount, flags, rawBarcode }
}

/**
 * Resolve the start ticket for a new PackState. Scoped to orgId.
 */
async function resolveStartTicket({ startSource, manualShiftId, packId, packSize, date, orgId, ticketOrder = 'DESCENDING', prisma }) {
  if (startSource === 'today_last') {
    const todayShift = await prisma.shift.findFirst({
      where:   { orgId, date, status: 'CLOSED' },
      orderBy: { createdAt: 'desc' },
    })
    if (todayShift) {
      const sale = await prisma.packSale.findUnique({
        where: { orgId_packId_shiftId: { orgId, packId, shiftId: todayShift.id } },
      })
      if (sale) return sale.endTicket
    }
  }

  if (startSource === 'manual' && manualShiftId) {
    const sale = await prisma.packSale.findUnique({
      where: { orgId_packId_shiftId: { orgId, packId, shiftId: manualShiftId } },
    })
    return sale ? sale.endTicket : null
  }

  const state = await prisma.scannerState.findUnique({ where: { packId } })
  if (!state) return initialTicket(packSize, ticketOrder)
  if (!state.lastCommittedAt) return initialTicket(packSize, ticketOrder)
  return state.lastCommittedTicket
}

/**
 * Compute the correct start ticket for a given shift+pack pair at commit time.
 * Scoped to orgId.
 */
async function getEffectiveStartTicket(prisma, shiftId, packId, orgId) {
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, orgId },
    select: { date: true },
  })
  if (!shift) return null

  const dayShifts = await prisma.shift.findMany({
    where:   { orgId, date: shift.date },
    orderBy: { createdAt: 'asc' },
    select:  { id: true },
  })

  const myIndex = dayShifts.findIndex((s) => s.id === shiftId)

  const fromLastCommittedSale = async () => {
    const lastSale = await prisma.packSale.findFirst({
      where:   { orgId, packId, shift: { date: { lt: shift.date } } },
      orderBy: [{ shift: { date: 'desc' } }, { shift: { createdAt: 'desc' } }],
      select:  { endTicket: true },
    })
    if (lastSale) return lastSale.endTicket
    const pack = await prisma.pack.findFirst({
      where:  { id: packId, orgId },
      select: { packSize: true, ticketOrder: true },
    })
    return pack ? initialTicket(pack.packSize, pack.ticketOrder) : null
  }

  if (myIndex <= 0) return fromLastCommittedSale()

  const prevShiftId = dayShifts[myIndex - 1].id

  const sale = await prisma.packSale.findUnique({
    where:  { orgId_packId_shiftId: { orgId, packId, shiftId: prevShiftId } },
    select: { endTicket: true },
  })
  if (sale) return sale.endTicket

  const prevState = await prisma.packState.findUnique({
    where:  { orgId_packId_shiftId: { orgId, packId, shiftId: prevShiftId } },
    select: { endTicket: true },
  })
  if (prevState?.endTicket != null) return prevState.endTicket

  return fromLastCommittedSale()
}

module.exports = {
  FLAGS, parseFlags, serializeFlags, isErrorFlag,
  computeDelta, resolveStartTicket, getEffectiveStartTicket,
  extractTicketNumber, initialTicket, unitsBetween, isWrap,
}
