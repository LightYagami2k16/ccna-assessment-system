// Only the HTTP operations needed by this worker. No session storage or SDK graph.
const allowed=new Set(['cli_duel_operation_context','cli_duel_commit_operation_updates','cli_duel_configuration_context','cli_duel_create','cli_duel_authoring_context','cli_duel_command_context','cli_duel_commit_command'])
export function createDuelBackend({url,anonKey,serviceKey,fetchImpl=fetch}){
 const base=url.replace(/\/$/,'')
 return {
  async authenticate(token){
   const response=await fetchImpl(`${base}/auth/v1/user`,{headers:{apikey:anonKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)})
   if(response.status===401||response.status===403)return null
   if(!response.ok)throw new Error('Authentication service is unavailable.')
   const user=await response.json();return typeof user?.id==='string'?user.id:null
  },
  async rpc(name,args){
   if(!allowed.has(name))throw new Error('Unsupported duel operation.')
   const response=await fetchImpl(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)})
   const data=await response.json()
   if(!response.ok)throw Object.assign(new Error(typeof data?.message==='string'?data.message:'The database operation failed.'),{code:data?.code})
   return data
  },
 }
}
