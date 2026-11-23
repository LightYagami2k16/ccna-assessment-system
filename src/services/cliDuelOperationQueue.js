// Serial, server-authoritative type-ahead. Never infer a score or an accepted command.
export function createDuelOperationQueue({createRequest,send,onAccepted,onChange,onError,onDiscard}){
 let entries=[],active=null,uncertain=false,allowed=false,stopped=false,revision=0
 const getState=()=>({entries:entries.slice(),sending:Boolean(active),uncertain})
 const publish=()=>{if(!stopped)onChange(getState())}
 function discard(keep=0){const removed=entries.splice(keep);if(removed.length)onDiscard(removed)}
 function fail(error){if(stopped)return;active=null;const definite=[400,401,403,409].includes(error?.status);uncertain=!definite;if(definite){allowed=false;discard()}onError({error,uncertain});publish()}
 function pump(){
  if(stopped||!allowed||active||uncertain||!entries.length)return
  const entry=entries[0];entry.payload??=structuredClone(createRequest(entry,revision));active=entry;publish()
  Promise.resolve().then(()=>{if(stopped)return;if(!allowed){active=null;discard();publish();return}return send(entry.payload)}).then(result=>{
   if(stopped||active!==entry)return
   if(!Number.isSafeInteger(result?.revision)||result.revision<entry.payload.sequence)throw new Error('The command acknowledgement is incomplete. Retry the same command.')
   revision=Math.max(revision,result.revision)
   const applied=onAccepted(result),canonical=applied&&typeof applied==='object'?applied:result
   const rejected=result.ownCommands?.some(command=>command.sequence===entry.payload.sequence&&(!command.deviceId||command.deviceId===entry.deviceId)&&command.accepted===false)
   revision=Math.max(revision,Number(canonical.revision)||0)
   entries.shift();active=null;uncertain=false
   if(applied===false||canonical.competition?.status!=='active'||canonical.ownParticipant?.status!=='in_progress'){allowed=false;discard()}
   else if(rejected)discard()
   publish();queueMicrotask(pump)
  }).catch(fail)
 }
 return {
  getState,
  update(next){if(stopped)return;revision=Math.max(revision,Number(next.revision)||0);allowed=Boolean(next.allowed);if(next.terminal){allowed=false;if(active)discard(1);else{uncertain=false;discard()}}else if(!allowed)discard(active||uncertain?1:0);publish();pump()},
  enqueue(operation){if(stopped||!allowed||uncertain||entries.length>=20)return false;entries.push(structuredClone(operation));publish();pump();return true},
  retry(){if(stopped||!allowed||active||!uncertain)return false;uncertain=false;pump();return true},
  dispose(){stopped=true;allowed=false;entries=[]},
 }
}
