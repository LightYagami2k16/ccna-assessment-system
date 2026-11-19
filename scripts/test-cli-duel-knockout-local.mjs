// Fictional accounts on the explicitly isolated loopback stack only.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
const fixture=JSON.parse(await readFile(join(tmpdir(),'ccna-cli-duel-baseline-20261116-153425/local-stack/test-accounts-private.json'),'utf8'))
assert.equal(fixture.url,'http://127.0.0.1:55321')
const [host,one,two,other]=fixture.accounts
for(const user of fixture.accounts){user.api=createClient(fixture.url,fixture.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});const result=await user.api.auth.signInWithPassword({email:user.email,password:fixture.password});assert.equal(result.error,null)}
async function rpc(user,name,args={}){const {data,error}=await user.api.rpc(name,args);if(error)throw new Error(error.message);return data}
async function action(user,body){const {data,error}=await user.api.functions.invoke('cli-duel',{body});if(error){let message=error.message;try{message=JSON.stringify(await error.context.json())}catch{/* no response */}throw new Error(message)}return data}
function sql(query){const r=spawnSync('docker',['exec','-i','supabase_db_ccna-cli-duel-local-20261116','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim()}
const source=await rpc(host,'get_cli_duel_authoring',{p_lab_id:fixture.labId,p_rematch_id:null})
await assert.rejects(()=>rpc(one,'get_cli_duel_authoring',{p_lab_id:fixture.labId,p_rematch_id:null}))
await assert.rejects(()=>rpc(other,'get_cli_duel_authoring',{p_lab_id:fixture.labId,p_rematch_id:null}))
const criteria=[{type:'hostname',target:'',expected:'Battle',points:1},{type:'enable_secret',target:'',expected:'classroom',points:20},{type:'config_saved',target:'',expected:'',points:20}]
const baseline=sql("select (select count(*) from public.quiz_attempts)||','||(select count(*) from public.cli_attempts)")
async function create(damage=[100,0,0],hp=100){
  await rpc(host,'get_cli_duel_workspace')
  const result=await action(host,{action:'create',rulesVersion:2,labId:fixture.labId,title:'Verified knockout regression',durationMinutes:1,allowReview:false,participantSelections:[{studentId:one.id,classId:fixture.classId},{studentId:two.id,classId:fixture.classId}],customization:{instructions:'Configure the duel objectives.',deviceLabel:'Battle switch',initialHostname:'Begin',criteria},combat:{startingHp:hp,damage}})
  const id=result.competitionId
  for(const user of [one,two]){user.clientId=`knockout:${crypto.randomUUID()}`;user.revision=0;await rpc(user,'ready_cli_duel',{p_competition_id:id,p_client_id:user.clientId,p_ready:true})}
  const summary=await rpc(host,'start_cli_duel',{p_competition_id:id})
  assert.equal(summary.competition.rulesVersion,2)
  for(const user of [one,two])user.pid=summary.participants.find(p=>p.displayName===user.name).id
  sql(`update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second',status='active',deadline=clock_timestamp()+interval '58 seconds' where id='${id}'`)
  return id
}
async function command(user,text){const body={action:'command',participantId:user.pid,clientId:user.clientId,commandId:crypto.randomUUID(),sequence:user.revision+1,expectedRevision:user.revision,command:text};const result=await action(user,body);user.revision=result.revision;user.last=body;return result}
const id=await create()
for(const text of ['enable','conf t','enable secret classroom','end','wr'])await command(two,text)
for(const text of ['enable','conf t'])await command(one,text)
const lethal=await command(one,'hostname Battle')
assert.equal(lethal.competition.endReason,'knockout');assert.equal(lethal.competition.winnerParticipantId,one.pid)
assert.equal(lethal.ownParticipant.scorePoints,1);assert.equal(lethal.opponentSummary.scorePoints,40)
assert.equal(lethal.ownParticipant.placement,1);assert.equal(lethal.opponentSummary.placement,2)
assert.equal(lethal.opponentSummary.hp,0);assert.equal(lethal.ownState,null)
assert.equal((await action(one,one.last)).duplicate,true)
await assert.rejects(()=>command(two,'conf t'))
assert.equal(sql(`select count(*) from public.active_assessment_sessions where assessment_id='${id}'`),'0')
console.log('PASS actual custom authoring scope, partial-score knockout victory, bilateral lock and retry after lease release.')
const undo=await create([30,70,0])
for(const text of ['enable','conf t','hostname Battle'])await command(one,text)
let progress=await command(one,'hostname Other');assert.equal(progress.ownParticipant.scorePoints,0);assert.equal(progress.opponentSummary.hp,70)
progress=await command(one,'hostname Battle');assert.equal(progress.opponentSummary.hp,70)
progress=await command(one,'enable secret classroom');assert.equal(progress.competition.endReason,'knockout')
assert.equal(sql(`select count(*) from public.cli_competition_objective_hits where participant_id='${one.pid}'`),'2')
assert.ok(undo)
const concurrent=await create()
await Promise.all([command(one,'enable'),command(two,'enable')]);await Promise.all([command(one,'conf t'),command(two,'conf t')])
const strikes=await Promise.allSettled([command(one,'hostname Battle'),command(two,'hostname Battle')])
assert.equal(strikes.filter(r=>r.status==='fulfilled').length,1)
const final=await rpc(host,'get_cli_duel',{p_competition_id:concurrent})
assert.equal(final.competition.endReason,'knockout');assert.deepEqual(final.participants.map(p=>p.placement).sort(),[1,2])
assert.equal(sql(`select count(*) from public.cli_competition_objective_hits h join public.cli_competition_participants p on p.id=h.participant_id where p.competition_id='${concurrent}'`),'1')
console.log('PASS permanent once-only damage and concurrent lethal requests producing exactly one winner.')
const timeout=await create()
for(const text of ['enable','conf t','enable secret classroom'])await command(two,text)
sql(`update public.cli_competitions set deadline=clock_timestamp()-interval '1 second' where id='${timeout}'`)
const timed=await rpc(one,'settle_cli_duel',{p_competition_id:timeout})
assert.equal(timed.competition.endReason,'time_expired');assert.equal(timed.participants.find(p=>p.id===two.pid).placement,1)
const unchanged=await rpc(host,'get_cli_duel_authoring',{p_lab_id:fixture.labId,p_rematch_id:null})
assert.deepEqual(unchanged.definition,source.definition)
assert.equal(sql("select (select count(*) from public.quiz_attempts)||','||(select count(*) from public.cli_attempts)"),baseline)
console.log('PASS v2 timeout score fallback, immutable source practical and untouched academic attempts.')

if(globalThis.process.env.DUEL_LEASE_RACE==='1') {
 const leaseMatch=await create();await command(one,'enable');await command(one,'conf t')
 const child=spawn('docker',['exec','-i','supabase_db_ccna-cli-duel-local-20261116','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']})
 const ready=new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{if(String(chunk).includes('LOCKED'))resolve()});child.on('error',reject)})
 const ended=new Promise(resolve=>child.on('exit',resolve))
 child.stdin.end(`begin;delete from public.active_assessment_sessions where student_id='${one.id}';\n\\echo LOCKED\nselect pg_sleep(2);commit;`)
 await ready;await assert.rejects(()=>command(one,'hostname Battle'));await ended
 const unchanged=await rpc(host,'get_cli_duel',{p_competition_id:leaseMatch});assert.equal(unchanged.participants.find(p=>p.id===one.pid).scorePoints,0)
 await rpc(host,'manage_cli_duel',{p_competition_id:leaseMatch,p_action:'cancel',p_reason:'Local lease regression cleanup'})
 assert.equal((await rpc(host,'get_cli_duel',{p_competition_id:leaseMatch})).competition.endReason,'cancelled')
 console.log('PASS release racing a lethal command cannot deal damage or create a winner.')
}
