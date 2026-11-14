import { useCallback, useState } from 'react'

// Keep first successful load separate from later request activity. A failed
// refresh must not erase the already-populated view or its local UI state.
export default function useDataLoadState() {
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const markLoaded = useCallback(() => setHasLoaded(true), [])
  return [loading, setLoading, hasLoaded, markLoaded]
}
