import test from 'node:test'
import assert from 'node:assert/strict'
import {getDuelPorts} from './cliDuelPorts.js'
import {createDeviceState,executeCiscoCommand} from '../simulator/ciscoSimulator.js'

const task={configuredPorts:[{deviceId:'s1',interface:'g0/1'},{deviceId:'s1',interface:'Gi0/2'},{deviceId:'s2',interface:'f0/1'}],topology:{links:[{fromDeviceId:'s1',fromInterface:'GigabitEthernet0/1',toDeviceId:'s2',toInterface:'f0/1'}]}}
test('only challenge ports appear, aliases deduplicate, and missing state is down',()=>{
 assert.deepEqual(getDuelPorts(task,'s1',{interfaces:{'GigabitEthernet0/9':{shutdown:false}}}),[{name:'GigabitEthernet0/1',enabled:false},{name:'GigabitEthernet0/2',enabled:false}])
 assert.deepEqual(getDuelPorts({},'s1',{interfaces:{'GigabitEthernet0/9':{shutdown:false}}}),[])
})
test('indicators follow verified no shutdown and shutdown commands',()=>{
 let state=createDeviceState('Switch','switch')
 for(const command of ['enable','configure terminal','interface g0/1','no shutdown'])state=executeCiscoCommand(state,command).state
 assert.equal(getDuelPorts(task,'s1',state)[0].enabled,true)
 state=executeCiscoCommand(state,'shutdown').state
 assert.equal(getDuelPorts(task,'s1',state)[0].enabled,false)
 assert.equal(getDuelPorts(task,'s2',state)[0].enabled,false)
})
test('topology-only payloads and PC adapters use their own device state',()=>{
 const topology={topology:{links:[{fromDeviceId:'pc',fromInterface:'e0',toDeviceId:'s1',toInterface:'g0/1'}]}}
 assert.deepEqual(getDuelPorts(topology,'pc',createDeviceState('PC','pc')),[{name:'Ethernet0',enabled:true}])
})
