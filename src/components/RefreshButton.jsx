import { RefreshCw } from 'lucide-react'
import AppIcon from './AppIcon'

export default function RefreshButton({ loading = false, disabled = false, label = 'Refresh', className = 'secondary', ...props }) {
  return (
    <button {...props} type="button" className={`${className} refresh-button`} disabled={loading || disabled} aria-busy={loading}>
      <AppIcon icon={RefreshCw} className={loading ? 'feedback-icon--loading' : undefined} aria-hidden="true" />
      <span className="refresh-button__labels">
        <span aria-hidden={loading} style={{ visibility: loading ? 'hidden' : 'visible' }}>{label}</span>
        <span aria-hidden={!loading} style={{ visibility: loading ? 'visible' : 'hidden' }}>Refreshing...</span>
      </span>
    </button>
  )
}
