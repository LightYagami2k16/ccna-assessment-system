import test from 'node:test'
import assert from 'node:assert/strict'
import {deliverDuelOperation,createDuelNotifier} from './cliDuelDelivery.js'
test('temporary server failures retry the identical operation with bounded backoff',async()=>{
 const calls=[],waits=[],payload={commandId:'same-id',sequence:1,operation:{command:'enable'}}
 const result=await deliverDuelOperation(async request=>{calls.push(request);if(calls.length<3)throw Object.assign(new Error('Busy'),{status:503});return {revision:1}},payload,{canSend:()=>true,wait:async ms=>waits.push(ms),random:()=>0})
 assert.deepEqual(result,{revision:1});assert.equal(calls.length,3);assert.ok(calls.every(p=>p===payload));assert.deepEqual(waits,[500,1000])
})
test('revocation or pause during backoff prevents retry; unknown transport and conflicts remain explicit',async()=>{
 let allowed=true,calls=0;await assert.rejects(()=>deliverDuelOperation(async()=>{calls++;throw Object.assign(new Error('Busy'),{status:503})},{},{canSend:()=>allowed,wait:async()=>{allowed=false},random:()=>0}));assert.equal(calls,1)
 for(const status of [undefined,401,403,409,502]){calls=0;await assert.rejects(()=>deliverDuelOperation(async()=>{calls++;throw Object.assign(new Error('Failed'),{status})},{},{canSend:()=>true,wait:async()=>assert.fail()}));assert.equal(calls,1)}
})
test('retry exhaustion is bounded and notification bursts produce one refresh',async()=>{
 for(const status of [500,503,504,546]){let calls=0;await assert.rejects(()=>deliverDuelOperation(async()=>{calls++;throw Object.assign(new Error('Busy'),{status})},{},{canSend:()=>true,wait:async()=>{},random:()=>0}));assert.equal(calls,3)}
 let timer,notified=0;const notifier=createDuelNotifier(()=>notified++,{schedule:callback=>{timer=callback;return 1},cancel:()=>{timer=null}});notifier.changed();notifier.changed();notifier.changed();timer();assert.equal(notified,1);notifier.changed();notifier.stop();assert.equal(timer,null);notifier.changed();assert.equal(timer,null)
})
