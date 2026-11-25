import { useCallback, useEffect, useRef, useState } from 'react'
import { duelError, subscribeDuel } from '../services/cliDuelService'
import { createDuelRefreshCoordinator, duelAccessDenied } from '../services/cliDuelSync'
export default function useCliDuel(loader, matchId, pollMs=5000,{enabled=true}={}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [fresh, setFresh] = useState(false)
  const coordinator = useRef(null)
  const getSnapshot=useCallback(()=>coordinator.current?.getSnapshot()??null,[])
  const adopt=useCallback(value=>coordinator.current?.adopt(value)??false,[])
  const refresh = useCallback(() => coordinator.current?.refresh() ?? Promise.resolve(false), [])
  useEffect(() => {
    if(!enabled)return undefined
    setData(null); setLoading(true); setFresh(false)
    const sync = createDuelRefreshCoordinator(loader, next => {
      setData(next); setError(''); setLoading(false); setFresh(true)
    }, failure => {
      if (duelAccessDenied(failure)) setData(null)
      setFresh(false); setError(duelError(failure)); setLoading(false)
    })
    coordinator.current = sync
    let stopped=false,timer
    async function poll(){
      if(stopped)return
      if(document.visibilityState!=='hidden'&&navigator.onLine)await sync.refresh()
      if(!stopped)timer=window.setTimeout(poll,pollMs+Math.random()*Math.min(500,pollMs/5))
    }
    void poll()
    window.addEventListener('focus', sync.refresh); window.addEventListener('online', sync.refresh)
    return () => {
      stopped=true;sync.stop();if(coordinator.current===sync)coordinator.current=null;window.clearTimeout(timer)
      window.removeEventListener('focus', sync.refresh); window.removeEventListener('online', sync.refresh)
    }
  }, [loader,pollMs,enabled])
  const topicId = matchId || data?.competition?.id
  useEffect(() => enabled&&topicId ? subscribeDuel(topicId, refresh) : undefined, [topicId, refresh,enabled])
  return { data, error, loading, fresh, refresh, adopt, getSnapshot }
}
