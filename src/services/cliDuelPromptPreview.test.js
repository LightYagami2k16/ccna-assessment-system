import test from 'node:test'
import assert from 'node:assert/strict'
import {getDuelPromptPreview} from './cliDuelPromptPreview.js'
import {createDeviceState,executeCiscoCommand} from '../simulator/ciscoSimulator.js'

const task={devices:[{id:'d1',label:'Switch',type:'switch'},{id:'d2',label:'Router',type:'router'}],topology:{links:[]}}
const initial=()=>({activeDeviceId:'d1',deviceStates:{d1:createDeviceState('Switch','switch'),d2:createDeviceState('Router','router')}})
const pending=(text,deviceId='d1',sequence)=>({deviceId,operation:{type:'command',command:text},...(sequence?{payload:{sequence}}:{})})
const preview=(state,entries,options={})=>getDuelPromptPreview({task,state,entries,deviceId:'d1',revision:0,enabled:true,...options})

test('navigation and hostname prompts change immediately without changing confirmed configuration',()=>{
 const state=initial(),before=structuredClone(state)
 const result=preview(state,['enable','conf t','interface g0/1','no shutdown','exit','hostname Campus'].map(text=>pending(text)))
 assert.equal(result.prompt,'Campus(config)#');assert.equal(result.mode,'global_config')
 assert.deepEqual(result.lines.map(line=>line.prompt),['Switch>','Switch#','Switch(config)#','Switch(config-if)#','Switch(config-if)#','Switch(config)#'])
 assert.deepEqual(state,before);assert.equal(state.deviceStates.d1.interfaces['GigabitEthernet0/1'],undefined)
})
test('deduplicate acknowledged commands and rebase onto server mode after an ACK',()=>{
 const state=initial();state.deviceStates.d1=executeCiscoCommand(state.deviceStates.d1,'enable').state
 const result=preview(state,[pending('enable','d1',1),pending('conf t','d1',2),pending('interface g0/1')],{revision:1})
 assert.equal(result.prompt,'Switch(config-if)#');assert.equal(result.lines.length,2);assert.equal(result.lines[0].prompt,'Switch#')
 assert.equal(preview(state,[],{revision:1}).prompt,'Switch#')
})
test('device queues keep separate prompts and terminal control state',()=>{
 const entries=[pending('enable'),pending('enable','d2'),pending('conf t','d2'),pending('conf t'),pending('interface g0/1','d2')]
 assert.equal(preview(initial(),entries).prompt,'Switch(config)#')
 assert.equal(preview(initial(),entries,{deviceId:'d2'}).prompt,'Router(config-if)#')
})
test('VLAN, line, router, ACL and DHCP configuration modes use canonical navigation',()=>{
 const state=initial()
 for(const [command,prompt] of [['vlan 10','Switch(config-vlan)#'],['line console 0','Switch(config-line)#'],['ip access-list extended STUDENTS','Switch(config-ext-nacl)#'],['ip dhcp pool Students','Switch(dhcp-config)#']]){
  assert.equal(preview(state,['enable','conf t',command].map(text=>pending(text))).prompt,prompt)
 }
 assert.equal(preview(state,['enable','conf t','router ospf 1'].map(text=>pending(text,'d2')),{deviceId:'d2'}).prompt,'Router(config-router)#')
 assert.equal(preview(state,['enable','conf t','interface g0/1','end','disable'].map(text=>pending(text))).prompt,'Switch>')
})
test('invalid commands stop later prediction and disabled input rolls back to confirmed prompt',()=>{
 const entries=[pending('enable'),pending('not a valid command'),pending('conf t')]
 const result=preview(initial(),entries);assert.equal(result.prompt,'Switch#');assert.equal(result.lines[2].prompt,null)
 const locked=preview(initial(),entries,{enabled:false});assert.equal(locked.prompt,'Switch>');assert.deepEqual(locked.lines,[])
})
test('SSH, password setup, protected enable and network operations are prediction barriers',()=>{
 for(const command of ['ssh admin@10.0.0.1','enable secret Example','ping 10.0.0.1']){
  const result=preview(initial(),[pending(command),pending('enable')]);assert.equal(result.prompt,'Switch>');assert.equal(result.lines[1].prompt,null)
 }
 const state=initial();state.deviceStates.d1.enableSecret='Example'
 assert.equal(preview(state,[pending('enable'),pending('conf t')]).prompt,'Switch>')
 state.deviceStates.d1.sshSession={destinationDeviceId:'d2',remoteMode:'privileged_exec'}
 assert.equal(preview(state,[pending('conf t')]).prompt,'Router#')
 const pcOperation={deviceId:'d1',operation:{type:'pc_dhcp'}}
 assert.equal(preview(initial(),[pcOperation,pending('enable')]).prompt,'Switch>')
})
