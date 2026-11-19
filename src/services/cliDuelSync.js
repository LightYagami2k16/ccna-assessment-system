export const duelCandidateKey = candidate => JSON.stringify([candidate.studentId, candidate.classId ?? null])
export function createDuelRefreshCoordinator(load, apply, reject) {
  let current = null, trailing = false, stopped = false, epoch = 0, latest = null, accessDenied = false
  function applySnapshot(value){
    const matchRevision=data=>Number(data?.matchRevision??data?.competition?.revision??0)
    if(latest&&((Number(value?.revision)||0)<(Number(latest?.revision)||0)||matchRevision(value)<matchRevision(latest)))return false
    latest=value;apply(value);return true
  }
  function refresh() {
    if (stopped) return Promise.resolve(false)
    if (current) { trailing = true; return current }
    const startedEpoch=epoch
    current = (async () => {
      try { const data = await load(); if (!stopped&&startedEpoch===epoch&&applySnapshot(data)) accessDenied=false; return !stopped }
      catch (error) { if (!stopped) {if(duelAccessDenied(error)){accessDenied=true;epoch++}reject(error)} return false }
      finally { current = null; if (trailing && !stopped) { trailing = false; queueMicrotask(refresh) } }
    })()
    return current
  }
  return { refresh, getSnapshot:()=>stopped||accessDenied?null:latest, adopt: value=>{if(stopped||accessDenied)return false;epoch++;return applySnapshot(value)}, stop: () => { stopped = true; trailing = false } }
}
export function duelAccessDenied(error) {
  return ['P0001', '42501', 'PGRST301', 'PGRST302', 'PGRST202', '42883', '42P01'].includes(error?.code) || [401,403].includes(error?.status)
}
