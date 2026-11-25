export const duelCandidateKey = candidate => JSON.stringify([candidate.studentId, candidate.classId ?? null])
export function mergeDuelSnapshot(previous,next){
 if(previous?.competition?.id===next?.competition?.id&&next?.players){
  next={...next,players:next.players.map(player=>{
   const old=previous.players?.find(p=>p.id===player.id)
   if(!player.commandsAfter||!old)return player
   const commands=new Map((old.commands||[]).map(c=>[c.sequence,c]));for(const command of player.commands||[])commands.set(command.sequence,command)
   return {...player,commands:[...commands.values()].sort((a,b)=>a.sequence-b.sequence)}
  })}
 }
 if(!next?.commandsAfter||!previous||previous.ownParticipant?.id!==next.ownParticipant?.id||previous.competition?.id!==next.competition?.id)return next
 const commands=new Map((previous.ownCommands||[]).map(command=>[command.sequence,command]))
 for(const command of next.ownCommands||[])commands.set(command.sequence,command)
 return {...next,ownCommands:[...commands.values()].sort((a,b)=>a.sequence-b.sequence)}
}
export function createDuelRefreshCoordinator(load, apply, reject) {
  let current = null, trailing = false, stopped = false, epoch = 0, latest = null, accessDenied = false
  function applySnapshot(value){
    const matchRevision=data=>Number(data?.matchRevision??data?.competition?.revision??0)
    if(latest&&((Number(value?.revision)||0)<(Number(latest?.revision)||0)||matchRevision(value)<matchRevision(latest)))return false
    latest=mergeDuelSnapshot(latest,value);apply(latest);return true
  }
  function refresh() {
    if (stopped) return Promise.resolve(false)
    if (current) { trailing = true; return current }
    const startedEpoch=epoch
    current = (async () => {
      try { const data = await load(accessDenied?null:latest); if (!stopped&&startedEpoch===epoch&&applySnapshot(data)) accessDenied=false; return !stopped }
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
