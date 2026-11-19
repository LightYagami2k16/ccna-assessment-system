import {memo,useEffect,useRef,useState,useId,useMemo} from 'react'
import {getDevicePrompt} from '../simulator/ciscoSimulator'
import {getDuelPorts} from '../services/cliDuelPorts'

const EMPTY_OPERATIONS=[]
function CliDuelDeviceConsole({data,enabled,onOperation,readOnly=false,compact=false,pendingOperations=EMPTY_OPERATIONS}){
 const radioGroup=useId()
 const inputRef=useRef(null),screenRef=useRef(null),followOutput=useRef(true)
 const devices=data.task?.devices||[]
 const [selection,setSelection]=useState(''),[command,setCommand]=useState(''),[pcView,setPcView]=useState('configuration'),[mode,setMode]=useState('static')
 const [settings,setSettings]=useState({ipAddress:'',subnetMask:'',defaultGateway:'',preferredDns:'',alternateDns:''})
 const device=devices.find(item=>item.id===selection)||devices.find(item=>item.id===data.ownState.activeDeviceId)||devices[0]
 const deviceId=device?.id,state=data.ownState.deviceStates?.[deviceId]
 const ports=getDuelPorts(data.task,deviceId,state)
 const adapter=state?.interfaces?.Ethernet0
 const ip=adapter?.ipAddress||'',mask=adapter?.subnetMask||'',gateway=state?.defaultGateway||'',dns1=state?.dnsServers?.[0]||'',dns2=state?.dnsServers?.[1]||''
 useEffect(()=>{setMode(state?.dhcpEnabled?'dhcp':'static');setSettings({ipAddress:ip,subnetMask:mask,defaultGateway:gateway,preferredDns:dns1,alternateDns:dns2})},[deviceId,ip,mask,gateway,dns1,dns2,state?.dhcpEnabled])
 useEffect(()=>{followOutput.current=true},[deviceId])
 useEffect(()=>{const pane=screenRef.current;if(pane&&followOutput.current)pane.scrollTop=pane.scrollHeight},[data.revision,deviceId,pendingOperations,pcView])
 useEffect(()=>{if(enabled&&(device?.type!=='pc'||pcView==='command'))inputRef.current?.focus({preventScroll:true})},[deviceId,enabled,device?.type,pcView])
 const commandLog=useMemo(()=>`${device?.type==='pc'?'CCNA Assessment PC Command Prompt\nUse IP Configuration to change network settings.\nType help to view CMD commands.\n\n':'Cisco IOS Software, CCNA Assessment Simulator\nType commands at the prompt.\n\n'}${(data.ownCommands||[]).filter(item=>item.deviceId===deviceId).map(item=>`${item.promptBefore?`${item.promptBefore} `:''}${item.command}${item.output?`\n${item.output}`:''}\n`).join('')}`,[data.ownCommands,deviceId,device?.type])
 if(!device||!state)return <p role="alert">This device is unavailable. Resynchronize the attempt.</p>
 const remote=state.sshSession?.destinationDeviceId?data.ownState.deviceStates[state.sshSession.destinationDeviceId]:null
 const prompt=getDevicePrompt(remote?{...remote,mode:state.sshSession.remoteMode??'privileged_exec'}:state)
 function submit(event){event.preventDefault();if(!enabled||!command.trim())return;if(onOperation(deviceId,{type:'command',command}))setCommand('')}
 const configurationEnabled=enabled&&!pendingOperations.length
 const echo=pendingOperations.find(entry=>entry.payload&&entry.payload.sequence>Number(data.revision)&&entry.deviceId===deviceId&&entry.operation.type==='command')
 async function configure(event){event.preventDefault();if(!configurationEnabled)return;await onOperation(deviceId,mode==='dhcp'?{type:'pc_dhcp'}:{type:'pc_configure',settings:{...settings}})}
 return <div className={compact?"duel-spectator-console":"cli-practical-layout duel-device-console"}>
  {!compact&&<aside className="cli-instructions"><h2>Requirements</h2><p>{data.task.instructions}</p>
   <div className="cli-device-summary"><span>Device</span><strong>{device.label}</strong><span>Type</span><strong>{device.type}</strong><span>{device.type==='pc'?'IPv4 address':'Current mode'}</span><strong>{device.type==='pc'?(ip||'Not configured'):state.mode?.replaceAll('_',' ')}</strong><span>{device.type==='pc'?'Default gateway':'Saved'}</span><strong>{device.type==='pc'?(gateway||'Not configured'):(state.saved?'Yes':'No')}</strong></div>
   {!!data.task?.topology?.links?.length&&<div className="cli-topology-summary"><strong>Topology links</strong><ul>{data.task.topology.links.map((link,index)=><li key={link.id||index}>{devices.find(item=>item.id===link.fromDeviceId)?.label} {link.fromInterface} ↔ {devices.find(item=>item.id===link.toDeviceId)?.label} {link.toInterface}</li>)}</ul></div>}
  </aside>}
  <section className="cisco-terminal" aria-label="Cisco CLI terminal">
   <div className="cisco-terminal__titlebar"><span>{device.label} · {state.hostname} — {remote?`SSH to ${remote.hostname}`:device.type==='pc'?'PC Command Prompt':'Cisco IOS'}</span><small>{readOnly?'Read-only player view':'Press Enter to run a command'}</small></div>
   <div className="cli-device-tabs" role="tablist" aria-label="Topology devices">{devices.map(item=><button key={item.id} type="button" role="tab" aria-selected={item.id===deviceId} onClick={()=>{setSelection(item.id);setCommand('');setPcView(item.type==='pc'?'configuration':'command')}}>{item.label}</button>)}</div>
   {ports.length>0&&<section className="duel-port-status" aria-label={`${device.label} port status`}><span className="duel-port-status__heading">Port status <small>Administrative state</small></span><ul>{ports.map(port=><li key={port.name}><span className={`duel-port-status__dot${port.enabled?' duel-port-status__dot--enabled':''}`} aria-hidden="true"/><span>{port.name}</span><strong>{port.enabled?'Enabled':'Down'}</strong></li>)}</ul></section>}
  {device.type==='pc'&&<div className="pc-workspace-tabs" role="tablist" aria-label="PC tools"><button type="button" role="tab" aria-selected={pcView==='configuration'} onClick={()=>setPcView('configuration')}>IP Configuration</button><button type="button" role="tab" aria-selected={pcView==='command'} onClick={()=>setPcView('command')}>Command Prompt</button></div>}
  {device.type==='pc'&&pcView==='configuration'?<form className="pc-ipv4-panel" onSubmit={configure}>
   <div className="pc-ipv4-panel__heading"><div><span className="eyebrow">PC NETWORK ADAPTER</span><h2>Internet Protocol Version 4 (TCP/IPv4)</h2><p>Choose DHCP or enter the static settings required by the challenge.</p></div><span className="pc-ipv4-panel__adapter">Ethernet0</span></div><fieldset><legend>IP address settings</legend>
   <label className="pc-setting-choice"><input type="radio" name={radioGroup} disabled={!configurationEnabled} checked={mode==='dhcp'} onChange={()=>setMode('dhcp')}/>Obtain an IP address automatically (DHCP)</label>
   <label className="pc-setting-choice"><input type="radio" name={radioGroup} disabled={!configurationEnabled} checked={mode==='static'} onChange={()=>setMode('static')}/>Use the following IP address</label>
   <div className="pc-ipv4-fields">{[['ipAddress','IP address'],['subnetMask','Subnet mask'],['defaultGateway','Default gateway'],['preferredDns','Preferred DNS'],['alternateDns','Alternate DNS']].map(([key,label])=><label key={key}>{label}<input required={mode==='static'&&['ipAddress','subnetMask'].includes(key)} disabled={!configurationEnabled||mode==='dhcp'} value={settings[key]} maxLength={50} inputMode="decimal" onChange={event=>setSettings(current=>({...current,[key]:event.target.value}))}/></label>)}</div>
   </fieldset><button className="primary" disabled={!configurationEnabled}>Apply IP configuration</button>
  </form>:<div ref={screenRef} className="cisco-terminal__screen" onScroll={event=>{const pane=event.currentTarget;followOutput.current=pane.scrollHeight-pane.clientHeight-pane.scrollTop<24}} onMouseDown={event=>{if(!enabled||readOnly||event.target.closest('button,input,a'))return;const pane=event.currentTarget,box=pane.getBoundingClientRect();if(event.clientX>=box.left+pane.clientLeft+pane.clientWidth||event.clientY>=box.top+pane.clientTop+pane.clientHeight)return;inputRef.current?.focus({preventScroll:true})}}>
   <pre role="log" aria-label="Your CLI command log">{commandLog}</pre>
   {echo&&<pre className="duel-pending-echo">{prompt} {echo.operation.command}{'\n'}</pre>}
   {!readOnly&&<form onSubmit={submit}><label className="duel-prompt" htmlFor="duel-cli-command">{prompt}</label><input id="duel-cli-command" aria-label="Cisco command" ref={inputRef} autoComplete="off" spellCheck="false" maxLength={500} disabled={!enabled} value={command} onChange={event=>setCommand(event.target.value)}/></form>}
  </div>}
  {!readOnly&&<small className="duel-terminal-sync" role="status">{pendingOperations.length?`Sending ${pendingOperations.length} command${pendingOperations.length===1?'':'s'}…`:enabled?'Ready':'Commands are locked'}</small>}
  </section>
 </div>
}

export default memo(CliDuelDeviceConsole)
