import { useCallback, useEffect, useRef, useState } from 'react'
import { duelError, subscribeDuel } from '../services/cliDuelService'
import { createDuelRefreshCoordinator, duelAccessDenied } from '../services/cliDuelSync'
export default function useCliDuel(loader, matchId, pollMs=5000) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [fresh, setFresh] = useState(false)
  const coordinator = useRef(null)
  const getSnapshot=useCallback(()=>coordinator.current?.getSnapshot()??null,[])
  const adopt=useCallback(value=>coordinator.current?.adopt(value)??false,[])
  const refresh = useCallback(() => coordinator.current?.refresh() ?? Promise.resolve(false), [])
  useEffect(() => {
    setData(null); setLoading(true); setFresh(false)
    const sync = createDuelRefreshCoordinator(loader, next => {
      setData(next); setError(''); setLoading(false); setFresh(true)
    }, failure => {
      if (duelAccessDenied(failure)) setData(null)
      setFresh(false); setError(duelError(failure)); setLoading(false)
    })
    coordinator.current = sync
    void sync.refresh()
    const timer = window.setInterval(sync.refresh, pollMs)
    window.addEventListener('focus', sync.refresh); window.addEventListener('online', sync.refresh)
    return () => {
      sync.stop(); window.clearInterval(timer)
      window.removeEventListener('focus', sync.refresh); window.removeEventListener('online', sync.refresh)
    }
  }, [loader,pollMs])
  const topicId = matchId || data?.competition?.id
  useEffect(() => topicId ? subscribeDuel(topicId, refresh) : undefined, [topicId, refresh])
  return { data, error, loading, fresh, refresh, adopt, getSnapshot }
}
