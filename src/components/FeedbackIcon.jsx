import {
  Activity,
  Archive,
  BadgeCheck,
  CircleCheck,
  CircleX,
  Clock3,
  FilePenLine,
  Info,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react'
import AppIcon from './AppIcon'

const feedbackIcons = {
  active: Activity,
  archived: Archive,
  draft: FilePenLine,
  error: CircleX,
  expired: Clock3,
  failed: CircleX,
  info: Info,
  loading: LoaderCircle,
  passed: CircleCheck,
  pending: Clock3,
  published: BadgeCheck,
  success: CircleCheck,
  warning: TriangleAlert,
}

export default function FeedbackIcon({
  tone = 'info',
  size = 'sm',
  label,
  className = '',
}) {
  return (
    <AppIcon
      icon={feedbackIcons[tone] ?? Info}
      size={size}
      label={label}
      className={[
        'feedback-icon',
        tone === 'loading' ? 'feedback-icon--loading' : '',
        className,
      ].filter(Boolean).join(' ')}
    />
  )
}
