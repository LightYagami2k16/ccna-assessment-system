const waitFor=ms=>new Promise(resolve=>setTimeout(resolve,ms))
// Retry only temporary upstream overload, preserving the exact idempotency identity.
export async function deliverDuelOperation(send,payload,{canSend,wait=waitFor,random=Math.random}){
 for(let attempt=0;;attempt++){
  try{return await send(payload)}catch(error){
   if(attempt>=2||![429,500,503,504,546].includes(error?.status)||!canSend())throw error
   await wait(500*2**attempt+Math.floor(random()*250))
   if(!canSend())throw error
  }
 }
}
export function createDuelNotifier(notify,{schedule=setTimeout,cancel=clearTimeout}={}){
 let timer=null,stopped=false
 return {changed(){if(stopped||timer!==null)return;timer=schedule(()=>{timer=null;if(!stopped)notify()},120)},stop(){stopped=true;if(timer!==null)cancel(timer);timer=null}}
}
