import { CheckCircle2, AlertTriangle, XCircle, Lock, CircleDot } from 'lucide-react'

const TIPS = {
  OK:                       'Pack scanned successfully — no issues detected',
  ERROR_NEGATIVE_DELTA:     'End ticket is greater than start, resulting in a negative unit count',
  ERROR_OVERFLOW:           'Computed units exceed the pack size limit',
  ERROR_NON_NUMERIC_TICKET: 'Ticket number contains non-numeric characters',
  MISSING_START:            'No start ticket recorded — pack cannot be calculated',
  WARNING_SMALL_MISMATCH:   'Pack is nearly full — only a few tickets remain',
  WARNING_DUPLICATE_SCAN:   'This pack was scanned more than once in this shift',
  WARNING_NEW_BOOK:         'Ticket numbers wrapped around — new book continuation detected',
  OPEN:                     'Shift is currently in progress',
  CLOSED:                   'Shift has been committed and closed',
  ACTIVE:                   'Currently active',
  INACTIVE:                 'Deactivated — not visible in active operations',
  DRAFT:                    'This entry has not been committed yet',
  ADMIN:                    'Full access — can manage users, packs, settings, and shifts',
  REVIEWER:                 'Can review exceptions and commit shifts',
  OPERATOR:                 'Can scan packs in open shifts',
}

const CFG = {
  OK:                       { Icon: CheckCircle2,  label: 'OK',             cls: 'badge-green'  },
  ERROR_NEGATIVE_DELTA:     { Icon: XCircle,       label: 'Negative delta', cls: 'badge-red'    },
  ERROR_OVERFLOW:           { Icon: XCircle,       label: 'Overflow',       cls: 'badge-red'    },
  ERROR_NON_NUMERIC_TICKET: { Icon: XCircle,       label: 'Non-numeric',    cls: 'badge-red'    },
  MISSING_START:            { Icon: XCircle,       label: 'Missing start',  cls: 'badge-red'    },
  WARNING_SMALL_MISMATCH:   { Icon: AlertTriangle, label: 'Near full',      cls: 'badge-yellow' },
  WARNING_DUPLICATE_SCAN:   { Icon: AlertTriangle, label: 'Duplicate scan', cls: 'badge-yellow' },
  WARNING_NEW_BOOK:         { Icon: AlertTriangle, label: 'New book',       cls: 'badge-yellow' },
  OPEN:                     { Icon: CircleDot,     label: 'OPEN',           cls: 'badge-blue'   },
  CLOSED:                   { Icon: Lock,          label: 'CLOSED',         cls: 'badge-gray'   },
  ACTIVE:                   { Icon: CheckCircle2,  label: 'Active',         cls: 'badge-green'  },
  INACTIVE:                 { Icon: XCircle,       label: 'Inactive',       cls: 'badge-gray'   },
  DRAFT:                    { Icon: AlertTriangle, label: 'Draft',          cls: 'badge-yellow' },
  ADMIN:                    { Icon: null,          label: 'ADMIN',          cls: 'badge-red'    },
  REVIEWER:                 { Icon: null,          label: 'REVIEWER',       cls: 'badge-blue'   },
  OPERATOR:                 { Icon: null,          label: 'OPERATOR',       cls: 'badge-gray'   },
}

export function Tooltip({ text, children }) {
  if (!text) return children
  return (
    <span className="relative group/tip inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900" />
      </span>
    </span>
  )
}

export default function StatusPill({ status, tooltip }) {
  const cfg = CFG[status] || { label: status, cls: 'badge-gray', Icon: null }
  const { Icon, label, cls } = cfg
  const tip = tooltip !== undefined ? tooltip : TIPS[status]

  return (
    <Tooltip text={tip}>
      <span className={`${cls} gap-1`}>
        {Icon && <Icon size={11} strokeWidth={2.5} className="flex-shrink-0" />}
        {label}
      </span>
    </Tooltip>
  )
}
