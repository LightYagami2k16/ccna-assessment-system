import test from 'node:test'
import assert from 'node:assert/strict'
import {createDuelBackend} from '../../supabase/functions/cli-duel/backend.js'
test('backend verifies each bearer with auth and keeps service authorization on protected RPCs only',async()=>{
 const calls=[],backend=createDuelBackend({url:'http://localhost:55321',anonKey:'public-key',serviceKey:'private-key',fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith('/auth/v1/user')?{id:'verified-user'}:{revision:1})}})
 assert.equal(await backend.authenticate('student-jwt'),'verified-user');assert.deepEqual(await backend.rpc('cli_duel_operation_context',{p_actor_id:'verified-user'}),{revision:1})
 assert.equal(calls[0].options.headers.Authorization,'Bearer student-jwt');assert.equal(calls[0].options.headers.apikey,'public-key');assert.equal(calls[1].options.headers.Authorization,'Bearer private-key');assert.equal(calls[1].options.headers.apikey,'private-key');assert.equal(JSON.parse(calls[1].options.body).p_actor_id,'verified-user')
})
test('invalid sessions are denied, transient auth failures remain retryable, and database error codes survive',async()=>{
 let status=401;const backend=createDuelBackend({url:'http://localhost:55321',anonKey:'public',serviceKey:'private',fetchImpl:async()=>Response.json({code:'P0001',message:'Ranked input is closed.'},{status})})
 assert.equal(await backend.authenticate('expired'),null);status=503;await assert.rejects(()=>backend.authenticate('valid'));await assert.rejects(()=>backend.rpc('cli_duel_operation_context',{}),{code:'P0001',message:'Ranked input is closed.'});await assert.rejects(()=>backend.rpc('../arbitrary',{}))
})
