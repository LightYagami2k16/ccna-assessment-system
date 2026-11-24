// Diagnostic only: real requests to the disposable loopback stack, no hosted credentials.
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'
import {createClient} from '@supabase/supabase-js'
import {chromium} from '@playwright/test'
import {handleDuelRequest} from '../supabase/functions/cli-duel/handler.js'
import {executeFullDuelOperation} from '../supabase/functions/_shared/cliDuelFullProtocol.js'
import {createDuelOperationQueue} from '../src/services/cliDuelOperationQueue.js'

const settings=JSON.parse((await readFile(join(tmpdir(),'ccna-latency-settings-private.json'),'utf8')).replace(/^\uFEFF/,''))
assert.equal(settings.API_URL,'http://127.0.0.1:55321','Loopback disposable backend required')
const options={auth:{persistSession:false,autoRefreshToken:false}}
const trusted=createClient(settings.API_URL,settings.SERVICE_ROLE_KEY,options)
const output=process.env.DUEL_LATENCY_OUTPUT||'test-results/cli-duel-latency-20261124',actors=[],matches=[],report={scope:'Isolated local Supabase and real browser; synthetic pregame timestamps, real command execution',sequential:[],stages:[],burst:[],browser:[],browserCriteria:Number(process.env.DUEL_BROWSER_CRITERIA)||2,burstCriteria:Number(process.env.DUEL_BROWSER_CRITERIA)||2}
const password=`Latency-${crypto.randomUUID()}!`,suffix=Date.now(),samples=Number(process.env.DUEL_LATENCY_SAMPLES)||24,browserSamples=Number(process.env.DUEL_BROWSER_SAMPLES)||12
function sql(text){const result=spawnSync('docker',['exec','-i','supabase_db_ccna-cli-duel-local-20261116','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',timeout:30000});if(result.status!==0)throw new Error(result.stderr);return result.stdout.trim()}
async function checked(promise){const {data,error}=await promise;if(error)throw new Error(error.message);return data}
const rpc=(actor,name,args={})=>checked(actor.api.rpc(name,args))
const action=(actor,body)=>checked(actor.api.functions.invoke('cli-duel',{body}))
const timed=async callback=>{const start=performance.now(),value=await callback();return {value,ms:performance.now()-start}}
function verifyLookup(actor){if(!process.env.DUEL_LOOKUP_VERIFY)return;assert.match(actor.pid,/^[a-f0-9-]{36}$/i);assert.equal(sql(`select (cache.grading=public.cli_duel_grade(c.definition_snapshot,p.state))::text from cli_duel_private.grade_cache cache join public.cli_competition_participants p on p.id=cache.participant_id join public.cli_competitions c on c.id=p.competition_id where p.id='${actor.pid}'`),'true','Cached/full grading parity failed')}
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)]
function stats(rows,key){const values=rows.map(row=>row[key]).filter(Number.isFinite);return {n:values.length,p50:percentile(values,.5),p95:percentile(values,.95),max:Math.max(...values)}}
function payload(actor,command){return {action:'operation',participantId:actor.pid,clientId:actor.client,commandId:crypto.randomUUID(),sequence:actor.revision+1,expectedRevision:actor.revision,deviceId:'d1',operation:{type:'command',command}}}
function adopt(actor,result){assert.ok(result.revision>actor.revision);actor.revision=result.revision;actor.score=result.ownParticipant.scorePoints;assert.equal(result.competition.status,'active');return result}
async function http(actor,body,verify=true){const start=performance.now(),response=await fetch(settings.API_URL+'/functions/v1/cli-duel',{method:'POST',headers:{apikey:settings.ANON_KEY,Authorization:'Bearer '+actor.session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)}),headersAt=performance.now(),text=await response.text(),bodyAt=performance.now(),result=JSON.parse(text),end=performance.now();assert.equal(response.status,200,result.error);if(verify)verifyLookup(actor);return {result,totalMs:end-start,headersMs:headersAt-start,bodyMs:bodyAt-headersAt,parseMs:end-bodyAt,bytes:Buffer.byteLength(text)}}
async function createMatch(host,one,two,count){
 const criteria=[{deviceId:'d1',type:'hostname',target:'',expected:'LatencyCampus',points:10}]
 for(let index=1;index<count-1;index++)criteria.push({deviceId:'d1',type:'interface_description',target:`g0/${index}`,expected:`Port${index}`,points:1})
 criteria.push({deviceId:'d1',type:'config_saved',target:'',expected:'',points:10})
 const configuration={title:`Latency diagnostic ${suffix} ${count}`,description:'Disposable latency fixture',instructions:'Set the hostname.',durationMinutes:60,devices:[{id:'d1',label:'Latency switch',hostname:'Switch',type:'switch'}],topology:{links:[]},criteria}
 const created=await action(host,{action:'create',rulesVersion:3,title:configuration.title,durationMinutes:60,configuration,combat:{startingHp:10000,damage:criteria.map((_,index)=>index===0?1:index===criteria.length-1?9999:0)},participantSelections:[{studentId:one.id,classId:host.classId},{studentId:two.id,classId:host.classId}],allowReview:false})
 assert.match(created.competitionId,/^[a-f0-9-]{36}$/i);matches.push(created.competitionId)
 const view=await rpc(host,'get_cli_duel_host_arena',{p_competition_id:created.competitionId})
 for(const actor of [one,two]){actor.pid=view.participants.find(p=>p.displayName===actor.name).id;actor.deviceId=crypto.randomUUID();actor.tabId=crypto.randomUUID();actor.client=`device:${actor.deviceId}:tab:${actor.tabId}`;actor.revision=0;actor.score=0;await rpc(actor,'enter_cli_duel_arena',{p_participant_id:actor.pid,p_client_id:actor.client});await rpc(actor,'set_cli_duel_arena_presence',{p_participant_id:actor.pid,p_client_id:actor.client,p_entered:true});await rpc(actor,'select_cli_duel_character',{p_participant_id:actor.pid,p_client_id:actor.client,p_character_id:actor===one?'asta':'saitama'})}
 await rpc(host,'control_cli_duel',{p_competition_id:created.competitionId,p_action:'start'})
 // Fixture setup only; neither countdown nor game duration is being benchmarked.
 sql(`begin;update public.cli_competitions set starts_at=clock_timestamp()-interval '100 milliseconds' where id='${created.competitionId}';update public.cli_competition_participants set arena_seen_at=clock_timestamp() where competition_id='${created.competitionId}';select public.cli_duel_settle('${created.competitionId}');update public.cli_competitions set versus_ends_at=clock_timestamp()-interval '100 milliseconds' where id='${created.competitionId}';update public.cli_competition_participants set arena_seen_at=clock_timestamp() where competition_id='${created.competitionId}';select public.cli_duel_settle('${created.competitionId}');commit;`)
 assert.equal((await rpc(host,'get_cli_duel',{p_competition_id:created.competitionId})).competition.status,'active')
 for(const command of ['enable','conf t'])adopt(one,(await http(one,payload(one,command))).result)
 return created.competitionId
}

let browser
await mkdir(output,{recursive:true})
try{
 assert.ok(Number.isInteger(samples)&&samples>0&&samples<=100);assert.ok(Number.isInteger(browserSamples)&&browserSamples>0&&browserSamples<=30);
 const academicBefore=sql("select (select count(*) from public.quiz_attempts)||','||(select count(*) from public.cli_attempts)")
 for(const [index,name,role] of [[0,'Latency Host','instructor'],[1,'Latency Player One','student'],[2,'Latency Player Two','student']]){
  const email=`latency-${suffix}-${index}@example.test`,{user}=await checked(trusted.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name}}))
  const actor={id:user.id,name,api:createClient(settings.API_URL,settings.ANON_KEY,options)};actors.push(actor);sql(`update public.profiles set role='${role}',full_name='${name}' where id='${actor.id}';`);actor.session=(await checked(actor.api.auth.signInWithPassword({email,password}))).session
 }
 const [host,one,two]=actors;host.classId=crypto.randomUUID();sql(`select set_config('request.jwt.claim.sub','${host.id}',false);insert into public.class_sections(id,name,code,created_by) values('${host.classId}','Latency diagnostic class','LATENCY-${suffix}','${host.id}');insert into public.class_memberships(class_id,student_id) values('${host.classId}','${one.id}'),('${host.classId}','${two.id}');`)
 for(const count of [2,128]){
  const match=await createMatch(host,one,two,count);console.log(`Measuring ${count}-criterion fixture with real local Edge requests…`)
  for(let index=0;index<samples;index++){const command=one.score?'hostname Other':'hostname LatencyCampus',row=await http(one,payload(one,command));adopt(one,row.result);assert.equal(one.score,command.endsWith('LatencyCampus')?10:0);const {result:_,...safe}=row;report.sequential.push({criteria:count,...safe})}
  for(let index=0;index<12;index++){
   const body=payload(one,one.score?'hostname Other':'hostname LatencyCampus'),row={criteria:count};let context
   const whole=await timed(()=>handleDuelRequest(new Request('http://localhost/functions/v1/cli-duel',{method:'POST',headers:{Authorization:'Bearer '+one.session.access_token},body:JSON.stringify(body)}),{
    authenticate:async token=>{const result=await timed(()=>one.api.auth.getUser(token));row.authMs=result.ms;assert.equal(result.value.error,null);return result.value.data.user.id},
    rpc:async(name,args)=>{const result=await timed(()=>checked(trusted.rpc(name,args)));row[name==='cli_duel_operation_context'?'contextMs':'commitMs']=result.ms;if(name==='cli_duel_operation_context')context=result.value;return result.value},
   }));assert.equal(whole.value.status,200);adopt(one,await whole.value.json());verifyLookup(one);row.handlerMs=whole.ms;row.otherMs=row.handlerMs-row.authMs-row.contextMs-row.commitMs
   const engine=[];for(let run=0;run<30;run++){const at=performance.now();executeFullDuelOperation(context.definition,context.state,body);engine.push(performance.now()-at)}row.simulatorMs=percentile(engine,.5);report.stages.push(row)
  }
  if(count===(Number(process.env.DUEL_BROWSER_CRITERIA)||2)){
   const lookup=new Map();let finish,fail;const completed=new Promise((resolve,reject)=>{finish=resolve;fail=reject});let armed=false
   const queue=createDuelOperationQueue({createRequest:(entry,revision)=>{const request={action:'operation',participantId:one.pid,clientId:one.client,commandId:crypto.randomUUID(),sequence:revision+1,expectedRevision:revision,deviceId:'d1',operation:entry.operation};lookup.set(request.commandId,entry.started);return request},send:async body=>{const queued=performance.now()-lookup.get(body.commandId),row=await http(one,body,false);report.burst.push({position:report.burst.length+1,queueWaitMs:queued,requestMs:row.totalMs,commandToScoreMs:performance.now()-lookup.get(body.commandId)});return row.result},onAccepted:result=>adopt(one,result),onChange:state=>{if(armed&&!state.entries.length&&!state.sending)finish()},onError:error=>fail(error.error),onDiscard:()=>fail(new Error('Unexpected burst discard'))})
   queue.update({revision:one.revision,allowed:true});const initialScore=one.score;for(let index=0;index<8;index++)queue.enqueue({deviceId:'d1',operation:{type:'command',command:(Boolean(initialScore)!==Boolean(index%2))?'hostname Other':'hostname LatencyCampus'},started:performance.now()});armed=true
   let timer;try{await Promise.race([completed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Burst timed out')),60000)})])}finally{clearTimeout(timer);queue.dispose()}
   verifyLookup(one)
   console.log('Measuring actual browser submit → verified score DOM update…');browser=await chromium.launch({timeout:90000});const page=await browser.newPage({viewport:{width:1366,height:900}})
   await page.addInitScript(({session,deviceId,tabId})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify(session));localStorage.setItem('ccna-assessment-device-id',deviceId);sessionStorage.setItem('ccna-assessment-tab-id',tabId);window.__latency=[];const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const url=typeof args[0]==='string'?args[0]:args[0]?.url;let row;if(url?.endsWith('/functions/v1/cli-duel')){row=window.__latency.at(-1);if(row)row.dispatchAt=performance.now()}const response=await originalFetch(...args);if(row){row.headersAt=performance.now();void response.clone().text().then(text=>{row.bodyAt=performance.now();row.bytes=new TextEncoder().encode(text).length})}return response};document.addEventListener('submit',event=>{const input=event.target.querySelector?.('[aria-label="Cisco command"]');if(!input||!input.value.startsWith('hostname '))return;window.__latency.push({start:performance.now(),expectedScore:input.value.endsWith('LatencyCampus')?10:0})},true);new MutationObserver(()=>{const row=window.__latency.at(-1);if(!row||row.domAt)return;const card=[...document.querySelectorAll('.duel-scoreboard>.duel-player')].find(card=>card.querySelector('h3')?.textContent.includes('Latency Player One'));const score=Number(card?.querySelector('p')?.textContent.match(/([\d.]+)\s*\//)?.[1]);if(score===row.expectedScore){row.domAt=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>{row.frameAt=performance.now()}))}}).observe(document,{subtree:true,childList:true,characterData:true})},{session:one.session,deviceId:one.deviceId,tabId:one.tabId})
   await page.goto(`http://127.0.0.1:5174/#/student/competition/${one.pid}`);const input=page.getByRole('textbox',{name:'Cisco command',exact:true});await input.waitFor({timeout:45000});await page.waitForFunction(()=>!document.querySelector('[aria-label="Cisco command"]').disabled)
   for(let index=0;index<browserSamples;index++){const expected=one.score?0:10;await input.fill(expected?'hostname LatencyCampus':'hostname Other');await input.press('Enter');await page.waitForFunction(n=>window.__latency.length===n&&Boolean(window.__latency.at(-1).frameAt)&&Boolean(window.__latency.at(-1).bodyAt),index+1,{timeout:30000});one.score=expected;verifyLookup(one)}
   const raw=await page.evaluate(()=>window.__latency);report.browser=raw.map(row=>({queueAndDispatchMs:row.dispatchAt-row.start,responseHeadersMs:row.headersAt-row.dispatchAt,bodyMs:row.bodyAt-row.headersAt,commandToDomMs:row.domAt-row.start,commandToFrameMs:row.frameAt-row.start,afterHeadersToDomMs:row.domAt-row.headersAt,bytes:row.bytes}));await page.screenshot({path:join(output,'measured-browser.png')});await browser.close();browser=null
  }
  await rpc(host,'manage_cli_duel',{p_competition_id:match,p_action:'cancel',p_reason:'Finished isolated latency diagnostic'})
 }
 assert.equal(sql("select (select count(*) from public.quiz_attempts)||','||(select count(*) from public.cli_attempts)"),academicBefore)
 report.summary={sequential:Object.fromEntries([2,128].map(count=>[count,{request:stats(report.sequential.filter(row=>row.criteria===count),'totalMs'),bytes:stats(report.sequential.filter(row=>row.criteria===count),'bytes')} ])),stages:Object.fromEntries([2,128].map(count=>[count,Object.fromEntries(['authMs','contextMs','commitMs','simulatorMs','otherMs','handlerMs'].map(key=>[key,stats(report.stages.filter(row=>row.criteria===count),key)]))])),burst:Object.fromEntries(['queueWaitMs','requestMs','commandToScoreMs'].map(key=>[key,stats(report.burst,key)])),browser:Object.fromEntries(['queueAndDispatchMs','responseHeadersMs','bodyMs','commandToDomMs','commandToFrameMs','afterHeadersToDomMs'].map(key=>[key,stats(report.browser,key)]))}
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary,null,2));console.log('Saved sanitized report; academic assessment counts unchanged.')
}finally{if(browser)await browser.close();if(actors[0])for(const match of matches){try{await rpc(actors[0],'manage_cli_duel',{p_competition_id:match,p_action:'cancel',p_reason:'Close isolated latency fixture'})}catch{/* Already closed. */}}}
