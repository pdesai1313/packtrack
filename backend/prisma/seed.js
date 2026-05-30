require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

// Packs from "Noon May_01" spreadsheet
// PACK-001 to PACK-077 = column A sequence numbers 1-77
// PACK-078 to PACK-081 = the 4 blank rows (no column A number, placed at end)
// lastTicket = column E (end ticket) — sets starting point for next shift
// NOTE: PACK-030 and PACK-048 share the same barcode — verify in spreadsheet
// NOTE: PACK-064 and PACK-072 share the same barcode — verify in spreadsheet
const PACKS = [
  // $50 packs (50-ticket) — seq 1-6
  { packId:'PACK-001', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'49001912790205005000000000073', lastTicket:20  },
  { packId:'PACK-002', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'49001912780305005000000000073', lastTicket:30  },
  { packId:'PACK-003', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'49001912800055005000000000068', lastTicket:5   },
  { packId:'PACK-004', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'43303534140125005000000000062', lastTicket:12  },
  { packId:'PACK-005', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'43303648760295005000000000084', lastTicket:29  },
  { packId:'PACK-006', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'38705824030085005000000000077', lastTicket:8   },
  // $30 packs (50-ticket) — seq 7-13
  { packId:'PACK-007', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'54200228420313005080000000068', lastTicket:31  },
  { packId:'PACK-008', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'49101028320283005080000000075', lastTicket:28  },
  { packId:'PACK-009', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'53000307180113005050000000061', lastTicket:11  },
  { packId:'PACK-010', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'45801470260463005080000000082', lastTicket:46  },
  { packId:'PACK-011', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'45801451950153005080000000083', lastTicket:15  },
  { packId:'PACK-012', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'37302733500083005080000000076', lastTicket:8   },
  { packId:'PACK-013', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'37302672070023005080000000074', lastTicket:2   },
  // $20 packs (100-ticket) — seq 14-24
  { packId:'PACK-014', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'51900341110312010080000000059', lastTicket:31  },
  { packId:'PACK-015', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'38501233910702010080000000072', lastTicket:70  },
  { packId:'PACK-016', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'51900316390142010080000000072', lastTicket:14  },
  { packId:'PACK-017', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'50900360750352010080000000073', lastTicket:35  },
  { packId:'PACK-018', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'40900917670022010080000000075', lastTicket:2   },
  { packId:'PACK-019', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'53600226270752010080000000075', lastTicket:75  },
  { packId:'PACK-020', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'52300015890142010000000000060', lastTicket:14  },
  { packId:'PACK-021', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'53600192600062010080000000068', lastTicket:6   },
  { packId:'PACK-022', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'39300905510862010080000000079', lastTicket:6   },
  { packId:'PACK-023', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'45200930710172010080000000069', lastTicket:86  },
  { packId:'PACK-024', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'53500268880101010070000000074', lastTicket:17  },
  // $10 packs (100-ticket) — seq 25-50
  { packId:'PACK-025', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'47701240370611010070000000070', lastTicket:10  },
  { packId:'PACK-026', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'48801124090531010070000000073', lastTicket:61  },
  { packId:'PACK-027', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'48300979220611010070000000079', lastTicket:53  },
  { packId:'PACK-028', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'52100914500841010080000000068', lastTicket:61  },
  { packId:'PACK-029', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'52100914490061010080000000070', lastTicket:84  },
  { packId:'PACK-030', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'52100773510991010080000000078', lastTicket:6   },
  { packId:'PACK-031', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'41301414260741010070000000065', lastTicket:99  },
  { packId:'PACK-032', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'52900357040331010070000000069', lastTicket:74  },
  { packId:'PACK-033', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'45700862740961010070000000086', lastTicket:33  },
  { packId:'PACK-034', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'42701107480351010070000000070', lastTicket:96  },
  { packId:'PACK-035', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'34101076960371010070000000075', lastTicket:35  },
  { packId:'PACK-036', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'54100037550181010070000000067', lastTicket:37  },
  { packId:'PACK-037', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'40801564010771010070000000071', lastTicket:18  },
  { packId:'PACK-038', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'36801421220641010070000000067', lastTicket:77  },
  { packId:'PACK-039', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'48801095010101010070000000065', lastTicket:64  },
  { packId:'PACK-040', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'50800617900651010070000000075', lastTicket:10  },
  { packId:'PACK-041', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'53500268890821010070000000084', lastTicket:65  },
  { packId:'PACK-042', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'51300576040571010070000000071', lastTicket:15  },
  { packId:'PACK-043', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'48801124080631010070000000073', lastTicket:82  },
  { packId:'PACK-044', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'54100037560621010070000000067', lastTicket:57  },
  { packId:'PACK-045', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'43101329670081010070000000072', lastTicket:63  },
  { packId:'PACK-046', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'48401054890901010070000000080', lastTicket:62  },
  { packId:'PACK-047', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'47701240360671010070000000075', lastTicket:8   },
  { packId:'PACK-048', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'52100773510991010080000000078', lastTicket:90  },
  { packId:'PACK-049', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'49700479350840515060000000096', lastTicket:67  },
  { packId:'PACK-050', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'52000115711340515060000000066', lastTicket:99  },
  // $5 packs (150-ticket) — seq 51-60
  { packId:'PACK-051', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'50400476541040515060000000076', lastTicket:84  },
  { packId:'PACK-052', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'53300025220610515070000000066', lastTicket:134 },
  { packId:'PACK-053', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'47200776170640515070000000088', lastTicket:48  },
  { packId:'PACK-054', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'53400173660790515060000000087', lastTicket:104 },
  { packId:'PACK-055', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'38100267561450515070000000085', lastTicket:61  },
  { packId:'PACK-056', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'54000022880200515060000000067', lastTicket:64  },
  { packId:'PACK-057', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'49800281501060515060000000080', lastTicket:79  },
  { packId:'PACK-058', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'52700105620050220040000000060', lastTicket:145 },
  { packId:'PACK-059', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'48600383530130220040000000071', lastTicket:20  },
  { packId:'PACK-060', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'50700119800100220040000000059', lastTicket:106 },
  // $2 packs (150 or 200-ticket) — seq 61-70
  { packId:'PACK-061', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'53200019380280220040000000068', lastTicket:5   },
  { packId:'PACK-062', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'51100124700620220040000000056', lastTicket:13  },
  { packId:'PACK-063', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'47100750240250215060000000070', lastTicket:10  },
  { packId:'PACK-064', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'48000830691490515060000000088', lastTicket:28  },
  { packId:'PACK-065', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'53800019081300220040000000065', lastTicket:62  },
  { packId:'PACK-066', packSize:150, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'51100244500640220040000000059', lastTicket:25  },
  { packId:'PACK-067', packSize:150, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'49500328391180220040000000080', lastTicket:149 },
  { packId:'PACK-068', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'49300109370210115030000000068', lastTicket:130 },
  { packId:'PACK-069', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'49300206060370115030000000069', lastTicket:64  },
  { packId:'PACK-070', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'47800584040700115030000000076', lastTicket:118 },
  // $1 packs (150-ticket) — seq 71-75
  { packId:'PACK-071', packSize:150, ticketValue:1,  gameName:'$1 Pack',   scannerNumber:'53700021791420115030000000070', lastTicket:21  },
  { packId:'PACK-072', packSize:150, ticketValue:1,  gameName:'$1 Pack',   scannerNumber:'48000830691490515060000000088', lastTicket:37  },
  { packId:'PACK-073', packSize:150, ticketValue:1,  gameName:'$1 Pack',   scannerNumber:'52800239700360515060000000081', lastTicket:70  },
  { packId:'PACK-074', packSize:150, ticketValue:1,  gameName:'$1 Pack',   scannerNumber:'49600474711070515060000000086', lastTicket:142 },
  { packId:'PACK-075', packSize:150, ticketValue:1,  gameName:'$1 Pack',   scannerNumber:'48000816820260515060000000081', lastTicket:149 },
  // $5 packs — seq 76-77
  { packId:'PACK-076', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'47400581271080515060000000083', lastTicket:36  },
  { packId:'PACK-077', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'51200198480000515060000000074', lastTicket:107 },
  // Blank rows (no column A number) — placed at end as PACK-078 to PACK-081
  { packId:'PACK-078', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'48900511270202010080000000069', lastTicket:0   },
  { packId:'PACK-079', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'52900357030151010070000000068', lastTicket:0   },
  { packId:'PACK-080', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'51600379230480515060000000084', lastTicket:0   },
  { packId:'PACK-081', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'48700614361020515060000000078', lastTicket:0   },
]

async function main() {
  console.log('Seeding database...')

  const adminHash    = await bcrypt.hash('admin123',    10)
  const reviewerHash = await bcrypt.hash('reviewer123', 10)
  const operatorHash = await bcrypt.hash('operator123', 10)

  await prisma.user.upsert({ where: { email: 'admin@example.com' },    update: {}, create: { name: 'Admin',    email: 'admin@example.com',    passwordHash: adminHash,    role: 'ADMIN'    } })
  await prisma.user.upsert({ where: { email: 'reviewer@example.com' }, update: {}, create: { name: 'Reviewer', email: 'reviewer@example.com', passwordHash: reviewerHash, role: 'REVIEWER' } })
  await prisma.user.upsert({ where: { email: 'operator@example.com' }, update: {}, create: { name: 'Operator', email: 'operator@example.com', passwordHash: operatorHash, role: 'OPERATOR' } })

  await prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, toleranceTickets: 2 } })

  for (const p of PACKS) {
    const pack = await prisma.pack.upsert({
      where: { packId: p.packId },
      update: { packSize: p.packSize, ticketValue: p.ticketValue, gameName: p.gameName, scannerNumber: p.scannerNumber },
      create: { packId: p.packId, packSize: p.packSize, ticketValue: p.ticketValue, gameName: p.gameName, scannerNumber: p.scannerNumber },
    })
    await prisma.scannerState.upsert({
      where: { packId: pack.id },
      update: { lastCommittedTicket: p.lastTicket },
      create: { packId: pack.id, lastCommittedTicket: p.lastTicket },
    })
  }

  console.log(`✓ ${PACKS.length} packs seeded (PACK-001..077 = col A seq, PACK-078..081 = blank rows)`)
  console.log('  admin@example.com    / admin123')
  console.log('  reviewer@example.com / reviewer123')
  console.log('  operator@example.com / operator123')
  console.log('')
  console.log('  ⚠️  Verify duplicate barcodes in source spreadsheet:')
  console.log('      PACK-030 and PACK-048 share barcode 52100773510991010080000000078')
  console.log('      PACK-064 and PACK-072 share barcode 48000830691490515060000000088')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
