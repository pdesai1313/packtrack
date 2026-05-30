import StatusPill from './StatusPill'

export default function FlagBadge({ flag }) {
  return <StatusPill status={flag} />
}

export function isError(flag) {
  return flag.startsWith('ERROR_') || flag === 'MISSING_START'
}
