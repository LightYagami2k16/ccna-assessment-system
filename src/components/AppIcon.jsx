import { createElement } from 'react'

const iconSizes = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 24,
  xl: 32,
}

export default function AppIcon({
  icon,
  size = 'md',
  label,
  strokeWidth = 2,
  className = '',
}) {
  const pixelSize = iconSizes[size] ?? size
  const decorative = !label

  return createElement(icon, {
    className: ['app-icon', className].filter(Boolean).join(' '),
    width: pixelSize,
    height: pixelSize,
    size: pixelSize,
    strokeWidth,
    focusable: 'false',
    'aria-hidden': decorative ? 'true' : undefined,
    'aria-label': label || undefined,
    role: decorative ? undefined : 'img',
  })
}
