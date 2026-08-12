import { LoaderCircle } from 'lucide-react'
import AppIcon from './AppIcon'

export default function LoadingState({ label = 'Loading...' }) {
  return (
    <div className="tw:flex tw:min-h-36 tw:items-center tw:justify-center tw:gap-3 tw:rounded-2xl tw:bg-white tw:px-6 tw:py-10" role="status" aria-live="polite">
      <AppIcon icon={LoaderCircle} className="feedback-icon--loading" aria-hidden="true" />
      <strong>{label}</strong>
    </div>
  )
}
