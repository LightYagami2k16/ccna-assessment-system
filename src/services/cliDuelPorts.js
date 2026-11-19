import {normalizeInterface} from '../simulator/ciscoSimulator.js'

// Only the challenge's public port list/topology may add indicators, never arbitrary player commands.
export function getDuelPorts(task,deviceId,state){
 const names=new Set()
 const add=value=>{const name=normalizeInterface(value);if(name)names.add(name)}
 for(const port of task?.configuredPorts||[])if(port.deviceId===deviceId)add(port.interface)
 for(const link of task?.topology?.links||[]){
  if(link.fromDeviceId===deviceId)add(link.fromInterface)
  if(link.toDeviceId===deviceId)add(link.toInterface)
 }
 const interfaces=new Map(Object.entries(state?.interfaces||{}).map(([name,value])=>[normalizeInterface(name),value]))
 return [...names].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(name=>({name,enabled:interfaces.get(name)?.shutdown===false}))
}
