import {
  Monitor,
  Network,
  Router,
  Server,
  SquareTerminal,
} from 'lucide-react'
import AppIcon from './AppIcon'

function resolveDeviceIcon(type = '') {
  const normalizedType = String(type).trim().toLowerCase()

  if (['pc', 'host', 'workstation', 'computer'].includes(normalizedType)) {
    return Monitor
  }
  if (normalizedType.includes('router')) return Router
  if (normalizedType.includes('switch')) return Network
  if (normalizedType.includes('server')) return Server
  return SquareTerminal
}

export default function NetworkDeviceIcon({
  type,
  size = 'sm',
  label,
  className = '',
}) {
  return (
    <AppIcon
      icon={resolveDeviceIcon(type)}
      size={size}
      label={label}
      className={className}
    />
  )
}
