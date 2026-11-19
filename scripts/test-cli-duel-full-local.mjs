// Fictional accounts on the explicitly isolated loopback stack only.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
const fixture=JSON.parse(await readFile(join(tmpdir(),'ccna-cli-duel-baseline-20261116-153425/local-stack/test-accounts-private.json'),'utf8'))
assert.equal(fixture.url,'http://127.0.0.1:55321')
const [host,one,two,other]=fixture.accounts
for(const user of fixture.accounts){user.api=createClient(fixture.url,fixture.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});const result=await user.api.auth.signInWithPassword({email:user.email,password:fixture.password});assert.equal(result.error,null)}
async function rpc(user,name,args={}){const {data,error}=await user.api.rpc(name,args);if(error)throw new Error(error.message);return data}
async function action(user,body){const {data,error}=await user.api.functions.invoke('cli-duel',{body});if(error){let message=error.message;try{message=JSON.stringify(await error.context.json())}catch{/* no response */}throw new Error(message)}return data}
function sql(query){const r=spawnSync('docker',['exec','-i','supabase_db_ccna-cli-duel-local-20261116','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim()}
const source=await rpc(host,'get_cli_duel_configuration',{p_lab_id:fixture.labId,p_rematch_id:null})
await assert.rejects(()=>rpc(one,'get_cli_duel_configuration',{p_lab_id:fixture.labId,p_rematch_id:null}))
await assert.rejects(()=>rpc(other,'get_cli_duel_configuration',{p_lab_id:fixture.labId,p_rematch_id:null}))
const courseId=source.definition.courseId
const baseline=sql("select (select count(*) from public.quiz_attempts)||','||(select count(*) from public.cli_attempts)")
const configuration={courseId,moduleId:null,title:'Full local topology acceptance',description:'Fictional local verification',instructions:'Configure the routers and PC.',durationMinutes:5,devices:[{id:'r1',label:'Core router',hostname:'Router',type:'router'},{id:'r2',label:'Branch router',hostname:'Branch',type:'router'},{id:'p1',label:'Student PC',hostname:'PC1',type:'pc'}],topology:{links:[{id:'l1',fromDeviceId:'r1',fromInterface:'GigabitEthernet0/0',toDeviceId:'p1',toInterface:'Ethernet0'},{id:'l2',fromDeviceId:'r1',fromInterface:'GigabitEthernet0/1',toDeviceId:'r2',toInterface:'GigabitEthernet0/0'}]},criteria:[{type:'hostname',deviceId:'r1',target:'',expected:'DuelR1',points:10},{type:'ospf_process',deviceId:'r2',target:'1',expected:'',points:10},{type:'interface_ip',deviceId:'p1',target:'Ethernet0',expected:'10.0.0.2 255.255.255.0',points:10}]}
await rpc(host,'get_cli_duel_workspace')
const created=await action(host,{action:'create',rulesVersion:3,title:configuration.title,durationMinutes:configuration.durationMinutes,configuration,combat:{startingHp:100,damage:[25,25,50]},participantSelections:[{studentId:one.id,classId:fixture.classId},{studentId:two.id,classId:fixture.classId}],allowReview:true})
const id=created.competitionId
const hostFlow=(await rpc(host,'get_cli_duel',{p_competition_id:id})).competition.hostControlled
for(const user of [one,two]){user.clientId=`full:${crypto.randomUUID()}`;user.revision=0;if(hostFlow){const summary=await rpc(host,'get_cli_duel',{p_competition_id:id});const participant=summary.participants.find(p=>p.displayName===user.name);await rpc(user,'enter_cli_duel_arena',{p_participant_id:participant.id,p_client_id:user.clientId});await rpc(user,'set_cli_duel_arena_presence',{p_participant_id:participant.id,p_client_id:user.clientId,p_entered:true})}else await rpc(user,'ready_cli_duel',{p_competition_id:id,p_client_id:user.clientId,p_ready:true})}
const summary=await rpc(host,'start_cli_duel',{p_competition_id:id})
assert.equal(summary.competition.rulesVersion,3)
for(const user of [one,two])user.pid=summary.participants.find(p=>p.displayName===user.name).id
sql(`update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second',status='active',deadline=clock_timestamp()+interval '4 minutes' where id='${id}'`)
async function operation(deviceId,operation){const body={action:'operation',participantId:one.pid,clientId:one.clientId,commandId:crypto.randomUUID(),sequence:one.revision+1,expectedRevision:one.revision,deviceId,operation};const result=await action(one,body);one.revision=result.revision;one.last=body;return result}
for(const command of ['enable','conf t','interface g0/0','ip address 10.0.0.1 255.255.255.0','no shutdown','exit','hostname DuelR1'])await operation('r1',{type:'command',command})
for(const command of ['enable','conf t','router ospf 1'])await operation('r2',{type:'command',command})
let progress=await rpc(one,'get_cli_duel_player',{p_participant_id:one.pid,p_client_id:one.clientId})
assert.equal(progress.opponentSummary.hp,50);assert.equal(progress.ownCommands[0].promptBefore,'Router>');assert.equal(progress.ownCommands.find(entry=>entry.command==='hostname DuelR1').promptBefore,'Router(config)#')
const lethal=await operation('p1',{type:'pc_configure',settings:{ipAddress:'10.0.0.2',subnetMask:'255.255.255.0',defaultGateway:'10.0.0.1',preferredDns:'',alternateDns:''}})
assert.equal(lethal.competition.endReason,'knockout');assert.equal(lethal.competition.winnerParticipantId,one.pid)
assert.equal(lethal.ownParticipant.scorePoints,30);assert.equal(lethal.opponentSummary.hp,0)
assert.equal((await action(one,one.last)).duplicate,true)
await assert.rejects(()=>action(one,{...one.last,deviceId:'r1'}))
await assert.rejects(()=>action(one,{...one.last,operation:{...one.last.operation,settings:{...one.last.operation.settings,ipAddress:'10.0.0.99'}}}))
assert.equal(sql(`select device_id from public.cli_competition_commands where participant_id='${one.pid}' order by sequence desc limit 1`),'p1')
const review=await rpc(one,'get_cli_duel_review',{p_participant_id:one.pid})
assert.ok(review.commands.some(entry=>entry.deviceId==='p1'));assert.equal(review.commands[0].promptBefore,'Router>')
assert.deepEqual((await rpc(host,'get_cli_duel_configuration',{p_lab_id:fixture.labId,p_rematch_id:null})).definition,source.definition)
assert.equal(sql("select (select count(*) from public.quiz_attempts)||','||(select count(*) from public.cli_attempts)"),baseline)
console.log('PASS actual local v3 blank creation, multiple routers/PC/topology, advanced grading, nonprimary PC knockout, exact retry/changed-intent denial, per-device review, source and academic preservation.')
