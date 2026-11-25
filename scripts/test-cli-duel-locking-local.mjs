// Two real connections; only a restored fictional fixture on the disposable backend.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
const settings=JSON.parse((await readFile(join(tmpdir(),'ccna-latency-settings-private.json'),'utf8')).replace(/^\uFEFF/,''))
assert.equal(settings.API_URL,'http://127.0.0.1:55321')
const run=promisify(execFile),container='supabase_db_ccna-cli-duel-local-20261116'
const args=['exec','-i',container,'psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1']
async function sql(query){return (await run('docker',[...args,'-c',query],{timeout:30000})).stdout.trim()}
const quote=value=>value==null?'null':`'${String(value).replaceAll("'","''")}'`
const fixture=JSON.parse(await sql("select json_build_object('pid',p.id,'actor',p.student_id,'cid',c.id,'pstatus',p.status,'cstatus',c.status,'deadline',c.deadline,'starts',c.starts_at,'started',c.has_started) from public.cli_competition_participants p join public.cli_competitions c on c.id=p.competition_id join public.profiles u on u.id=p.student_id where c.title like 'Concurrency%' and u.full_name like 'Concurrency Player %' and c.status='cancelled' and not exists(select 1 from public.active_assessment_sessions s where s.student_id=p.student_id) limit 1"))
for(const field of ['pid','actor','cid'])assert.match(fixture[field],/^[a-f0-9-]{36}$/i)
const client='device:lock-regression1234:tab:lock-regression1234'
function connection(){const child=spawn('docker',args,{stdio:'pipe'});let output='';child.stdout.on('data',data=>{output+=data});child.stderr.on('data',data=>{output+=data});return {send:sql=>child.stdin.write(sql+'\n'),async marker(text){const start=Date.now();while(!output.includes(text)){if(Date.now()-start>15000||child.exitCode!==null)throw new Error(`Lock regression did not reach ${text}: ${output.slice(-500)}`);await new Promise(r=>setTimeout(r,50))}},close(){if(!child.stdin.destroyed&&!child.stdin.writableEnded)child.stdin.end('rollback;\n')},output:()=>output}}
let a,b
try{
 await sql(`begin;update public.cli_competitions set status='active',has_started=true,deadline=clock_timestamp()+interval '10 minutes' where id='${fixture.cid}';update public.cli_competition_participants set status='in_progress' where id='${fixture.pid}';insert into public.active_assessment_sessions(student_id,assessment_type,attempt_id,assessment_id,started_at,expires_at,client_id) values('${fixture.actor}','competition','${fixture.pid}','${fixture.cid}',clock_timestamp(),clock_timestamp()+interval '10 minutes','${client}');commit;`)
 a=connection();a.send(`begin;set statement_timeout='15s';select id from public.cli_competition_participants where id='${fixture.pid}' for update;select 'PARTICIPANT_HELD';`);await a.marker('PARTICIPANT_HELD')
 b=connection();b.send(`begin;set statement_timeout='15s';set application_name='duel-presence-lock-regression';select set_config('request.jwt.claim.sub','${fixture.actor}',true);select public.set_cli_duel_arena_presence('${fixture.pid}','${client}',true);select 'PRESENCE_DONE';rollback;`)
 const start=Date.now();while(await sql("select count(*) from pg_stat_activity where application_name='duel-presence-lock-regression' and wait_event_type='Lock'")!=='1'){if(Date.now()-start>10000)throw new Error('Presence did not block on participant');await new Promise(r=>setTimeout(r,100))}
 // Fails immediately if presence holds the lease while waiting for the participant.
 a.send(`select student_id from public.active_assessment_sessions where student_id='${fixture.actor}' for update nowait;select 'LEASE_AVAILABLE';rollback;`);await a.marker('LEASE_AVAILABLE');await b.marker('PRESENCE_DONE')
 console.log('PASS real two-connection regression: blocked presence does not hold the lease needed by the command transaction.')
 a.close();b.close();await new Promise(r=>setTimeout(r,200))
 for(const status of ['active','countdown']){
  await sql(`update public.cli_competitions set status='${status}',starts_at=clock_timestamp()+interval '5 seconds' where id='${fixture.cid}'`)
  a=connection();a.send(`begin;set statement_timeout='15s';select id from public.cli_competitions where id='${fixture.cid}' for update;select 'MATCH_HELD';`);await a.marker('MATCH_HELD')
  b=connection();b.send(`begin;set statement_timeout='10s';select set_config('request.jwt.claim.sub','${fixture.actor}',true);select public.${status==='active'?'get_cli_duel_player_updates':'set_cli_duel_arena_presence'}('${fixture.pid}','${client}',${status==='active'?'0':'true'});select 'NO_MATCH_WAIT';rollback;`);await b.marker('NO_MATCH_WAIT');a.close();b.close();await new Promise(r=>setTimeout(r,200))
 }
 console.log('PASS real held-match regression: active reads and countdown heartbeats finish while another connection holds the match lock.')
}finally{
 a?.close();b?.close();await new Promise(r=>setTimeout(r,300))
 await sql(`begin;delete from public.active_assessment_sessions where student_id='${fixture.actor}' and client_id='${client}';update public.cli_competition_participants set status=${quote(fixture.pstatus)} where id='${fixture.pid}';update public.cli_competitions set status=${quote(fixture.cstatus)},deadline=${quote(fixture.deadline)},starts_at=${quote(fixture.starts)},has_started=${fixture.started} where id='${fixture.cid}';commit;`)
}
