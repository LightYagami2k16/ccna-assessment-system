import test from 'node:test'
import assert from 'node:assert/strict'
import {getDuelInputPolicy} from './cliDuelInputPolicy.js'
const active={hasState:true,ownsAttempt:true,participantStatus:'in_progress',matchStatus:'active',leaseStatus:'active',online:true,fresh:true,expired:false,countdown:false,uncertain:false}
test('transient refresh or heartbeat failures preserve drafting but never allow submission',()=>{
 for(const change of [{fresh:false},{online:false},{uncertain:true}])assert.deepEqual(getDuelInputPolicy({...active,...change}),{canDraft:true,canSubmit:false})
 assert.deepEqual(getDuelInputPolicy(active),{canDraft:true,canSubmit:true})
})
test('denial, lease loss, countdown, pause and ended attempts lock drafting and submission',()=>{
 for(const change of [{hasState:false},{ownsAttempt:false},{leaseStatus:'blocked'},{participantStatus:'submitted'},{matchStatus:'paused'},{matchStatus:'completed'},{countdown:true},{expired:true}])assert.deepEqual(getDuelInputPolicy({...active,...change}),{canDraft:false,canSubmit:false})
})
