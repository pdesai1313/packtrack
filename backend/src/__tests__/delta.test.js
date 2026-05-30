/**
 * Tests for getEffectiveStartTicket, resolveStartTicket, and applyDayDeltas
 *
 * getEffectiveStartTicket scenarios:
 *   A. Brand-new pack, no prior sales → initialTicket(packSize)
 *   B. First shift of day, prior day committed → prior day's endTicket
 *   C. First shift of day, no prior sales → initialTicket(packSize)
 *   D. Second shift of day, first already committed → first PackSale.endTicket
 *   E. Second shift of day, first NOT yet committed → first PackState.endTicket
 *   F. Out-of-order commit: second shift committed first, then first shift commits
 *      → first shift should still get prior-day endTicket (not stale scanner state)
 *   G. Prior day's last PackSale endTicket is 0 (sold to last ticket in book)
 *      → returns 0 correctly (0 is not confused with "never committed")
 *
 * resolveStartTicket scenarios:
 *   H. Scanner state lastCommittedAt is null → pack never committed → initialTicket
 *   I. Scanner state lastCommittedTicket is 0, lastCommittedAt is set → ticket #0 sold → return 0
 *
 * applyDayDeltas scenarios:
 *   1. Single shift per day — values pass through unchanged
 *   2. Two shifts same day — second shift gets delta (raw - previous)
 *   3. Null fields — treated as "not entered"; no delta applied, stays null
 *   4. Negative delta — preserved (not clamped to zero)
 *   5. Mixed null/non-null within same day — only non-null fields accumulate
 */

const { mockDeep } = require('jest-mock-extended')
const { getEffectiveStartTicket, resolveStartTicket, initialTicket } = require('../lib/delta')
const { applyDayDeltas } = require('../routes/reports')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma() {
  return mockDeep()
}

/** Build a minimal shift row */
const shift = (id, date, createdAt) => ({ id, date, createdAt: new Date(createdAt) })

/** Build a minimal PackSale */
const sale = (packId, shiftId, endTicket) => ({ packId, shiftId, endTicket })

/** Build a minimal PackState */
const state = (packId, shiftId, endTicket) => ({ packId, shiftId, endTicket })

/** Build a minimal pack row */
const pack = (id, packSize) => ({ id, packSize })

// ─── getEffectiveStartTicket ───────────────────────────────────────────────────

describe('getEffectiveStartTicket', () => {
  test('A: brand-new pack with no prior sales returns initialTicket(packSize)', async () => {
    const prisma = makePrisma()

    prisma.shift.findUnique.mockResolvedValue(shift(1, '2026-05-01', '2026-05-01T08:00:00Z'))
    prisma.shift.findMany.mockResolvedValue([shift(1, '2026-05-01', '2026-05-01T08:00:00Z')])

    // No prior PackSale before this date
    prisma.packSale.findFirst.mockResolvedValue(null)
    // Pack has packSize 100
    prisma.pack.findUnique.mockResolvedValue(pack(99, 100))

    const result = await getEffectiveStartTicket(prisma, 1, 99)
    expect(result).toBe(initialTicket(100)) // 99
  })

  test('B: first shift of day returns prior day committed PackSale endTicket', async () => {
    const prisma = makePrisma()

    prisma.shift.findUnique.mockResolvedValue(shift(10, '2026-05-07', '2026-05-07T09:00:00Z'))
    // Only one shift on May 7 → myIndex = 0
    prisma.shift.findMany.mockResolvedValue([shift(10, '2026-05-07', '2026-05-07T09:00:00Z')])
    // Prior day had a committed sale ending at ticket 31
    prisma.packSale.findFirst.mockResolvedValue({ endTicket: 31 })

    const result = await getEffectiveStartTicket(prisma, 10, 5)
    expect(result).toBe(31)
  })

  test('C: first shift of day with no prior sales falls back to initialTicket', async () => {
    const prisma = makePrisma()

    prisma.shift.findUnique.mockResolvedValue(shift(1, '2026-05-01', '2026-05-01T08:00:00Z'))
    prisma.shift.findMany.mockResolvedValue([shift(1, '2026-05-01', '2026-05-01T08:00:00Z')])
    prisma.packSale.findFirst.mockResolvedValue(null) // brand new pack
    prisma.pack.findUnique.mockResolvedValue(pack(7, 50))

    const result = await getEffectiveStartTicket(prisma, 1, 7)
    expect(result).toBe(initialTicket(50)) // 49
  })

  test('D: second shift of day returns first shift committed PackSale endTicket', async () => {
    const prisma = makePrisma()
    const PACK_ID = 5

    prisma.shift.findUnique.mockResolvedValue(shift(20, '2026-05-07', '2026-05-07T14:00:00Z'))
    // Two shifts on May 7; this is the second (index 1)
    prisma.shift.findMany.mockResolvedValue([
      shift(10, '2026-05-07', '2026-05-07T09:00:00Z'), // first
      shift(20, '2026-05-07', '2026-05-07T14:00:00Z'), // second (this one)
    ])
    // First shift has a committed PackSale ending at 48
    prisma.packSale.findUnique.mockResolvedValue(sale(PACK_ID, 10, 48))

    const result = await getEffectiveStartTicket(prisma, 20, PACK_ID)
    expect(result).toBe(48)
  })

  test('E: second shift, first NOT yet committed → uses first PackState endTicket', async () => {
    const prisma = makePrisma()
    const PACK_ID = 5

    prisma.shift.findUnique.mockResolvedValue(shift(20, '2026-05-07', '2026-05-07T14:00:00Z'))
    prisma.shift.findMany.mockResolvedValue([
      shift(10, '2026-05-07', '2026-05-07T09:00:00Z'),
      shift(20, '2026-05-07', '2026-05-07T14:00:00Z'),
    ])
    // First shift not committed yet → no PackSale
    prisma.packSale.findUnique.mockResolvedValue(null)
    // But has a scanned PackState with endTicket = 55
    prisma.packState.findUnique.mockResolvedValue(state(PACK_ID, 10, 55))

    const result = await getEffectiveStartTicket(prisma, 20, PACK_ID)
    expect(result).toBe(55)
  })

  test('F: out-of-order commit — later-created shift committed first does NOT corrupt first shift start', async () => {
    // Recreates the May 7 bug scenario:
    //   - Foram's Shift (id=23) created first on May 7
    //   - Full Day Report (id=24) created second on May 8 but for date May 7
    //   - Full Day Report committed first → old code would update scanner state
    //   - Foram's Shift committed second → must still return prior-day's endTicket, not stale scanner state
    const prisma = makePrisma()
    const PACK_ID = 9

    // Foram's Shift is shift 23, date May 7
    prisma.shift.findUnique.mockResolvedValue(shift(23, '2026-05-07', '2026-05-07T14:56:00Z'))
    // Two shifts on May 7 ordered by createdAt
    prisma.shift.findMany.mockResolvedValue([
      shift(23, '2026-05-07', '2026-05-07T14:56:00Z'), // myIndex = 0
      shift(24, '2026-05-07', '2026-05-08T11:27:00Z'), // created next day
    ])
    // Prior day (May 6) last committed PackSale ended at 4
    prisma.packSale.findFirst.mockResolvedValue({ endTicket: 4 })

    const result = await getEffectiveStartTicket(prisma, 23, PACK_ID)
    // Must be 4 (May 6 endTicket), NOT the stale scanner state value (49)
    expect(result).toBe(4)
    // Confirm it queried prior-day PackSales, NOT scanner state
    expect(prisma.scannerState.findUnique).not.toHaveBeenCalled()
  })

  test('G: prior day endTicket is 0 — returns 0 (not confused with "never committed")', async () => {
    // Reproduces the PACK-020 May 9 bug: last ticket sold was #0, new shift should start at 0,
    // but scanner state used to return initialTicket(packSize) because 0 was treated as "empty".
    const prisma = makePrisma()

    prisma.shift.findUnique.mockResolvedValue(shift(27, '2026-05-09', '2026-05-09T16:00:00Z'))
    prisma.shift.findMany.mockResolvedValue([shift(27, '2026-05-09', '2026-05-09T16:00:00Z')])
    // Prior day's last PackSale ended at ticket 0
    prisma.packSale.findFirst.mockResolvedValue({ endTicket: 0 })

    const result = await getEffectiveStartTicket(prisma, 27, 20)
    expect(result).toBe(0) // must be 0, NOT initialTicket(100) = 99
  })
})

// ─── resolveStartTicket ───────────────────────────────────────────────────────

describe('resolveStartTicket', () => {
  test('H: scanner state exists but lastCommittedAt is null → never committed → initialTicket', async () => {
    const prisma = makePrisma()
    prisma.scannerState.findUnique.mockResolvedValue({ lastCommittedTicket: 0, lastCommittedAt: null })

    const result = await resolveStartTicket({ startSource: 'previous_day', packId: 5, packSize: 100, date: '2026-05-09', prisma })
    expect(result).toBe(initialTicket(100)) // 99 — brand-new pack
  })

  test('I: scanner state lastCommittedTicket is 0 and lastCommittedAt is set → last ticket was #0 → return 0', async () => {
    // Ticket #0 is the last ticket in a book. After selling it, the next shift should start at 0,
    // not jump back to initialTicket(packSize). Old bug: 0 was treated as sentinel for "never committed".
    const prisma = makePrisma()
    prisma.scannerState.findUnique.mockResolvedValue({
      lastCommittedTicket: 0,
      lastCommittedAt: new Date('2026-05-08T17:45:00Z'),
    })

    const result = await resolveStartTicket({ startSource: 'previous_day', packId: 5, packSize: 100, date: '2026-05-09', prisma })
    expect(result).toBe(0) // must be 0, NOT initialTicket(100)
  })
})

// ─── applyDayDeltas ────────────────────────────────────────────────────────────

describe('applyDayDeltas', () => {
  test('1: single shift per day passes values through unchanged', () => {
    const input = [
      { date: '2026-05-01', onlineSale: 500, onlineCash: 200, instantCash: 50, atm: 30, actualCashOnHand: 220 },
    ]
    const [result] = applyDayDeltas(input)
    expect(result.onlineSale).toBe(500)
    expect(result.onlineCash).toBe(200)
    expect(result.instantCash).toBe(50)
    expect(result.atm).toBe(30)
    expect(result.actualCashOnHand).toBe(220)
  })

  test('2: second shift of day gets correct delta', () => {
    const input = [
      { date: '2026-05-01', onlineSale: 300, onlineCash: 100, instantCash: 20, atm: 10, actualCashOnHand: 110 },
      { date: '2026-05-01', onlineSale: 500, onlineCash: 180, instantCash: 50, atm: 15, actualCashOnHand: 215 },
    ]
    const [shift1, shift2] = applyDayDeltas(input)

    // First shift is unchanged
    expect(shift1.onlineSale).toBe(300)
    expect(shift1.onlineCash).toBe(100)

    // Second shift gets delta
    expect(shift2.onlineSale).toBe(200)       // 500 - 300
    expect(shift2.onlineCash).toBe(80)        // 180 - 100
    expect(shift2.instantCash).toBe(30)       // 50  - 20
    expect(shift2.atm).toBe(5)                // 15  - 10
    expect(shift2.actualCashOnHand).toBe(105) // 215 - 110
  })

  test('3: null field is treated as not entered and passes through as null', () => {
    const input = [
      { date: '2026-05-01', onlineSale: null, onlineCash: null, instantCash: null, atm: null, actualCashOnHand: null },
      { date: '2026-05-01', onlineSale: null, onlineCash: null, instantCash: null, atm: null, actualCashOnHand: null },
    ]
    const [s1, s2] = applyDayDeltas(input)
    expect(s1.onlineSale).toBeNull()
    expect(s2.onlineSale).toBeNull()
  })

  test('4: negative delta is preserved (not clamped to zero)', () => {
    // Second shift's machine reading is lower than first — unusual but valid (correction entry)
    const input = [
      { date: '2026-05-01', onlineSale: 500, onlineCash: 200, instantCash: 50, atm: 10, actualCashOnHand: 240 },
      { date: '2026-05-01', onlineSale: 480, onlineCash: 190, instantCash: 40, atm: 5,  actualCashOnHand: 225 },
    ]
    const [, shift2] = applyDayDeltas(input)
    expect(shift2.onlineSale).toBe(-20)
    expect(shift2.onlineCash).toBe(-10)
    expect(shift2.instantCash).toBe(-10)
    expect(shift2.atm).toBe(-5)
    expect(shift2.actualCashOnHand).toBe(-15)
  })

  test('5: first shift null then second shift filled — second is treated as fresh value (no delta)', () => {
    // First shift had no reconciliation entered; second shift entered values for the first time
    const input = [
      { date: '2026-05-01', onlineSale: null, onlineCash: null, instantCash: null, atm: null, actualCashOnHand: null },
      { date: '2026-05-01', onlineSale: 300, onlineCash: 120, instantCash: 30,   atm: 10,  actualCashOnHand: 140 },
    ]
    const [, shift2] = applyDayDeltas(input)
    // prevVal is null → delta returns raw value as-is
    expect(shift2.onlineSale).toBe(300)
    expect(shift2.onlineCash).toBe(120)
    expect(shift2.instantCash).toBe(30)
    expect(shift2.atm).toBe(10)
    expect(shift2.actualCashOnHand).toBe(140)
  })

  test('6: three shifts same day chains correctly', () => {
    const input = [
      { date: '2026-05-01', onlineSale: 100, onlineCash: 40, instantCash: 10, atm: 5, actualCashOnHand: 45 },
      { date: '2026-05-01', onlineSale: 250, onlineCash: 90, instantCash: 25, atm: 8, actualCashOnHand: 107 },
      { date: '2026-05-01', onlineSale: 500, onlineCash: 200, instantCash: 60, atm: 20, actualCashOnHand: 240 },
    ]
    const [s1, s2, s3] = applyDayDeltas(input)

    expect(s1.onlineSale).toBe(100)
    expect(s2.onlineSale).toBe(150)  // 250 - 100
    expect(s3.onlineSale).toBe(250)  // 500 - 250
  })

  test('7: different dates are tracked independently (no bleed-over between days)', () => {
    const input = [
      { date: '2026-05-01', onlineSale: 400, onlineCash: 150, instantCash: 40, atm: 10, actualCashOnHand: 180 },
      { date: '2026-05-02', onlineSale: 600, onlineCash: 220, instantCash: 55, atm: 15, actualCashOnHand: 250 },
    ]
    const [day1, day2] = applyDayDeltas(input)
    // Day 2 should NOT subtract Day 1 values
    expect(day1.onlineSale).toBe(400)
    expect(day2.onlineSale).toBe(600) // fresh value for new date
  })
})
