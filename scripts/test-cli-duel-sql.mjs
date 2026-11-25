// Isolated PostgreSQL only; no application credentials or hosted requests.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {prepareFullDuelDefinition,createFullDuelInitialState,executeFullDuelOperation,fullOperationCommand} from '../supabase/functions/_shared/cliDuelFullProtocol.js'
import { createDuelInitialState, executeDuelCommand, prepareDuelDefinition, defaultDuelDamage } from '../supabase/functions/_shared/cliDuelProtocol.js'
const modulePath = process.env.PGLITE_MODULE
if (!modulePath) throw new Error('Set PGLITE_MODULE to an existing temporary pglite/dist/index.js.')
const {PGlite}=await import(pathToFileURL(modulePath).href)
const db=new PGlite()
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const file=name=>readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8')
async function loadFunction(filename,name){const source=await file(filename),start=source.indexOf(`create or replace function public.${name}(`);assert.notEqual(start,-1,name);await db.exec(source.slice(start,source.indexOf('$$;',source.indexOf('as $$',start))+3))}
const rpc=async(name,args=[])=> (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result
const user=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);await db.exec('set role authenticated')}
const service=async()=>db.exec('set role service_role')
const client='device:1234567890:tab:1234567890'
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,banned_until timestamptz,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,service_role;
 create table public.profiles(id uuid primary key,role text,full_name text);
 create table public.class_sections(id uuid primary key,created_by uuid,is_active boolean default true,code text,name text);
 create table public.class_memberships(class_id uuid,student_id uuid);
 create table public.cli_labs(id uuid primary key,created_by uuid,course_id bigint,module_id uuid,title text,instructions text,description text,device_type text,initial_hostname text,duration_minutes integer,grading_criteria jsonb,devices jsonb,topology jsonb,status text default 'draft');
 create table public.active_assessment_sessions(student_id uuid primary key,assessment_type text not null check(assessment_type in ('quiz','cli')),attempt_id uuid,assessment_id uuid,started_at timestamptz,expires_at timestamptz,updated_at timestamptz,client_id text,client_label text,client_claimed_at timestamptz,client_heartbeat_at timestamptz);
 create function public.reconcile_expired_assessment_attempts() returns jsonb language sql as $$ select '{}'::jsonb $$;
 create table public.quiz_attempts(id uuid,student_id uuid,quiz_id uuid,status text,started_at timestamptz,expires_at timestamptz);
 create table public.cli_attempts(id uuid,student_id uuid,lab_id uuid,status text,started_at timestamptz,expires_at timestamptz);
 create table public.quizzes(id uuid,title text,created_by uuid);
 create table public.courses(id bigint primary key,code text,title text,is_active boolean default true);insert into public.courses values(1,'ITN','Introduction to Networks',true);
 create table public.modules(id uuid primary key,course_id bigint,code text,title text);
 `)
 await loadFunction('004_admin_role_compatibility.sql','get_current_user_role_text')
 for(const [filename,names] of [['026_phase2_expanded_switch_configuration.sql',['canonical_cli_line','canonical_cli_vlan_list']],['031_phase2_acl_configuration.sql',['canonical_cli_interface','canonical_cli_acl_id','cli_criterion_is_met']],['036_phase3_multi_device_topology_foundation.sql',['cli_criterion_device_state']],['046_one_active_assessment_session.sql',['describe_active_assessment_session','get_student_active_assessment_session']],['048_repair_active_assessment_trigger.sql',['enforce_one_active_assessment_session']],['052_complete_assessment_client_sessions.sql',['get_instructor_assessment_client_sessions']],['047_assessment_client_session_leases.sql',['validate_assessment_client_id','claim_assessment_client_session','assert_assessment_client_session','heartbeat_assessment_client_session','release_assessment_client_session']]])for(const name of names) await loadFunction(filename,name)
 const originalGrade=(await db.query("select pg_get_functiondef('public.cli_criterion_is_met(jsonb,jsonb)'::regprocedure) def")).rows[0].def
 if(process.env.DUEL_INCREMENTAL_TEST)for(const name of ['034_phase2_nat_pat_configuration.sql','035_phase2_dhcp_etherchannel_stp_ssh.sql']){
  const amendments=[...(await file(name)).matchAll(/do \$\$[\s\S]*?\$\$;/gi)].filter(([sql])=>sql.includes("routine.proname = 'cli_criterion_is_met'"));assert.equal(amendments.length,1,name);await db.exec(amendments[0][0])
 }
 // Actual 036 wraps the actual SQL evaluator for per-device state.
 const source=await file('036_phase3_multi_device_topology_foundation.sql')
 const amendment=[...source.matchAll(/do \$\$[\s\S]*?\$\$;/g)].find(([sql])=>sql.includes("routine.proname = 'cli_criterion_is_met'"))
 assert.ok(amendment);await db.exec(amendment[0]);assert.notEqual((await db.query("select pg_get_functiondef('public.cli_criterion_is_met(jsonb,jsonb)'::regprocedure) def")).rows[0].def,originalGrade)
 if(process.env.DUEL_INCREMENTAL_TEST)for(const name of ['037_phase3_topology_connectivity_grading.sql','053_phase3_routed_connectivity_and_traceroute.sql','055_phase3_pc_ipv4_ui_and_dns_grading.sql','056_phase3_multidevice_ssh_grading.sql']){
  const amendments=[...(await file(name)).matchAll(/do \$\$[\s\S]*?\$\$;/gi)].filter(([sql])=>sql.includes("routine.proname = 'cli_criterion_is_met'"));assert.equal(amendments.length,1,name);await db.exec(amendments[0][0])
 }
 for(const [n,role] of [[1,'student'],[2,'student'],[3,'instructor'],[4,'instructor'],[5,'admin'],[6,'student'],[7,'student']]){await db.query('insert into public.profiles values($1,$2,$3)',[id(n),role,`Person ${n}`]);await db.query('insert into auth.users values($1,null,$2)',[id(n),`person${n}@example.test`])}
 await db.query('insert into public.class_sections values($1,$2,true,$3,$4),($5,$6,true,$7,$8)',[id(30),id(3),'A','Class A',id(40),id(4),'B','Class B'])
 for(const n of [1,2])await db.query('insert into public.class_memberships values($1,$2)',[id(30),id(n)])
 await db.query('insert into public.class_memberships values($1,$2)',[id(40),id(6)])
 const definition={id:id(100),title:'Duel practical',instructions:'Set hostname Campus-SW1 and save.',devices:[{id:'d1',label:'Switch',hostname:'Switch',type:'switch'}],topology:{links:[]},criteria:[{deviceId:'d1',type:'hostname',target:'',expected:'Campus-SW1',points:10},{deviceId:'d1',type:'config_saved',target:'',expected:'',points:10}]}
 await db.query("insert into public.cli_labs(id,created_by,title,instructions,devices,topology,grading_criteria,device_type,initial_hostname,duration_minutes) values($1,$2,$3,$4,$5,$6,$7,'switch','Switch',5)",[id(100),id(3),definition.title,definition.instructions,definition.devices,definition.topology,definition.criteria])
 await db.exec(await file('074_cli_duel_pilot.sql'))
 await db.exec(await file('075_cli_duel_sessions_realtime.sql'))
 await db.exec(await file('074_cli_duel_pilot.sql'));await db.exec(await file('075_cli_duel_sessions_realtime.sql'))
 await db.exec(`create trigger quiz_session after insert or update or delete on public.quiz_attempts for each row execute function public.enforce_one_active_assessment_session();create trigger cli_session after insert or update or delete on public.cli_attempts for each row execute function public.enforce_one_active_assessment_session();`)
 if(process.env.DUEL_KNOCKOUT_TEST) {await db.exec(await file('076_cli_duel_knockout_customization.sql'));await db.exec(await file('076_cli_duel_knockout_customization.sql'))}
 if(process.env.DUEL_FULL_TEST) {await db.exec(await file('077_cli_duel_full_practical_configuration.sql'));await db.exec(await file('077_cli_duel_full_practical_configuration.sql'))}
 if(process.env.DUEL_PROMPT_TEST){await db.exec(await file('079_cli_duel_command_prompts.sql'));await db.exec(await file('079_cli_duel_command_prompts.sql'))}
 if(process.env.DUEL_INCREMENTAL_TEST){await db.exec(await file('084_cli_duel_incremental_grading.sql'));await db.exec('update cli_duel_private.grading_settings set audit=true;')}
 console.log('Migrations 074/075 loaded for isolated duel contracts.')
 await user(3);const workspace=await rpc('get_cli_duel_workspace');assert.equal(workspace.candidates.length,2)
 await user(4);assert.equal((await rpc('get_cli_duel_workspace')).candidates.length,1)
 await user(1);await assert.rejects(()=>rpc('cli_duel_authoring_context',[id(3),id(100),null]),/permission denied/)
 await service();const context=await rpc('cli_duel_authoring_context',[id(3),id(100),null])
 await db.exec('reset role');for(const bad of [{...context.definition.criteria[0],type:'vlan_exists',target:'not-a-number',expected:''},{...context.definition.criteria[0],type:'vlan_exists',target:'9999',expected:''},{...context.definition.criteria[0],type:'interface_mode',target:'FastEthernet0/1',expected:'unsupported'}])assert.ok((await rpc('cli_duel_definition_errors',[{...context.definition,criteria:[bad]},null])).length)
 await service();const initial=createDuelInitialState(context.definition)
 const payload={labId:id(100),title:'Match one',durationMinutes:5,participantSelections:[{studentId:id(1),classId:id(30)},{studentId:id(2),classId:id(30)}],allowReview:false}
 const match=await rpc('cli_duel_create',[id(3),payload,context.fingerprint,initial]);assert.ok(match)
 await user(6);await assert.rejects(()=>rpc('get_cli_duel',[match]))
 await user(1);const summary=await rpc('get_cli_duel',[match]);assert.equal(JSON.stringify(summary).includes('Campus-SW1'),false)
 assert.equal(summary.participants.length,2)
 await assert.rejects(()=>db.query('select * from public.cli_competition_participants'),/permission denied/)
 console.log('PASS initial SQL contracts: creator/class candidate scopes, private service methods, frozen creation and safe student summary.')
 await user(1);await rpc('ready_cli_duel',[match,client,true]);await user(2);await rpc('ready_cli_duel',[match,client,true]);
 // Starting is atomic when one player is already taking an ordinary quiz.
 await db.exec('reset role');await db.query("insert into public.quiz_attempts values($1,$2,$3,'in_progress',now(),now()+interval '5 minutes')",[id(800),id(2),id(801)])
 await user(3);await assert.rejects(()=>rpc('start_cli_duel',[match]),/active assessment/)
 await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from public.active_assessment_sessions where assessment_type='competition'")).rows[0].n,0)
 await db.query("update public.quiz_attempts set status='submitted' where id=$1",[id(800)])
 await user(3);await rpc('start_cli_duel',[match]);
 await db.exec('reset role');for(const [table,column] of [['quiz_attempts','quiz_id'],['cli_attempts','lab_id']])await assert.rejects(()=>db.query(`insert into public.${table}(id,student_id,${column},status,started_at,expires_at) values($1,$2,$3,'in_progress',now(),now()+interval '1 minute')`,[id(802),id(1),id(803)]),/active CLI Duel/)

 await user(5);const ordinaryMonitor=await rpc('get_instructor_assessment_client_sessions');assert.ok(ordinaryMonitor.every(row=>row.assessmentType!=='competition'),'Legacy monitoring must exclude duel leases')
 await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=now()-interval '1 minute',deadline=now()+interval '4 minutes',status='active' where id=$1",[match]);
 await user(1);const running=await rpc('get_cli_duel',[match]);const own=running.participants.find(p=>p.isOwn);assert.ok(own.id)
 let state=initial, revision=0,sequence=0
 for(const command of ['enable','conf t','hostname Campus-SW1']){
  const outcome=executeDuelCommand(definition,state,command);await service();
  const result=await rpc('cli_duel_commit_command',[id(1),own.id,client,id(1000+sequence),sequence+1,revision,command,outcome]);
  state=outcome.state;revision=result.revision;sequence+=1
 }
 await user(1);const scored=await rpc('get_cli_duel',[match]);assert.equal(scored.participants.find(p=>p.isOwn).scorePoints,10);assert.equal(scored.participants.find(p=>!p.isOwn).hp,50)
 await assert.rejects(()=>rpc('cli_duel_commit_command',[id(1),own.id,client,id(9999),4,3,'end',{}]),/permission denied/)
 console.log('PASS initial SQL lifecycle/scoring contracts.')
 await service()
 const duplicate=await rpc('cli_duel_commit_command',[id(1),own.id,client,id(1002),3,2,'hostname Campus-SW1',{}]);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.revision,3)
 await assert.rejects(()=>rpc('cli_duel_commit_command',[id(1),own.id,client,id(1002),3,2,'hostname Other',{}]),/different content/)
 await assert.rejects(()=>rpc('cli_duel_command_context',[id(1),own.id,client,id(1010),4,1,'end']),/Resynchronize/)
 await user(1);const claimed=await rpc('claim_assessment_client_session',['competition',own.id,client,'Browser']);assert.equal(claimed.claimed,true)
 await assert.rejects(()=>rpc('claim_assessment_client_session',['competition',own.id,'device:other1234567890:tab:other1234567890','Other']),/another browser/)
 await assert.rejects(()=>rpc('get_cli_duel_review',[own.id]),/unavailable/)
 const step=async(command)=>{const outcome=executeDuelCommand(definition,state,command);await service();const result=await rpc('cli_duel_commit_command',[id(1),own.id,client,id(1000+sequence),sequence+1,revision,command,outcome]);state=outcome.state;revision=result.revision;sequence+=1;return result}
 let result=await step('hostname Other');assert.equal(result.ownParticipant.scorePoints,0);assert.equal(result.opponentSummary.hp,100)
 await step('hostname Campus-SW1');await step('end');result=await step('wr');assert.equal(result.ownParticipant.status,'submitted');assert.equal(result.ownParticipant.scorePoints,20);assert.equal(result.ownState,null)
 await user(1);const hidden=await rpc('get_cli_duel_player',[own.id,client]);assert.equal(hidden.ownState,null);assert.deepEqual(hidden.ownCommands,[])
 await assert.rejects(()=>rpc('get_cli_duel_review',[own.id]),/unavailable/)
 await user(2);const opponent=(await rpc('get_cli_duel',[match])).participants.find(p=>p.isOwn);await rpc('finish_cli_duel',[opponent.id,client])
 await user(3);const final=await rpc('get_cli_duel',[match]);assert.equal(final.competition.status,'completed');assert.equal(final.participants.find(p=>p.id===own.id).placement,1)
 await rpc('set_cli_duel_review',[match,true]);await user(1);const review=await rpc('get_cli_duel_review',[own.id]);assert.equal(review.criteria[0].expected,'Campus-SW1');assert.equal(review.criteria[0].met,true)
 await db.exec('reset role');const gradeBefore=(await db.query("select pg_get_functiondef('public.cli_duel_grade(jsonb,jsonb)'::regprocedure) def")).rows[0].def
 await db.exec(`create or replace function public.cli_duel_grade(p_definition jsonb,p_state jsonb) returns jsonb language sql immutable security definer set search_path=pg_catalog as $$ select '{"scorePoints":0,"maximumPoints":20,"criteria":[]}'::jsonb $$`)
 await user(1);assert.equal((await rpc('get_cli_duel_review',[own.id])).criteria[0].met,true)
 await db.exec('reset role');await db.exec(gradeBefore)
 await user(2);await assert.rejects(()=>rpc('get_cli_duel_review',[own.id]),/unavailable/)
 await user(3);await rpc('set_cli_duel_review',[match,false]);await user(1);await assert.rejects(()=>rpc('get_cli_duel_review',[own.id]),/withdrawn/)
 await service();const rematchContext=await rpc('cli_duel_authoring_context',[id(3),null,match]);const nextPayload={...payload,labId:undefined,rematchId:match,title:'Timeout rematch',durationMinutes:1}
 const rematch=await rpc('cli_duel_create',[id(3),nextPayload,rematchContext.fingerprint,initial]);assert.notEqual(rematch,match)
 await user(1);await rpc('ready_cli_duel',[rematch,client,true]);await user(2);await rpc('ready_cli_duel',[rematch,client,true]);await user(3);await rpc('start_cli_duel',[rematch])
 await db.exec('reset role');const deadline=new Date(Date.now()-60000).toISOString();await db.query("update public.cli_competitions set starts_at=$2::timestamptz-interval '1 minute',deadline=$2 where id=$1",[rematch,deadline])
 await user(1);const timed=await rpc('settle_cli_duel',[rematch]);assert.equal(timed.competition.status,'completed');assert.deepEqual(timed.participants.map(p=>p.placement),[1,1]);assert.ok(timed.participants.every(p=>p.status==='expired'))
 assert.ok(timed.participants.every(p=>new Date(p.finishedAt).getTime()===new Date(deadline).getTime()))
 const timedOwn=timed.participants.find(p=>p.isOwn);await service();await assert.rejects(()=>rpc('cli_duel_command_context',[id(1),timedOwn.id,client,id(2000),1,0,'enable']),/closed/)
 await user(4);await assert.rejects(()=>rpc('get_cli_duel',[match]));await user(5);assert.equal((await rpc('get_cli_duel',[match])).competition.canHost,true)
 await user(3);await rpc('manage_cli_duel',[match,'void','Classroom test void']);assert.equal((await rpc('get_cli_duel',[match])).competition.status,'voided')
 await db.exec('reset role');await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[id(1)]);await user(1);await assert.rejects(()=>rpc('get_cli_duel',[match]))
 await db.exec('reset role');await db.query('update auth.users set banned_until=null where id=$1',[id(1)]);await db.query('update public.class_sections set created_by=$2 where id=$1',[id(30),id(4)])
 await user(3);await assert.rejects(()=>rpc('get_cli_duel',[match]));await user(5);assert.equal((await rpc('get_cli_duel',[match])).competition.status,'voided')
 for(const signature of ['cli_duel_command_context(uuid,uuid,text,uuid,bigint,bigint,text)','cli_duel_commit_command(uuid,uuid,text,uuid,bigint,bigint,text,jsonb)','cli_duel_create(uuid,jsonb,text,jsonb)']){await db.exec('reset role');const allowed=(await db.query("select has_function_privilege('authenticated',$1,'execute') allowed",[`public.${signature}`])).rows[0].allowed;assert.equal(allowed,false)}
 // Cancelled matches retain their history and never open a ranked command path.
 await service();const cancelContext=await rpc('cli_duel_authoring_context',[id(5),null,rematch]);const cancelled=await rpc('cli_duel_create',[id(5),{...nextPayload,title:'Cancelled lobby',participantSelections:[{studentId:id(1),classId:null},{studentId:id(2),classId:null}]},cancelContext.fingerprint,initial])
 await user(5);await rpc('manage_cli_duel',[cancelled,'cancel','Local cancellation test']);const cancelledResult=await rpc('get_cli_duel',[cancelled]);assert.equal(cancelledResult.competition.status,'cancelled');assert.equal(cancelledResult.participants.length,2)

 if(process.env.DUEL_KNOCKOUT_TEST) {
  await db.exec('reset role');assert.deepEqual(await rpc('cli_duel_default_damage',[[{points:1},{points:1},{points:4}],100]),defaultDuelDamage([{points:1},{points:1},{points:4}],100))
  await service();const authoring=await rpc('cli_duel_authoring_context',[id(5),id(100),null])
  const custom={instructions:'Set hostname Custom and save.',deviceLabel:'Duel switch',initialHostname:'Begin',criteria:[{type:'hostname',expected:'Custom',target:'',points:10,deviceId:'d1'},{type:'config_saved',expected:'',target:'',points:10,deviceId:'d1'}]}
  const combat={startingHp:100,damage:[40,60]},prepared=prepareDuelDefinition(authoring.definition,custom,combat),fresh=createDuelInitialState(prepared)
  const createPayload={...payload,rulesVersion:2,customization:custom,combat,participantSelections:[{studentId:id(1),classId:null},{studentId:id(2),classId:null}]}
  const freeCustom={...custom,initialHostname:'Custom'};await assert.rejects(()=>rpc('cli_duel_create',[id(5),{...createPayload,customization:freeCustom},authoring.fingerprint,createDuelInitialState(prepareDuelDefinition(authoring.definition,freeCustom,combat))]),/already completed/)
  const duel=await rpc('cli_duel_create',[id(5),createPayload,authoring.fingerprint,fresh])
  await user(1);await rpc('ready_cli_duel',[duel,client,true]);await user(2);await rpc('ready_cli_duel',[duel,client+'2',true]);await user(5);await rpc('start_cli_duel',[duel])
  await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second',deadline=clock_timestamp()+interval '4 minutes',status='active' where id=$1",[duel])
  await user(1);const before=await rpc('get_cli_duel',[duel]);assert.equal(before.competition.rulesVersion,2);assert.equal(before.competition.startingHp,100)
  const player=before.participants.find(p=>p.isOwn),enemy=before.participants.find(p=>!p.isOwn)
  let commandState=fresh,seq=0,lastArgs
  const act=async(command)=>{const out=executeDuelCommand(prepared,commandState,command);await service();lastArgs=[id(1),player.id,client,id(3000+seq),seq+1,seq,command,out];const response=await rpc('cli_duel_commit_command',lastArgs);commandState=out.state;seq++;return response}
  await act('enable');await act('conf t');let attack=await act('hostname Custom');assert.equal(attack.opponentSummary.hp,60)
  attack=await act('hostname Other');assert.equal(attack.ownParticipant.scorePoints,0);assert.equal(attack.opponentSummary.hp,60)
  attack=await act('hostname Custom');assert.equal(attack.opponentSummary.hp,60)
  await act('end');attack=await act('wr');assert.equal(attack.competition.status,'completed');assert.equal(attack.competition.endReason,'knockout');assert.equal(attack.competition.winnerParticipantId,player.id);assert.equal(attack.opponentSummary.hp,0)
  assert.equal(attack.ownParticipant.placement,1);assert.equal(attack.opponentSummary.placement,2);assert.equal(attack.ownState,null)
  await service();assert.equal((await rpc('cli_duel_commit_command',lastArgs)).duplicate,true)
  await assert.rejects(()=>rpc('cli_duel_command_context',[id(2),enemy.id,client+'2',id(3999),1,0,'enable']),/closed/)
  await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from public.active_assessment_sessions where assessment_type='competition' and assessment_id=$1",[duel])).rows[0].n,0)
  assert.equal((await db.query("select grading_criteria->0->>'expected' expected from public.cli_labs where id=$1",[id(100)])).rows[0].expected,'Campus-SW1')
  await user(1);await assert.rejects(()=>rpc('get_cli_duel_authoring',[id(100),null]))
  await user(5);const owned=await rpc('get_cli_duel_authoring',[id(100),null]);assert.equal(owned.definition.criteria[0].expected,'Campus-SW1')
  await rpc('manage_cli_duel',[duel,'void','Local knockout void']);const voided=await rpc('get_cli_duel',[duel]);assert.equal(voided.competition.endReason,'voided');assert.equal(voided.competition.winnerParticipantId,null)
  const voidEvidence=await rpc('get_cli_duel_review',[player.id]);assert.equal(voidEvidence.criteria[0].damage,40);assert.equal(voidEvidence.endReason,'voided');assert.ok(voidEvidence.timeline.some(event=>event.kind==='knockout'))
  await service();const manual=await rpc('cli_duel_create',[id(5),createPayload,authoring.fingerprint,fresh]);await user(1);await rpc('ready_cli_duel',[manual,client,true]);await user(2);await rpc('ready_cli_duel',[manual,client+'2',true]);await user(5);await rpc('start_cli_duel',[manual])
  await db.exec('reset role');await db.query("update public.cli_competition_participants set status='submitted',finished_at=clock_timestamp()-interval '2 seconds' where competition_id=$1",[manual]);await db.query("update public.cli_competitions set status='active',starts_at=clock_timestamp()-interval '1 minute',deadline=clock_timestamp()-interval '1 second' where id=$1",[manual]);await db.query('delete from public.active_assessment_sessions where assessment_id=$1',[manual])
  await user(1);const manualResult=await rpc('settle_cli_duel',[manual]);assert.equal(manualResult.competition.endReason,'both_finished')
  console.log('PASS v2 custom frozen challenge, irreversible once-only hits, immediate bilateral knockout/leases/rank, duplicate replay, authoring scope and unchanged academic source.')
 }

 if(process.env.DUEL_FULL_TEST){
  await service();const fullContext=await rpc('cli_duel_configuration_context',[id(5),null,null])
  const config={courseId:1,moduleId:null,title:'Full duel',description:'',instructions:'Configure OSPF and the PC.',durationMinutes:5,devices:[{id:'r1',label:'Router',hostname:'Router',type:'router'},{id:'pc1',label:'PC',hostname:'PC1',type:'pc'}],topology:{links:[{id:'link',fromDeviceId:'r1',fromInterface:'GigabitEthernet0/0',toDeviceId:'pc1',toInterface:'Ethernet0'}]},criteria:[{type:'ospf_process',deviceId:'r1',target:'1',expected:'',points:10},{type:'interface_ip',deviceId:'pc1',target:'Ethernet0',expected:'10.0.0.2 255.255.255.0',points:10}]}
  const combat={startingHp:100,damage:[50,50]},full=prepareFullDuelDefinition(config,combat),initial=createFullDuelInitialState(full)
  await db.exec('reset role')
  const definitionCheck=async criteria=>{const d={...config,criteria};return db.query('select public.cli_duel_full_definition($1::jsonb,$2::jsonb,null)',[JSON.stringify(d),JSON.stringify({startingHp:100,damage:criteria.map(()=>100)})])}
  await definitionCheck([{type:'ospf_network',deviceId:'r1',target:'1',expected:'10.0.0.0 0.0.0.255 area 0',points:10},{type:'ospf_network',deviceId:'r1',target:'1',expected:'10.0.1.0 0.0.0.255 area 0',points:10}])
  for(const criteria of [[{type:'interface_ip',deviceId:'r1',target:'g0/0',expected:'bad-ip bad-mask',points:10}],[{type:'line_password',deviceId:'r1',target:'console',expected:'secret',points:10},{type:'line_password',deviceId:'r1',target:'console 0',expected:'secret',points:10}],[{type:'acl_entry',deviceId:'r1',target:'10',expected:'permit any',points:10},{type:'acl_entry',deviceId:'r1',target:'10',expected:'PERMIT ANY',points:10}]])await assert.rejects(()=>definitionCheck(criteria))
  await service()

  const payload3={action:'create',rulesVersion:3,title:config.title,durationMinutes:5,configuration:config,combat,participantSelections:[{studentId:id(1),classId:null},{studentId:id(2),classId:null}],allowReview:false}
  const match3=await rpc('cli_duel_create',[id(5),payload3,fullContext.fingerprint,initial]);await user(1);await rpc('ready_cli_duel',[match3,client,true]);await user(2);await rpc('ready_cli_duel',[match3,client+'2',true]);await user(5);await rpc('start_cli_duel',[match3]);await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second',deadline=clock_timestamp()+interval '4 minutes',status='active' where id=$1",[match3])
  await user(1);const public3=await rpc('get_cli_duel',[match3]);assert.equal(public3.competition.rulesVersion,3);const own3=public3.participants.find(p=>p.isOwn)
  let state3=initial,seq3=0,last3
  async function operation(deviceId,op){const request={action:'operation',participantId:own3.id,clientId:client,commandId:id(5000+seq3),sequence:seq3+1,expectedRevision:seq3,deviceId,operation:op};const outcome=executeFullDuelOperation(full,state3,request);await service();const result=await rpc('cli_duel_commit_operation',[id(1),request,outcome]);state3=outcome.state;seq3++;last3=request;return result}
  for(const command of ['enable','conf t','router ospf 1'])await operation('r1',{type:'command',command})
  await user(1);assert.equal((await rpc('get_cli_duel',[match3])).participants.find(p=>!p.isOwn).hp,50)
  const lethal3=await operation('pc1',{type:'pc_configure',settings:{ipAddress:'10.0.0.2',subnetMask:'255.255.255.0',defaultGateway:'10.0.0.1',preferredDns:'',alternateDns:''}});assert.equal(lethal3.competition.endReason,'knockout');assert.equal(lethal3.opponentSummary.hp,0)
  await service();assert.equal((await rpc('cli_duel_commit_operation',[id(1),last3,{}])).duplicate,true);await assert.rejects(()=>rpc('cli_duel_operation_context',[id(1),{...last3,deviceId:'r1'}]),/different|changed|PC settings/)
  await assert.rejects(()=>rpc('cli_duel_operation_context',[id(1),{...last3,operation:{...last3.operation,settings:{...last3.operation.settings,ipAddress:'10.0.0.3'}}}]),/different|changed/)
  await db.exec('reset role');assert.equal((await db.query('select device_id from public.cli_competition_commands where participant_id=$1 order by sequence desc limit 1',[own3.id])).rows[0].device_id,'pc1')
  await user(1);await assert.rejects(()=>rpc('get_cli_duel_configuration',[null,null]));await user(5);assert.ok((await rpc('get_cli_duel_configuration',[null,null])).definition)
  if(process.env.DUEL_PROMPT_TEST){await db.exec('reset role');assert.equal((await db.query('select prompt_before from public.cli_competition_commands where participant_id=$1 order by sequence limit 1',[own3.id])).rows[0].prompt_before,'Router>');await user(5);assert.equal((await rpc('get_cli_duel_review',[own3.id])).commands[0].promptBefore,'Router>')}
  console.log('PASS full v3 blank creation, advanced router/PC grading, non-primary lethal hit, per-device command metadata, changed-device retry rejection and authoring scope.')
 }
 if(process.env.DUEL_ARENA_TEST){
  await db.exec('reset role');await db.exec(await file('078_cli_duel_arena_entry.sql'));await db.exec(await file('078_cli_duel_arena_entry.sql'))
  const configuration={title:'Arena admission',description:'',instructions:'Set hostname Battle.',durationMinutes:5,devices:[{id:'d1',label:'Switch',hostname:'Switch',type:'switch'}],topology:{links:[]},criteria:[{type:'hostname',deviceId:'d1',target:'',expected:'Battle',points:10}]}
  const combat={startingHp:100,damage:[100]},prepared=prepareFullDuelDefinition(configuration,combat)
  await service();const ctx=await rpc('cli_duel_configuration_context',[id(5),null,null]);const match=await rpc('cli_duel_create',[id(5),{action:'create',rulesVersion:3,title:configuration.title,durationMinutes:5,configuration,combat,participantSelections:[{studentId:id(1),classId:null},{studentId:id(2),classId:null}],allowReview:false},ctx.fingerprint,createFullDuelInitialState(prepared)])
  await user(1);await rpc('ready_cli_duel',[match,client,true]);await user(2);await rpc('ready_cli_duel',[match,client+'2',true]);await user(5);const waiting=await rpc('start_cli_duel',[match]);assert.equal(waiting.competition.status,'waiting');assert.equal(waiting.competition.startsAt,null);assert.equal(waiting.competition.deadline,null)
  const first=waiting.participants.find(p=>p.displayName==='Person 1').id,second=waiting.participants.find(p=>p.displayName==='Person 2').id
  await user(1);await assert.rejects(()=>rpc('set_cli_duel_arena_presence',[second,client,true]));await assert.rejects(()=>rpc('set_cli_duel_arena_presence',[first,'wrong-client-123456789',true]))
  await rpc('set_cli_duel_arena_presence',[first,client,true]);assert.equal((await rpc('get_cli_duel',[match])).competition.status,'waiting');await assert.rejects(()=>rpc('finish_cli_duel',[first,client]))
  await service();await assert.rejects(()=>rpc('cli_duel_command_context',[id(1),first,client,id(9001),1,0,'enable']))
  await user(2);const countdown=await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);assert.equal(countdown.competition.status,'countdown');assert.ok(new Date(countdown.competition.startsAt)-new Date(countdown.serverNow)>4500);assert.equal(new Date(countdown.competition.deadline)-new Date(countdown.competition.startsAt),300000)
  await user(1);await rpc('set_cli_duel_arena_presence',[first,client,false]);assert.equal((await rpc('get_cli_duel',[match])).competition.status,'waiting');await rpc('set_cli_duel_arena_presence',[first,client,true]);assert.equal((await rpc('get_cli_duel',[match])).competition.status,'countdown')
  await db.exec('reset role');await db.query("update public.cli_competition_participants set arena_seen_at=clock_timestamp()-interval '15 seconds' where id=$1",[first]);await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second' where id=$1",[match]);await user(2);assert.equal((await rpc('settle_cli_duel',[match])).competition.status,'waiting')
  await user(1);await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second' where id=$1",[match]);const boundaryDeadline=(await db.query('select deadline from public.cli_competitions where id=$1',[match])).rows[0].deadline;await user(1);const boundary=await rpc('set_cli_duel_arena_presence',[first,client,false]);assert.equal(boundary.competition.status,'active');assert.equal(new Date(boundary.competition.deadline).getTime(),new Date(boundaryDeadline).getTime())
  const before=(await rpc('get_cli_duel',[match])).competition.deadline;await rpc('set_cli_duel_arena_presence',[first,client,false]);await rpc('set_cli_duel_arena_presence',[first,client,true]);assert.equal((await rpc('get_cli_duel',[match])).competition.deadline,before)
  await user(5);await rpc('manage_cli_duel',[match,'cancel','Local admission test complete'])
  console.log('PASS course-free creation, both-player arena gate, five-second countdown, early-input/finish denial, leaving/stale reset, active reload deadline and authorization.')
 }
 if(process.env.DUEL_HOST_TEST){
  await db.exec('reset role');await db.exec(await file('080_cli_duel_host_arena.sql'));await db.exec(await file('080_cli_duel_host_arena.sql'))
  const configuration={title:'Host-controlled duel',description:'A fair classroom battle.',instructions:'Set hostname Campus and save.',durationMinutes:5,devices:[{id:'d1',label:'Switch',hostname:'Switch',type:'switch'}],topology:{links:[]},criteria:[{type:'hostname',deviceId:'d1',target:'',expected:'Campus',points:10},{type:'config_saved',deviceId:'d1',target:'',expected:'',points:10}]},combat={startingHp:100,damage:[50,50]};const definition=prepareFullDuelDefinition(configuration,combat)
  await service();const ctx=await rpc('cli_duel_configuration_context',[id(5),null,null]);const match=await rpc('cli_duel_create',[id(5),{action:'create',rulesVersion:3,title:configuration.title,durationMinutes:5,configuration,combat,participantSelections:[{studentId:id(1),classId:null},{studentId:id(2),classId:null}],allowReview:true},ctx.fingerprint,createFullDuelInitialState(definition)])
  await user(5);let host=await rpc('get_cli_duel',[match]);assert.equal(host.competition.status,'waiting');assert.equal(host.competition.hostControlled,true)
  const first=host.participants.find(p=>p.displayName==='Person 1').id,second=host.participants.find(p=>p.displayName==='Person 2').id
  await assert.rejects(()=>rpc('control_cli_duel',[match,'start']));assert.equal((await rpc('get_cli_duel_host_arena',[match])).players.length,2)
  await user(4);await assert.rejects(()=>rpc('get_cli_duel_host_arena',[match]));await user(1);await assert.rejects(()=>rpc('get_cli_duel_host_arena',[match]));await assert.rejects(()=>rpc('control_cli_duel',[match,'start']))
  await rpc('enter_cli_duel_arena',[first,client]);await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);await rpc('enter_cli_duel_arena',[second,client+'2']);await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);assert.equal((await rpc('get_cli_duel',[match])).competition.status,'waiting')
  await user(5);let game=await rpc('control_cli_duel',[match,'start']);assert.equal(game.competition.status,'countdown');assert.ok(new Date(game.competition.startsAt)-new Date(game.serverNow)>4500)
  await user(1);await rpc('set_cli_duel_arena_presence',[first,client,false]);assert.equal((await rpc('get_cli_duel',[match])).competition.status,'waiting');await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(5);await rpc('control_cli_duel',[match,'start'])
  await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second' where id=$1",[match]);await db.query("update public.cli_competition_participants set arena_seen_at=clock_timestamp()-interval '2 seconds' where competition_id=$1",[match]);await user(5);assert.equal((await rpc('settle_cli_duel',[match])).competition.status,'countdown')
  await user(1);await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);game=await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);assert.equal(game.competition.status,'active')
  await user(5);game=await rpc('control_cli_duel',[match,'pause']);assert.equal(game.competition.status,'paused');const remaining=game.competition.remainingMs;assert.ok(remaining>290000);assert.equal(game.competition.deadline,null)
  await user(1);await assert.rejects(()=>rpc('finish_cli_duel',[first,client]));await service();await assert.rejects(()=>rpc('cli_duel_command_context',[id(1),first,client,id(9500),1,0,'enable']))
  await user(5);assert.equal((await rpc('get_cli_duel_host_arena',[match])).competition.remainingMs,remaining);assert.equal((await rpc('get_cli_duel',[match])).competition.status,'paused')
  await user(1);await rpc('set_cli_duel_arena_presence',[first,client,false]);await user(5);await assert.rejects(()=>rpc('control_cli_duel',[match,'resume']));await user(1);await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);await user(5);game=await rpc('control_cli_duel',[match,'resume']);assert.equal(game.competition.status,'countdown');assert.equal(game.competition.remainingMs,remaining)
  await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second' where id=$1",[match]);await user(1);await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);game=await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);assert.equal(game.competition.status,'active');assert.ok(Math.abs(new Date(game.competition.deadline)-new Date(game.competition.startsAt)-remaining)<2)
  await user(5);host=await rpc('get_cli_duel_host_arena',[match]);assert.equal(host.players.length,2);assert.equal(host.task.description,configuration.description);assert.equal((await rpc('get_cli_duel',[match])).competition.status,'active')
  await user(1);await rpc('set_cli_duel_arena_presence',[first,client,false]);assert.equal((await rpc('get_cli_duel',[match])).competition.status,'active')
  await user(1);await rpc('finish_cli_duel',[first,client]);await rpc('set_cli_duel_arena_presence',[first,client,true]);assert.ok((await rpc('get_cli_duel_player',[first,client])).ownState);await assert.rejects(()=>rpc('enter_cli_duel_arena',[first,client]))
  await user(2);await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);await user(5);await rpc('control_cli_duel',[match,'pause']);await user(1);await rpc('set_cli_duel_arena_presence',[first,client+'spectator',true]);await user(5);assert.equal((await rpc('control_cli_duel',[match,'resume'])).competition.status,'countdown')
  await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second' where id=$1",[match]);await user(1);await rpc('set_cli_duel_arena_presence',[first,client+'spectator',true]);await user(2);assert.equal((await rpc('set_cli_duel_arena_presence',[second,client+'2',true])).competition.status,'active')
  await db.exec('reset role');await db.query('update public.cli_competition_participants set qualifying_class_id=$2 where id=$1',[second,id(30)]);await db.query('delete from public.class_memberships where class_id=$1 and student_id=$2',[id(30),id(2)]);await user(2);await assert.rejects(()=>rpc('enter_cli_duel_arena',[second,client+'2']),/eligible/);await db.exec('reset role');await db.query('insert into public.class_memberships values($1,$2)',[id(30),id(2)]);await db.query('update public.cli_competition_participants set qualifying_class_id=null where id=$1',[second])
  await user(5);await rpc('manage_cli_duel',[match,'cancel','Host-flow regression complete'])
  console.log('PASS direct invitations, host-only dual view/start, countdown departure+fresh final acknowledgements, pause/input lock, frozen time/resume and host-independent lifecycle.')
 }
 if(process.env.DUEL_CHARACTER_TEST){
  await db.exec('reset role');await db.exec(await file('081_cli_duel_characters.sql'));await db.exec(await file('081_cli_duel_characters.sql'))
  const configuration={title:'Character duel',description:'',instructions:'Set hostname Campus.',durationMinutes:5,devices:[{id:'d1',label:'Switch',hostname:'Switch',type:'switch'}],topology:{links:[]},criteria:[{deviceId:'d1',type:'hostname',target:'',expected:'Campus',points:10}]},combat={startingHp:100,damage:[100]},definition=prepareFullDuelDefinition(configuration,combat)
  await service();const ctx=await rpc('cli_duel_configuration_context',[id(5),null,null]);const match=await rpc('cli_duel_create',[id(5),{action:'create',rulesVersion:3,title:configuration.title,durationMinutes:5,configuration,combat,participantSelections:[{studentId:id(1),classId:null},{studentId:id(2),classId:null}],allowReview:true},ctx.fingerprint,createFullDuelInitialState(definition)])
  await user(5);let game=await rpc('get_cli_duel_host_arena',[match]);assert.equal(game.competition.characterSelectionRequired,true)
  const first=game.participants.find(p=>p.displayName==='Person 1').id,second=game.participants.find(p=>p.displayName==='Person 2').id
  await user(1);await rpc('enter_cli_duel_arena',[first,client]);await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);await rpc('enter_cli_duel_arena',[second,client+'2']);await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);await user(5);await assert.rejects(()=>rpc('control_cli_duel',[match,'start']),/character/i)
  await user(1);await assert.rejects(()=>rpc('select_cli_duel_character',[second,client,'asta']),/access/i);await assert.rejects(()=>rpc('select_cli_duel_character',[first,'wrong-browser-123456789','asta']));await assert.rejects(()=>rpc('select_cli_duel_character',[first,client,'unknown']),/character/i)
  await rpc('select_cli_duel_character',[first,client,'asta']);await rpc('select_cli_duel_character',[first,client,'son-goku']);await user(2);await rpc('select_cli_duel_character',[second,client+'2','son-goku']);await user(5);game=await rpc('control_cli_duel',[match,'start']);assert.ok(game.participants.every(p=>p.characterId==='son-goku'));assert.equal(game.competition.versusEndsAt,null)
  await user(1);await assert.rejects(()=>rpc('select_cli_duel_character',[first,client,'asta']),/locked/i);await assert.rejects(()=>rpc('finish_cli_duel',[first,client]))
  await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second' where id=$1",[match]);await user(1);await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);game=await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);assert.equal(game.competition.status,'countdown');assert.ok(new Date(game.competition.versusEndsAt)-new Date(game.serverNow)>1500);assert.equal(game.competition.deadline,null);assert.equal(game.competition.remainingMs,300000)
  await service();await assert.rejects(()=>rpc('cli_duel_command_context',[id(1),first,client,id(9800),1,0,'enable']));await user(1);await assert.rejects(()=>rpc('finish_cli_duel',[first,client]));await rpc('set_cli_duel_arena_presence',[first,client,false]);game=await rpc('get_cli_duel',[match]);assert.equal(game.competition.status,'waiting');assert.equal(game.competition.versusEndsAt,null);assert.ok(game.participants.every(p=>p.characterId==='son-goku'))
  await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);await user(5);await rpc('control_cli_duel',[match,'start']);await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second' where id=$1",[match]);await user(1);await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);await rpc('set_cli_duel_arena_presence',[second,client+'2',true])
  await db.exec('reset role');await db.query("update public.cli_competitions set versus_ends_at=clock_timestamp()-interval '1 second' where id=$1",[match]);await user(1);await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);game=await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);assert.equal(game.competition.status,'active');assert.equal(game.competition.hasStarted,true);assert.ok(Math.abs(new Date(game.competition.deadline)-new Date(game.competition.startsAt)-300000)<2)
  await user(1);await rpc('enter_cli_duel_arena',[first,client]);await assert.rejects(()=>rpc('select_cli_duel_character',[first,client,'asta']),/locked/i)
  await user(5);game=await rpc('control_cli_duel',[match,'pause']);const remaining=game.competition.remainingMs;await user(1);await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);await user(5);game=await rpc('control_cli_duel',[match,'resume']);assert.equal(game.competition.versusEndsAt,null)
  await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '1 second' where id=$1",[match]);await user(1);await rpc('set_cli_duel_arena_presence',[first,client,true]);await user(2);game=await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);assert.equal(game.competition.status,'active');assert.equal(game.competition.versusEndsAt,null);assert.ok(Math.abs(new Date(game.competition.deadline)-new Date(game.competition.startsAt)-remaining)<2)
  await user(5);await rpc('manage_cli_duel',[match,'cancel','Character contract complete']);const review=await rpc('get_cli_duel_review',[first]);assert.equal(review.characterId,'son-goku');game=await rpc('get_cli_duel',[match]);assert.ok(game.participants.every(p=>p.characterId==='son-goku'))
  await db.exec('reset role');assert.equal((await db.query("select has_function_privilege('anon','public.select_cli_duel_character(uuid,text,text)','EXECUTE') allowed")).rows[0].allowed,false)
  console.log('PASS character allowlist/owner/browser/lock, duplicate selection, persisted history, disconnect reset, two-second versus with locked input/full exam time, reload and resume without replay; migration081 twice.')
 }
 if(process.env.DUEL_POPUP_TEST){
  await db.exec('reset role');if(process.env.DUEL_APPLY_POPUP){await db.exec(await file('082_cli_duel_random_and_case_sensitive_grading.sql'));await db.exec(await file('082_cli_duel_random_and_case_sensitive_grading.sql'))}
  const cases=[['hostname',{hostname:'campus'},'Campus'],['domain_name',{domainName:'campus.local'},'Campus.local'],['vlan_name',{vlans:{10:{name:'students'}}},'Students'],['enable_secret',{enableSecret:'secret'},'Secret'],['banner_motd',{bannerMotd:'hello'},'Hello'],['interface_description',{interfaces:{'GigabitEthernet0/1':{description:'uplink'}}},'Uplink']]
  for(const [type,state,expected] of cases){const target=type==='vlan_name'?'10':type==='interface_description'?'g0/1':'';const criterion={type,deviceId:'d2',target,expected,points:10};assert.equal(await rpc('cli_criterion_is_met',[{deviceStates:{d1:{hostname:'Campus'},d2:state}},criterion]),false,`${type}: case mismatch must not earn credit`)}
  assert.equal(await rpc('cli_criterion_is_met',[{deviceStates:{d2:{hostname:'Campus'}}},{type:'hostname',deviceId:'d2',expected:'Campus'}]),true)
  assert.equal(await rpc('cli_criterion_is_met',[{domainName:'Campus.local'},{type:'domain_name',expected:'Campus.local'}]),true)
  assert.equal(await rpc('cli_criterion_is_met',[{vlans:{10:{name:'Students'}}},{type:'vlan_name',target:'10',expected:'Students'}]),true)
  assert.equal(await rpc('cli_criterion_is_met',[{interfaces:{'GigabitEthernet0/1':{switchportMode:'trunk'}}},{type:'interface_mode',target:'g0/1',expected:'TRUNK'}]),true,'IOS enums/interface aliases retain normalization')
  const configuration={title:'Random characters',description:'',instructions:'Set hostname Campus.',durationMinutes:5,devices:[{id:'d1',label:'Switch',hostname:'Switch',type:'switch'}],topology:{links:[]},criteria:[{deviceId:'d1',type:'hostname',target:'',expected:'Campus',points:10}]},combat={startingHp:100,damage:[100]},definition=prepareFullDuelDefinition(configuration,combat),allowed=['eren-yeager','asta','natsu-dragneel','ichigo-kurosaki','monkey-d-luffy','meliodas','uzumaki-naruto','son-goku','sung-jinwoo','izuku-midoriya','yuji-itadori','shinra-kusakabe','gon-freecss','ken-kaneki','saitama']
  await service();const ctx=await rpc('cli_duel_configuration_context',[id(5),null,null]);const match=await rpc('cli_duel_create',[id(5),{action:'create',rulesVersion:3,title:configuration.title,durationMinutes:5,configuration,combat,participantSelections:[{studentId:id(1),classId:null},{studentId:id(2),classId:null}],allowReview:true},ctx.fingerprint,createFullDuelInitialState(definition)])
  await user(5);let game=await rpc('get_cli_duel',[match]);const first=game.participants.find(p=>p.displayName==='Person 1').id,second=game.participants.find(p=>p.displayName==='Person 2').id
  await assert.rejects(()=>rpc('control_cli_duel',[match,'start']));assert.ok((await rpc('get_cli_duel',[match])).participants.every(p=>p.characterId===null),'Failed Start must not assign characters')
  await user(1);await rpc('enter_cli_duel_arena',[first,client]);await rpc('set_cli_duel_arena_presence',[first,client,true]);await assert.rejects(()=>rpc('select_cli_duel_character',[second,client,'random']));await assert.rejects(()=>rpc('select_cli_duel_character',[first,'wrong-browser-123456789','random']));game=await rpc('select_cli_duel_character',[first,client,'random']);assert.ok(allowed.includes(game.participants.find(p=>p.id===first).characterId));await rpc('select_cli_duel_character',[first,client,'asta'])
  await user(2);await rpc('enter_cli_duel_arena',[second,client+'2']);await rpc('set_cli_duel_arena_presence',[second,client+'2',true]);await user(5);game=await rpc('control_cli_duel',[match,'start']);assert.equal(game.competition.status,'countdown');assert.equal(game.participants.find(p=>p.id===first).characterId,'asta');const assigned=game.participants.find(p=>p.id===second).characterId;assert.ok(allowed.includes(assigned));assert.equal((await rpc('control_cli_duel',[match,'start'])).participants.find(p=>p.id===second).characterId,assigned)
  await user(2);await assert.rejects(()=>rpc('select_cli_duel_character',[second,client+'2','random']),/locked/i);await rpc('set_cli_duel_arena_presence',[second,client+'2',false]);await user(5);game=await rpc('get_cli_duel',[match]);assert.equal(game.competition.status,'waiting');assert.equal(game.participants.find(p=>p.id===second).characterId,assigned);await rpc('manage_cli_duel',[match,'cancel','Random/case contracts complete'])
  await service();const noPicks=await rpc('cli_duel_create',[id(5),{action:'create',rulesVersion:3,title:configuration.title,durationMinutes:5,configuration,combat,participantSelections:[{studentId:id(1),classId:null},{studentId:id(2),classId:null}],allowReview:true},ctx.fingerprint,createFullDuelInitialState(definition)])
  await user(5);const empty=await rpc('get_cli_duel',[noPicks]),emptyOne=empty.participants.find(p=>p.displayName==='Person 1').id,emptyTwo=empty.participants.find(p=>p.displayName==='Person 2').id
  await user(1);await rpc('enter_cli_duel_arena',[emptyOne,client]);await rpc('set_cli_duel_arena_presence',[emptyOne,client,true]);await user(2);await rpc('enter_cli_duel_arena',[emptyTwo,client+'2']);await rpc('set_cli_duel_arena_presence',[emptyTwo,client+'2',true]);await user(5);const bothRandom=await rpc('control_cli_duel',[noPicks,'start']);assert.equal(bothRandom.competition.status,'countdown');assert.equal(bothRandom.participants.filter(p=>allowed.includes(p.characterId)).length,2);await rpc('manage_cli_duel',[noPicks,'cancel','Both empty picks assigned'])
  await db.exec('reset role');assert.equal((await db.query("select has_function_privilege('anon','public.cli_duel_random_character()','EXECUTE') allowed")).rows[0].allowed,false)
  console.log('PASS082 twice: case-sensitive text/device grading, normalized IOS enums, own-browser random choice, atomic missing-only host assignment, repeat Start/abort preservation and private helper ACL.')
 }
 if(process.env.DUEL_PORTS_TEST){
  await db.exec('reset role');await db.exec(await file('083_cli_duel_port_status.sql'));await db.exec(await file('083_cli_duel_port_status.sql'))
  const definition={devices:[{id:'d1'},{id:'d2'}],criteria:[{type:'interface_enabled',deviceId:'d1',target:'g0/1',expected:'SECRET'},{type:'interface_ip',deviceId:'d1',target:'gi0/2',expected:'PRIVATE IP'},{type:'etherchannel_member',deviceId:'d2',target:'f0/3',expected:'PRIVATE GROUP'},{type:'hostname',deviceId:'d2',expected:'SECRET HOST'}],topology:{links:[{fromDeviceId:'d1',fromInterface:'g0/1',toDeviceId:'d2',toInterface:'g0/1'}]}}
  const safe=(await db.query('select public.cli_duel_public_task($1::jsonb) task',[JSON.stringify(definition)])).rows[0].task
  assert.equal(safe.criteria,undefined);assert.equal(safe.configuredPorts.length,4);assert.ok(safe.configuredPorts.every(port=>Object.keys(port).sort().join(',')==='deviceId,interface'));assert.ok(!JSON.stringify(safe).includes('SECRET'));assert.ok(!JSON.stringify(safe).includes('PRIVATE'))
  for(const name of ['cli_duel_player_data(uuid,uuid)','get_cli_duel_host_arena(uuid)'])assert.match((await db.query('select pg_get_functiondef($1::regprocedure) def',[`public.${name}`])).rows[0].def,/public.cli_duel_public_task\(c.definition_snapshot\)/)
  assert.equal((await db.query("select has_function_privilege('authenticated','public.cli_duel_public_task(jsonb)','EXECUTE') allowed")).rows[0].allowed,false)
  console.log('PASS083 twice: deduplicated configured ports, private answer values, protected reader integration and helper ACL.')
 }
 if(process.env.DUEL_INCREMENTAL_TEST){
  await db.exec('reset role');await db.exec(await file('084_cli_duel_incremental_grading.sql'));await db.exec(await file('084_cli_duel_incremental_grading.sql'))
  await db.exec('begin;update cli_duel_private.grading_settings set audit=true;'+await readFile(new URL('../tests/sql/cli-duel-incremental-grading.sql',import.meta.url),'utf8')+'rollback;')
  await db.exec('begin;update cli_duel_private.grading_settings set audit=false;'+await readFile(new URL('../tests/sql/cli-duel-incremental-grading.sql',import.meta.url),'utf8')+'rollback;')
  await db.exec('begin;update cli_duel_private.grading_settings set audit=true;'+await readFile(new URL('../tests/sql/cli-duel-incremental-matrix.sql',import.meta.url),'utf8')+'rollback;')
  await db.exec('begin;update cli_duel_private.grading_settings set audit=false;'+await readFile(new URL('../tests/sql/cli-duel-incremental-matrix.sql',import.meta.url),'utf8')+'rollback;')
  console.log('PASS084 twice: incremental/full parity in audit and normal modes, version/definition/state invalidation, private cache and lifecycle cleanup.')
 }
 if(process.env.DUEL_CONCURRENCY_TEST){
  await db.exec('reset role');await db.exec(await file('085_cli_duel_concurrency.sql'));await db.exec(await file('085_cli_duel_concurrency.sql'))
  await db.exec('begin;'+await readFile(new URL('../tests/sql/cli-duel-concurrency.sql',import.meta.url),'utf8')+'rollback;')
  const configuration={title:'Concurrent verified duel',description:'',instructions:'Set hostname Campus.',durationMinutes:5,devices:[{id:'d1',label:'Switch',hostname:'Switch',type:'switch'}],topology:{links:[]},criteria:[{deviceId:'d1',type:'hostname',target:'',expected:'Campus',points:10},{deviceId:'d1',type:'config_saved',target:'',expected:'',points:10}]},combat={startingHp:100,damage:[100,0]},definition=prepareFullDuelDefinition(configuration,combat)
  await service();const ctx=await rpc('cli_duel_configuration_context',[id(5),null,null]),match=await rpc('cli_duel_create',[id(5),{action:'create',rulesVersion:3,title:configuration.title,durationMinutes:5,configuration,combat,participantSelections:[{studentId:id(1),classId:null},{studentId:id(2),classId:null}],allowReview:false},ctx.fingerprint,createFullDuelInitialState(definition)])
  await user(5);let game=await rpc('get_cli_duel',[match]);const one=game.participants.find(p=>p.displayName==='Person 1').id,two=game.participants.find(p=>p.displayName==='Person 2').id
  for(const [n,p] of [[1,one],[2,two]]){await user(n);await rpc('enter_cli_duel_arena',[p,client]);await rpc('set_cli_duel_arena_presence',[p,client,true])}
  await user(5);await rpc('control_cli_duel',[match,'start']);await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '100 milliseconds' where id=$1",[match]);await db.query('update public.cli_competition_participants set arena_seen_at=clock_timestamp() where competition_id=$1',[match]);await rpc('cli_duel_settle',[match]);await db.query("update public.cli_competitions set versus_ends_at=clock_timestamp()-interval '100 milliseconds' where id=$1",[match]);await db.query('update public.cli_competition_participants set arena_seen_at=clock_timestamp() where competition_id=$1',[match]);await rpc('cli_duel_settle',[match])
  await user(5);await rpc('control_cli_duel',[match,'pause']);await service();const paused={action:'operation',participantId:one,clientId:client,commandId:id(920),sequence:1,expectedRevision:0,deviceId:'d1',operation:{type:'command',command:'enable'}}
  await assert.rejects(()=>rpc('cli_duel_operation_context',[id(1),paused]));await user(5);await rpc('control_cli_duel',[match,'resume']);await db.exec('reset role');await db.query("update public.cli_competitions set starts_at=clock_timestamp()-interval '100 milliseconds' where id=$1",[match]);await db.query('update public.cli_competition_participants set arena_seen_at=clock_timestamp() where competition_id=$1',[match]);await rpc('cli_duel_settle',[match])
  await db.exec("create schema if not exists realtime;create temp table duel_broadcast_probe(revision bigint);grant select on pg_temp.duel_broadcast_probe to service_role;create function realtime.send(p_payload jsonb,p_event text,p_topic text,p_private boolean) returns void language sql as $$ insert into pg_temp.duel_broadcast_probe values((p_payload->>'revision')::bigint) $$;")
  if(process.env.DUEL_BROADCAST_BASELINE)await loadFunction('074_cli_duel_pilot.sql','cli_duel_bump')
  let request,outcome,result;await service();for(const [index,command] of ['enable','conf t','hostname Campus'].entries()){
   request={...paused,commandId:id(921+index),sequence:index+1,expectedRevision:index,operation:{type:'command',command}};const context=await rpc('cli_duel_operation_context',[id(1),request]);outcome=executeFullDuelOperation(context.definition,context.state,request);result=await rpc('cli_duel_commit_operation_updates',[id(1),request,outcome]);assert.equal(result.revision,index+1);assert.equal(result.commandsAfter,index);if(index<2){assert.equal(result.ownCommands.length,1);assert.equal((await db.query('select count(*)::int n from pg_temp.duel_broadcast_probe')).rows[0].n,0,'Navigation must not broadcast unchanged public scores')}
  }
  assert.equal(result.competition.status,'completed');assert.equal(result.competition.winnerParticipantId,one);assert.equal(result.ownParticipant.scorePoints,10);assert.equal(result.participants.find(p=>p.id===two).hp,0)
  assert.ok((await db.query('select count(*)::int n from pg_temp.duel_broadcast_probe')).rows[0].n>0,'Score, HP and game completion must broadcast')
  assert.equal((await rpc('cli_duel_commit_operation_updates',[id(1),request,outcome])).duplicate,true);await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.cli_competition_objective_hits where participant_id=$1',[one])).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from cli_duel_private.grade_cache where participant_id in ($1,$2)',[one,two])).rows[0].n,0)
  console.log('PASS085 twice: incremental readers, compatibility, access, lighter presence and authoritative expiration.')
  console.log('PASS085 gameplay: pause/resume, real simulator outcomes, per-command deltas, strict scoring, KO, exact duplicate replay and cache cleanup.')
 }
 console.log('PASS atomic start, ordinary quiz/CLI session barriers and retained cancelled history.')
 console.log('PASS extended SQL: actual grading, undo/HP, dedup/stale rejection, browser lease, auto-completion, key/review isolation, release withdrawal, timeout exact ties, rematches, void and role/ban/ownership changes.')


}catch(error){console.error(error.message, error.where ?? '');process.exitCode=1}finally{await db.close()}
