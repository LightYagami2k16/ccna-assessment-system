import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
const fixture = JSON.parse(await readFile(join(tmpdir(),'ccna-cli-duel-baseline-20261116-153425/local-stack/test-accounts-private.json'),'utf8'))
assert.equal(fixture.url,'http://127.0.0.1:55321')
const container='supabase_db_ccna-cli-duel-local-20261116'
const args=['exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At']
const sql=query=>{const r=spawnSync('docker',args,{input:query,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim()}
async function lock(query) {
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']})
  const ready=new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{if(String(chunk).includes('LOCKED'))resolve()});child.on('error',reject)})
  child.stdin.end(`begin;${query};\n\\echo LOCKED\nselect pg_sleep(2);commit;`)
  const ended=new Promise(resolve=>child.on('exit',resolve))
  await ready;return {ended}
}
for(const user of fixture.accounts){user.client=createClient(fixture.url,fixture.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});const r=await user.client.auth.signInWithPassword({email:user.email,password:fixture.password});assert.equal(r.error,null)}
const [host,one,two]=fixture.accounts
async function rpc(user,name,body){const {data,error}=await user.client.rpc(name,body);if(error)throw error;return data}
async function action(user,body){const {data,error}=await user.client.functions.invoke('cli-duel',{body});if(error){let message=error.message;try{message=JSON.stringify(await error.context.json())}catch{}throw new Error(message)}return data}
async function create() {
  await rpc(host,'get_cli_duel_workspace')
  const {competitionId:id}=await action(host,{action:'create',labId:fixture.labId,title:'Deadline boundary regression',durationMinutes:1,allowReview:false,participantSelections:[{studentId:one.id,classId:fixture.classId},{studentId:two.id,classId:fixture.classId}]})
  one.clientId=`local:${crypto.randomUUID()}`;two.clientId=`local:${crypto.randomUUID()}`
  for(const user of [one,two])await rpc(user,'ready_cli_duel',{p_competition_id:id,p_client_id:user.clientId,p_ready:true})
  const summary=await rpc(host,'start_cli_duel',{p_competition_id:id})
  for(const user of [one,two])user.pid=summary.participants.find(p=>p.displayName===user.name).id
  sql(`update public.cli_competitions set starts_at=clock_timestamp()-interval '5 seconds',status='active',deadline=clock_timestamp()+interval '50 seconds' where id='${id}'`)
  return id
}
function command(user,revision,text){return {action:'command',participantId:user.pid,clientId:user.clientId,commandId:crypto.randomUUID(),sequence:revision+1,expectedRevision:revision,command:text}}
const match=await create()
await Promise.all([action(one,command(one,0,'enable')),action(two,command(two,0,'enable'))])
await Promise.all([action(one,command(one,1,'conf t')),action(two,command(two,1,'conf t'))])
await Promise.all([action(one,command(one,2,'hostname Campus')),action(two,command(two,2,'hostname Other'))])
assert.equal((await rpc(one,'get_cli_duel_player',{p_participant_id:one.pid,p_client_id:one.clientId})).revision,3)
assert.equal((await rpc(two,'get_cli_duel_player',{p_participant_id:two.pid,p_client_id:two.clientId})).revision,3)
// A blocked lease update must not turn a request received early into late credit.
const releaseLease=await lock(`select * from public.active_assessment_sessions where student_id='${two.id}' for update;update public.cli_competitions set deadline=clock_timestamp()+interval '1 second' where id='${match}'`)
// Above lock helper completes only once stdout says LOCKED; its transaction remains open.
await assert.rejects(()=>action(two,command(two,3,'hostname Campus')))
await releaseLease.ended
assert.equal(sql(`select score_points from public.cli_competition_participants where id='${two.pid}'`),'0')
await rpc(one,'settle_cli_duel',{p_competition_id:match})
const cancellation=await create()
const releaseMatch=await lock(`select * from public.cli_competitions where id='${cancellation}' for update;update public.cli_competitions set deadline=clock_timestamp()+interval '1 second' where id='${cancellation}'`)
await assert.rejects(()=>rpc(host,'manage_cli_duel',{p_competition_id:cancellation,p_action:'cancel',p_reason:'Queued across deadline'}))
await releaseMatch.ended
const final=await rpc(one,'get_cli_duel',{p_competition_id:cancellation})
assert.equal(final.competition.status,'completed')
const concurrent=await create()
const overlaps=await Promise.allSettled([action(one,command(one,0,'enable')),rpc(one,'finish_cli_duel',{p_participant_id:one.pid,p_client_id:one.clientId})])
assert.equal(overlaps[1].status,'fulfilled')
const sealed=await rpc(one,'get_cli_duel_player',{p_participant_id:one.pid,p_client_id:one.clientId})
assert.equal(sealed.ownParticipant.status,'submitted');assert.equal(sealed.ownState,null)
assert.ok(Number(sql(`select count(*) from public.cli_competition_commands where participant_id='${one.pid}'`))<=1)
await rpc(two,'finish_cli_duel',{p_participant_id:two.pid,p_client_id:two.clientId})
assert.equal((await rpc(host,'get_cli_duel',{p_competition_id:concurrent})).competition.status,'completed')
console.log('PASS actual overlapping command/finish requests seal one consistent state.')
console.log('PASS real two-connection deadline locks, distinct student clients and independent commands.')
