import test from 'node:test'
import assert from 'node:assert/strict'
import { createDuelRefreshCoordinator, duelCandidateKey, mergeDuelSnapshot } from './cliDuelSync.js'

test('cursor updates retain history and deduplicate overlapping command acknowledgements',()=>{
 const previous={competition:{id:'match'},ownParticipant:{id:'player'},revision:2,ownCommands:[{sequence:1,command:'enable'},{sequence:2,command:'conf t'}]}
 const next={...previous,revision:3,commandsAfter:1,ownCommands:[{sequence:2,command:'conf t'},{sequence:3,command:'hostname Campus'}]}
 assert.deepEqual(mergeDuelSnapshot(previous,next).ownCommands.map(c=>c.sequence),[1,2,3])
 assert.deepEqual(mergeDuelSnapshot(previous,{...next,commandsAfter:0,ownCommands:[]}).ownCommands,[])
 assert.equal(mergeDuelSnapshot(previous,{...next,ownParticipant:{id:'other'}}).ownCommands.length,2)
})
test('refresh loader receives the latest merged snapshot for its log cursor',async()=>{
 let received;const initial={competition:{id:'match'},ownParticipant:{id:'player'},revision:1,ownCommands:[{sequence:1}]}
 const sync=createDuelRefreshCoordinator(async snapshot=>{received=snapshot;return {...initial,revision:2,commandsAfter:1,ownCommands:[{sequence:2}]}},()=>{},()=>{})
 sync.adopt(initial);await sync.refresh();assert.equal(received.revision,1);assert.deepEqual(sync.getSnapshot().ownCommands.map(c=>c.sequence),[1,2]);sync.stop()
})
test('host cursor updates merge each player separately',()=>{
 const previous={competition:{id:'match'},players:[{id:'one',commands:[{sequence:1}]},{id:'two',commands:[{sequence:1}]}]}
 const next={competition:{id:'match'},players:[{id:'one',commandsAfter:1,commands:[{sequence:2}]},{id:'two',commandsAfter:1,commands:[]}]}
 assert.deepEqual(mergeDuelSnapshot(previous,next).players.map(p=>p.commands.map(c=>c.sequence)),[[1,2],[1]])
})
test('refresh coalesces slow invalidations without starving response or authorization denial',async()=>{let resolve,calls=0;const applied=[];const sync=createDuelRefreshCoordinator(()=>{calls++;return new Promise(r=>{resolve=r})},value=>applied.push(value),error=>applied.push(error.message));const first=sync.refresh();const second=sync.refresh();assert.equal(calls,1);resolve('authorized');await first;await new Promise(r=>setTimeout(r,0));assert.deepEqual(applied,['authorized']);assert.equal(calls,2);resolve('new revision');await second;await new Promise(r=>setTimeout(r,0));assert.deepEqual(applied,['authorized','new revision']);sync.stop()})
test('failed reconciliation returns false and never reports success',async()=>{const sync=createDuelRefreshCoordinator(async()=>{throw new Error('offline')},()=>assert.fail(),()=>{});assert.equal(await sync.refresh(),false);sync.stop()})
test('participant selections stay stable when class candidate order changes',()=>{const a={studentId:'a',classId:'one'},b={studentId:'b',classId:'one'};const key=duelCandidateKey(a);assert.equal([b,a].find(p=>duelCandidateKey(p)===key),a);assert.notEqual(key,duelCandidateKey({...a,classId:'two'}))})

test('adopted mutation bypasses a pending read and prevents snapshot regression',async()=>{
 let resolve;const applied=[];const sync=createDuelRefreshCoordinator(()=>new Promise(r=>{resolve=r}),value=>applied.push(value),()=>{})
 const pending=sync.refresh();assert.equal(typeof sync.adopt,'function');sync.adopt({revision:2,matchRevision:5});resolve({revision:1,matchRevision:4});await pending;assert.deepEqual(applied,[{revision:2,matchRevision:5}]);sync.stop()
})
test('older polls cannot undo newer own or match revisions; authorization failures still clear access',async()=>{
 const applied=[],denied=[];let next={revision:1,matchRevision:8};const sync=createDuelRefreshCoordinator(async()=>{if(next instanceof Error)throw next;return next},v=>applied.push(v),e=>denied.push(e.message));assert.equal(typeof sync.adopt,'function');sync.adopt({revision:2,matchRevision:9});await sync.refresh();next={revision:2,matchRevision:8};await sync.refresh();assert.equal(applied.length,1);next=Object.assign(new Error('Access revoked'),{status:403});await sync.refresh();assert.deepEqual(denied,['Access revoked']);sync.stop();assert.equal(sync.adopt({revision:3,matchRevision:10}),false)
})

test('a late command ACK cannot restore access after denial until an authorized read succeeds',async()=>{
 let next=Object.assign(new Error('Revoked'),{status:403});const applied=[];const sync=createDuelRefreshCoordinator(async()=>{if(next instanceof Error)throw next;return next},value=>applied.push(value),()=>{})
 await sync.refresh();assert.equal(sync.adopt({revision:1,matchRevision:2}),false);assert.equal(applied.length,0);next={revision:1,matchRevision:3};await sync.refresh();assert.equal(applied.length,1);assert.equal(sync.adopt({revision:2,matchRevision:4}),true);sync.stop()
})

test('current snapshot distinguishes newer authorized data from denied access',async()=>{let next={revision:1,matchRevision:4};const sync=createDuelRefreshCoordinator(async()=>{if(next instanceof Error)throw next;return next},()=>{},()=>{});await sync.refresh();assert.equal(typeof sync.getSnapshot,'function');assert.deepEqual(sync.getSnapshot(),next);assert.equal(sync.adopt({revision:1,matchRevision:3}),false);assert.deepEqual(sync.getSnapshot(),next);next=Object.assign(new Error('Revoked'),{status:403});await sync.refresh();assert.equal(sync.getSnapshot(),null);sync.stop()})
