import {createDeviceState,executeCiscoCommand,executePcCommand,executeSshSessionCommand,executeTopologyCommand,configurePcState,requestDhcpLease,normalizeInterface,getDevicePrompt} from './ciscoSimulator.js'
import {criterionTypes,targetNotRequired,expectedNotRequired,criterionConfigurationCommands,lineConfigurationTarget} from './cliPracticalConfiguration.js'
import {isCriterionApplicable} from './cliCriterionApplicability.js'
import {defaultDuelDamage} from './cliDuelProtocol.js'

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)
const clean=(value,max)=>typeof value==='string'&&value.trim()!==''&&value.length<=max&&!/[\x00-\x1f\x7f-\x9f]/.test(value) // eslint-disable-line no-control-regex
function keys(value,allowed){if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw new Error('Unexpected configuration or operation fields.')}
const supported=new Set(criterionTypes.map(([type])=>type))

export function prepareFullDuelDefinition(configuration,combat={}) {
  keys(configuration,['courseId','moduleId','title','description','instructions','devices','topology','durationMinutes','criteria'])
  keys(combat,['startingHp','damage'])
  const result=structuredClone(configuration)
  result.version=3
  result.courseId=result.courseId==null?null:Number(result.courseId)
  result.moduleId=result.moduleId||null
  if((result.courseId!==null&&(!Number.isSafeInteger(result.courseId)||result.courseId<1))||(result.moduleId&&!uuid(result.moduleId)))throw new Error('Choose a course and a valid module.')
  if(!clean(result.title,160)||typeof result.description!=='string'||result.description.length>4000||typeof result.instructions!=='string'||!result.instructions.trim()||result.instructions.length>32000)throw new Error('Enter valid title, description and student instructions.')
  if(!Number.isInteger(Number(result.durationMinutes))||Number(result.durationMinutes)<1||Number(result.durationMinutes)>480)throw new Error('Duration must be 1–480 whole minutes.')
  result.durationMinutes=Number(result.durationMinutes)
  if(!Array.isArray(result.devices)||result.devices.length<1||result.devices.length>12)throw new Error('A configuration requires 1–12 devices.')
  const devices=new Map()
  for(const device of result.devices){
    keys(device,['id','label','hostname','type'])
    if(!clean(device.id,80)||!clean(device.label,160)||!['router','switch','pc'].includes(device.type)||!clean(device.hostname,63)||!/^[a-z\d][a-z\d-]*$/i.test(device.hostname))throw new Error('Complete the device label, starting hostname and valid type.')
    if(devices.has(device.id.toLowerCase()))throw new Error('Device IDs must be unique.')
    devices.set(device.id.toLowerCase(),device)
  }
  keys(result.topology,['links'])
  if(!Array.isArray(result.topology.links)||result.topology.links.length>128)throw new Error('Provide at most 128 physical links.')
  const ports=new Set(),linkIds=new Set()
  result.topology.links=result.topology.links.map((link,index)=>{
    keys(link,['id','fromDeviceId','fromInterface','toDeviceId','toInterface'])
    const from=result.devices.find(device=>device.id===link.fromDeviceId),to=result.devices.find(device=>device.id===link.toDeviceId)
    const fromInterface=normalizeInterface(link.fromInterface),toInterface=normalizeInterface(link.toInterface)
    if(!from||!to||from.id===to.id||!fromInterface||!toInterface)throw new Error('Each physical link needs two distinct devices and valid interfaces.')
    if((from.type==='pc'&&fromInterface!=='Ethernet0')||(to.type==='pc'&&toInterface!=='Ethernet0'))throw new Error('Connect a PC using its Ethernet0 adapter.')
    const id=link.id||`link-${index+1}`
    if(!clean(id,100)||linkIds.has(id))throw new Error('Physical link IDs must be unique.')
    linkIds.add(id)
    for(const port of [`${from.id}:${fromInterface}`,`${to.id}:${toInterface}`]){if(ports.has(port))throw new Error('A device interface can have only one physical link.');ports.add(port)}
    return {id,fromDeviceId:from.id,fromInterface,toDeviceId:to.id,toInterface}
  })
  if(!Array.isArray(result.criteria)||result.criteria.length<1||result.criteria.length>128)throw new Error('Provide 1–128 grading criteria.')
  const identities=new Set()
  let total=0
  result.criteria=result.criteria.map((criterion,index)=>{
    keys(criterion,['type','deviceId','target','expected','points','label'])
    const device=result.devices.find(item=>item.id===(criterion.deviceId||result.devices[0].id))
    if(!device||!supported.has(criterion.type)||!isCriterionApplicable(device.type,criterion.type))throw new Error('Select a supported requirement for the specified device.')
    const target=criterion.target??'',expected=criterion.expected??''
    if(typeof target!=='string'||typeof expected!=='string'||target.length>450||expected.length>450||(!targetNotRequired.includes(criterion.type)&&!clean(target,450))||(!expectedNotRequired.includes(criterion.type)&&!clean(expected,450)))throw new Error('Complete every required target and expected value.')
    if(expected!==expected.replace(/\s+/g,' ').trim())throw new Error('Expected values must use single spaces.')
    if(typeof criterion.points!=='number'||!Number.isFinite(criterion.points)||criterion.points<=0)throw new Error('Criterion points must be positive numbers.')
    total+=criterion.points
    let probe=createDeviceState(device.hostname,device.type)
    if(device.type!=='pc'&&!criterion.type.startsWith('connectivity_')){
      if(criterion.type==='ssh_rsa_keys')for(const command of ['enable','conf t','ip domain-name validation.test','end'])probe=executeCiscoCommand(probe,command).state
      for(const command of criterionConfigurationCommands(criterion,result.criteria,device.type)){const next=executeCiscoCommand(probe,command);if(!next.accepted)throw new Error('An objective has an unattainable target or expected value.');probe=next.state}
    }
    if(device.type==='pc'&&criterion.type==='interface_ip'){const [ipAddress,subnetMask,...extra]=expected.split(' ');if(extra.length||!configurePcState(probe,{ipAddress,subnetMask}).accepted)throw new Error('Enter a valid PC IP address and subnet mask.')}
    const normalized=targetNotRequired.includes(criterion.type)?'':criterion.type.startsWith('interface_')?normalizeInterface(target):criterion.type.startsWith('line_')?executeCiscoCommand(executeCiscoCommand(executeCiscoCommand(createDeviceState(device.hostname,device.type),'enable').state,'conf t').state,lineConfigurationTarget(target)).state.activeLine:target.toLowerCase().replace(/\s+/g,' ').trim()
    if(criterion.type.startsWith('interface_')&&!normalized)throw new Error('Enter a valid interface target.')
    const additive=['acl_entry','ospf_network','ospf_passive_interface','static_route','default_route','nat_dynamic_rule','nat_static_mapping','dhcp_excluded_range','connectivity_ping','connectivity_traceroute','connectivity_ssh'].includes(criterion.type)
    const variant=additive?expected.toLowerCase().replace(/\bg(\d)/g,'gigabitethernet$1').replace(/\bf(\d)/g,'fastethernet$1'):criterion.type==='interface_acl'?expected.split(' ').at(-1).toLowerCase():''
    const identity=JSON.stringify([device.id,criterion.type,normalized,variant])
    if(identities.has(identity))throw new Error('Remove duplicate or conflicting requirements for a device.')
    identities.add(identity)
    if(criterion.type==='hostname'&&!/^[a-z\d][a-z\d-]{0,62}$/i.test(expected))throw new Error('Enter a valid expected hostname.')
    return {type:criterion.type,deviceId:device.id,target,expected,points:criterion.points,label:criterion.label||'',objectiveId:`objective-${index+1}`}
  })
  if(!Number.isFinite(total)||total>Number.MAX_SAFE_INTEGER)throw new Error('The criterion point total is too large.')
  const startingHp=combat.startingHp??100
  if(!Number.isInteger(startingHp)||startingHp<1||startingHp>10000)throw new Error('Starting HP must be 1–10000 whole points.')
  const damage=combat.damage??defaultDuelDamage(result.criteria,startingHp)
  if(!Array.isArray(damage)||damage.length!==result.criteria.length||damage.some(value=>typeof value!=='number'||!Number.isFinite(value)||value<0||value>10000||Math.abs(value*100-Math.round(value*100))>0.000001))throw new Error('Provide valid damage for every criterion, with at most two decimals.')
  if(damage.reduce((sum,value)=>sum+Math.round(value*100),0)<startingHp*100)throw new Error('Total criterion damage must reach the starting HP.')
  result.combat={startingHp,damage:[...damage]}
  return result
}

export function createFullDuelInitialState(snapshot){
  const deviceStates=Object.fromEntries(snapshot.devices.map(device=>[device.id,createDeviceState(device.hostname,device.type)]))
  return {...deviceStates[snapshot.devices[0].id],deviceStates,activeDeviceId:snapshot.devices[0].id}
}

export function executeFullDuelOperation(snapshot,currentState,{deviceId,operation}){
  const device=snapshot.devices.find(item=>item.id===deviceId),state=currentState.deviceStates?.[deviceId]
  if(!device||!state)throw new Error('The selected device is unavailable in this attempt.')
  const deviceStates=currentState.deviceStates
  const remote=state.sshSession?.destinationDeviceId?deviceStates[state.sshSession.destinationDeviceId]:null
  const promptBefore=operation.type==='command'?getDevicePrompt(remote?{...remote,mode:state.sshSession.remoteMode??'privileged_exec'}:state):null
  let outcome
  if(operation.type==='pc_configure'||operation.type==='pc_dhcp'){
    if(device.type!=='pc')throw new Error('PC settings require a PC device.')
    outcome=operation.type==='pc_dhcp'?requestDhcpLease({deviceStates,devices:snapshot.devices,topology:snapshot.topology,clientDeviceId:deviceId}):configurePcState(state,operation.settings)
    if(!outcome.state)outcome={...outcome,state:structuredClone(state),output:outcome.error||'PC settings could not be applied.',modeBefore:state.mode,modeAfter:state.mode}
  }else if(operation.type==='command'){
    outcome=executeSshSessionCommand({deviceStates,activeDeviceId:deviceId,rawCommand:operation.command})??executeTopologyCommand({deviceStates,activeDeviceId:deviceId,devices:snapshot.devices,topology:snapshot.topology,rawCommand:operation.command})
    if(!outcome){
      const allowed=/^(?:ping|tracert|traceroute)\s+\S+$|^ssh\s+\S+@\S+$|^ipconfig(?:\s+\/all)?$|^(?:help|\?)$/i.test(operation.command.trim())
      outcome=device.type==='pc'?(allowed?executePcCommand(state,operation.command):{state:structuredClone(state),accepted:false,output:'Use IP Configuration to change this PC.',modeBefore:state.mode,modeAfter:state.mode}):executeCiscoCommand(state,operation.command)
    }
  }else throw new Error('Unknown device operation.')
  const next={...deviceStates,[deviceId]:outcome.state,...(outcome.destinationDeviceId&&outcome.destinationState?{[outcome.destinationDeviceId]:outcome.destinationState}:{})}
  return {...outcome,promptBefore,state:{...next[snapshot.devices[0].id],deviceStates:next,activeDeviceId:deviceId}}
}

export function fullOperationCommand(request){return request.operation.type==='command'?request.operation.command:request.operation.type==='pc_dhcp'?'Obtained IPv4 settings through DHCP':'Applied static IPv4 settings'}

export function validateFullDuelRequest(body){
  if(body?.action==='operation'){
    keys(body,['action','participantId','clientId','commandId','sequence','expectedRevision','deviceId','operation'])
    if(!uuid(body.participantId)||!uuid(body.commandId)||!clean(body.clientId,200)||body.clientId.length<16||!/^[a-z\d:_-]+$/i.test(body.clientId)||!clean(body.deviceId,80)||!Number.isSafeInteger(body.sequence)||body.sequence<1||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)throw new Error('Invalid attempt, device, session or sequence.')
    keys(body.operation,['type','command','settings'])
    if(body.operation.type==='command'){
      if(body.operation.settings!==undefined||!clean(body.operation.command,500))throw new Error('Enter a single command of at most 500 characters.')
    }else if(body.operation.type==='pc_configure'){
      if(body.operation.command!==undefined)throw new Error('Unexpected PC command fields.')
      keys(body.operation.settings,['ipAddress','subnetMask','defaultGateway','preferredDns','alternateDns'])
      for(const value of Object.values(body.operation.settings))if(typeof value!=='string'||value.length>50)throw new Error('Enter valid PC settings.')
    }else if(body.operation.type==='pc_dhcp'){
      if(body.operation.settings!==undefined||body.operation.command!==undefined)throw new Error('Unexpected DHCP operation fields.')
    }else throw new Error('Unknown device operation.')
  }else if(body?.action==='create'){
    keys(body,['action','rulesVersion','labId','rematchId','title','durationMinutes','configuration','combat','participantSelections','allowReview'])
    if(body.rulesVersion!==3||(body.labId&&!uuid(body.labId))||(body.rematchId&&!uuid(body.rematchId))||(body.labId&&body.rematchId)||!Array.isArray(body.participantSelections)||body.participantSelections.length!==2||typeof body.allowReview!=='boolean')throw new Error('Invalid full duel configuration request.')
    for(const player of body.participantSelections){keys(player,['studentId','classId']);if(!uuid(player.studentId)||(player.classId!=null&&!uuid(player.classId)))throw new Error('Choose valid students and classes.')}
    if(body.participantSelections[0].studentId===body.participantSelections[1].studentId)throw new Error('Select two different students.')
    const prepared=prepareFullDuelDefinition(body.configuration,body.combat)
    if(body.title!==prepared.title||Number(body.durationMinutes)!==prepared.durationMinutes)throw new Error('Match title and duration must match the configuration.')
  }else throw new Error('Unknown full duel action.')
  return body
}
