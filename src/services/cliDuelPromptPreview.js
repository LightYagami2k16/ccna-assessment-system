import {executeFullDuelOperation} from '../../supabase/functions/_shared/cliDuelFullProtocol.js'
import {getDevicePrompt} from '../simulator/ciscoSimulator.js'

function terminalState(frame,deviceId){
 const local=frame?.deviceStates?.[deviceId]
 const session=local?.sshSession,remote=frame?.deviceStates?.[session?.destinationDeviceId]
 return remote?{...remote,mode:session.remoteMode??'privileged_exec'}:local
}

function requiresConfirmation(state,command){
 if(!state||state.sshSession||state.passwordPrompt||state.pendingPassword||state.awaitingPassword||state.pendingAuthentication)return true
 const text=command.trim().replace(/\s+/g,' ')
 return (text.toLowerCase()==='enable'&&Boolean(state.enableSecret||state.enablePassword))||/^(?:ssh|ping|tracert|traceroute|ipconfig|enable\s+(?:secret|password)|(?:no\s+)?username|password|secret|crypto|logout|disconnect)\b/i.test(text)
}

// Presentation only: this never returns projected configuration or alters an authoritative snapshot.
export function getDuelPromptPreview({task,state,entries=[],deviceId,revision=0,enabled=false}){
 let frame=state,blocked=false
 const lines=[]
 if(enabled){
  for(const entry of entries){
   if(entry.payload&&Number(entry.payload.sequence)<=Number(revision))continue
   if(entry.operation?.type!=='command'){blocked=true;continue}
   const local=frame?.deviceStates?.[entry.deviceId],terminal=terminalState(frame,entry.deviceId)
   if(entry.deviceId===deviceId)lines.push({command:entry.operation.command,prompt:!blocked&&terminal?getDevicePrompt(terminal):null})
   if(blocked)continue
   if(requiresConfirmation(local,entry.operation.command)){blocked=true;continue}
   try{
    const result=executeFullDuelOperation(task,frame,entry)
    if(!result.accepted){blocked=true;continue}
    frame=result.state
   }catch{blocked=true}
  }
 }
 const terminal=terminalState(frame,deviceId)
 return {prompt:terminal?getDevicePrompt(terminal):'',mode:terminal?.mode,lines}
}
