import { ClipboardCheck, History, SquareTerminal } from 'lucide-react'
import AppIcon from './AppIcon'

export default function AssessmentTypeIcon({ type = 'quiz' }) {
  const isCli = type === 'cli'
  const isHistory = type === 'history'
  const variant = isCli ? 'cli' : isHistory ? 'history' : 'quiz'

  const icon = isCli ? SquareTerminal : isHistory ? History : ClipboardCheck

  return (
    <span
      className={`assessment-type-icon assessment-type-icon--${variant}`}
      aria-hidden="true"
    >
      <AppIcon icon={icon} size="lg" />
    </span>
  )
}
