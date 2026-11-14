import { useState } from 'react'
import LoadingState from './LoadingState'
import RefreshButton from './RefreshButton'

export default function DataLoadBoundary({ loading, ready, label, children, error = false, onRetry }) {
  const [retrying, setRetrying] = useState(false)
  async function retryLoad() {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }
  const retry = onRetry ? <RefreshButton loading={loading || retrying} label="Retry" onClick={() => void retryLoad()} /> : null
  if (ready) return <>{children}{(error || retrying) && retry}</>
  if (loading) return <LoadingState label={label} />
  return <div className="data-load-unavailable" role="status"><p>{onRetry ? 'Content unavailable. Please try again.' : 'Content unavailable. Refresh to try again.'}</p>{retry}</div>
}
