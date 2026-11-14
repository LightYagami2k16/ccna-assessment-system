// In-memory PostgreSQL only. No application credentials, network, or Supabase.
// PGLITE_MODULE must point to a temporary @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to the temporary pglite/dist/index.js path.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const file = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
async function loadFunction(filename, name) {
  const source = await file(filename)
  const start = source.indexOf(`create or replace function public.${name}(`)
  assert.notEqual(start, -1, name)
  await db.exec(source.slice(start, source.indexOf('$$;', source.indexOf('as $$', start)) + 3))
}
async function user(n) { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']) }
async function rpc(name, args = []) {
  return (await db.query(`select public.${name}(${args.map((_,i) => `$${i+1}`).join(',')}) result`, args)).rows[0].result
}
const review = (type, n) => rpc('get_student_attempt_review', [type, n ? id(n) : null])
const access = () => rpc('get_student_attempt_review_access')
const policy = (type, n) => rpc('get_assessment_review_policy', [type, n ? id(n) : null])
const setPolicy = (type, n, value) => rpc('set_assessment_review_policy', [type, n ? id(n) : null, value])
const legacy = (type, n, client = 'client-1234567890') => rpc(`get_${type}_attempt_safe_v2`, [id(n), client])
const denied = (fn, pattern = /unavailable|access is required|valid assessment|cannot be managed|permission denied/) => assert.rejects(fn, pattern)

try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key,banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.profiles(id uuid primary key,role text);
    create table public.quizzes(id uuid primary key,created_by uuid,title text default 'Quiz',description text,
      instructions text,duration_minutes integer default 15,passing_score numeric default 70);
    create table public.cli_labs(id uuid primary key,created_by uuid,title text default 'CLI',description text,
      instructions text,device_type text default 'router',initial_hostname text default 'Router',passing_score numeric default 70,
      status text default 'published',devices jsonb default '[]',topology jsonb default '{"links":[]}');
    create table public.cli_lab_assignments(lab_id uuid,class_id uuid);
    create table public.class_memberships(class_id uuid,student_id uuid);
    create table public.class_sections(id uuid,is_active boolean default true);
    create table public.quiz_attempts(id uuid primary key,quiz_id uuid,student_id uuid,status text default 'in_progress',
      expires_at timestamptz default now()+interval '1 hour',started_at timestamptz default now(),submitted_at timestamptz,
      attempt_number integer default 1,score_points numeric default 7,maximum_points numeric default 10,
      percentage numeric default 70,passed boolean default true);
    create table public.cli_attempts(like public.quiz_attempts including all);
    alter table public.cli_attempts drop column quiz_id;
    alter table public.cli_attempts add lab_id uuid;
    alter table public.cli_attempts add session_state jsonb default '{}';
    alter table public.cli_attempts add criteria_snapshot jsonb default '[]';
    create table public.questions(id uuid primary key,question_type text,title text,question_text text);
    create table public.question_options(id uuid primary key,question_id uuid,option_text text,is_correct boolean,sort_order integer default 1);
    create table public.quiz_attempt_questions(id uuid primary key,attempt_id uuid,question_id uuid,points numeric,sort_order integer default 1);
    create table public.quiz_attempt_answers(attempt_question_id uuid,selected_option_id uuid,selected_option_ids uuid[],
      answer_text text,is_correct boolean,points_awarded numeric default 0);
    create table public.cli_commands(id bigint,attempt_id uuid,device_id text,sequence_number integer,command_text text,
      output_text text,accepted boolean,mode_before text,mode_after text);
    create table public.active_assessment_sessions(student_id uuid,assessment_type text,attempt_id uuid,
      expires_at timestamptz default now()+interval '1 hour',client_id text default 'client-1234567890',
      client_heartbeat_at timestamptz,updated_at timestamptz);
  `)
  await loadFunction('004_admin_role_compatibility.sql', 'get_current_user_role_text')
  for (const [filename, names] of [
    ['026_phase2_expanded_switch_configuration.sql', ['canonical_cli_line','canonical_cli_vlan_list']],
    ['031_phase2_acl_configuration.sql', ['canonical_cli_interface','canonical_cli_acl_id','cli_criterion_is_met']],
    ['036_phase3_multi_device_topology_foundation.sql', ['cli_criterion_device_state','get_cli_lab_topology_data']],
    ['045_identification_and_multiple_answer_questions.sql', ['normalize_identification_answer','grade_quiz_attempt_answers','reconcile_expired_assessment_attempts','get_quiz_attempt_safe','submit_quiz_attempt']],
    ['038_fix_cli_assignment_read_access.sql', ['can_view_cli_attempt','get_cli_attempt_safe']],
    ['047_assessment_client_session_leases.sql', ['validate_assessment_client_id','assert_assessment_client_session','get_quiz_attempt_safe_v2','get_cli_attempt_safe_v2']],
  ]) for (const name of names) await loadFunction(filename, name)
  // Apply actual latest grading amendments, including device-state routing.
  for (const filename of ['034_phase2_nat_pat_configuration.sql','035_phase2_dhcp_etherchannel_stp_ssh.sql',
    '036_phase3_multi_device_topology_foundation.sql','037_phase3_topology_connectivity_grading.sql',
    '053_phase3_routed_connectivity_and_traceroute.sql','055_phase3_pc_ipv4_ui_and_dns_grading.sql','056_phase3_multidevice_ssh_grading.sql']) {
    const source = await file(filename)
    const amendments = [...source.matchAll(/do \$\$[\s\S]*?\$\$;/gi)].filter(([sql]) => sql.includes("routine.proname = 'cli_criterion_is_met'"))
    assert.equal(amendments.length,1,filename)
    await db.exec(amendments[0][0])
  }
  await db.exec(`alter function public.get_quiz_attempt_safe_v2(uuid,text) security definer;
    alter function public.get_cli_attempt_safe_v2(uuid,text) security definer;
    revoke all on function public.get_quiz_attempt_safe(uuid),public.get_cli_attempt_safe(uuid),public.assert_assessment_client_session(text,uuid,text) from public,authenticated;
    grant execute on function public.get_quiz_attempt_safe_v2(uuid,text),public.get_cli_attempt_safe_v2(uuid,text) to authenticated;`)
  // Real historical permissive policies, underneath the new restrictive boundary.
  const quizPolicies = [...(await file('003_quiz_attempts_and_grading.sql')).matchAll(/create policy [\s\S]*?;/g)]
  for (const [sql] of quizPolicies) await db.exec(sql)
  const cliSource = await file('020_phase2_single_device_cli_practicals.sql')
  for (const [sql] of cliSource.matchAll(/create policy [\s\S]*?;/g)) {
    if (/on public\.(cli_attempts|cli_commands)\b/.test(sql)) await db.exec(sql)
  }
  // Match 038's current staff/command policies rather than superseded lab subqueries.
  await db.exec(`drop policy "Instructors view CLI attempts" on public.cli_attempts;
    create policy "Instructors view CLI attempts" on public.cli_attempts for select to authenticated using
      (public.get_current_user_role_text() in ('instructor','admin','administrator') and public.can_view_cli_attempt(id));
    drop policy "Users view relevant CLI commands" on public.cli_commands;
    create policy "Users view relevant CLI commands" on public.cli_commands for select to authenticated using(public.can_view_cli_attempt(attempt_id));`)
  for (const table of ['quiz_attempts','quiz_attempt_questions','quiz_attempt_answers','cli_attempts','cli_commands','questions','question_options','cli_labs']) {
    await db.exec(`alter table public.${table} enable row level security; grant select on public.${table} to authenticated;`)
  }
  // Even an existing broad published-content read policy must not expose keys.
  for (const table of ['questions','question_options','cli_labs']) await db.exec(`create policy historical_read on public.${table} for select to authenticated using(true)`)
  await db.exec(await file('070_student_attempt_review.sql'))
  // Reapplying must keep guards/triggers idempotent.
  await db.exec(await file('070_student_attempt_review.sql'))
  for (const [n,role] of [[1,'student'],[2,'student'],[3,'instructor'],[4,'instructor'],[5,'admin'],[6,'administrator'],[7,null],[8,'student'],[9,'student'],[11,'garbage'],[12,'instructor']]) {
    await db.query('insert into public.profiles values($1,$2)',[id(n),role])
    await db.query(`insert into auth.users values($1,case when $2 then now()+interval '1 day' when $3 then now()-interval '1 day' else null end)`,[id(n),[8,12].includes(n),n===9])
  }
  await db.query('insert into auth.users values($1,null)',[id(10)])
  await db.query('insert into public.quizzes(id,created_by) values($1,$2),($3,$4)',[id(100),id(3),id(101),id(4)])
  await db.query('insert into public.cli_labs(id,created_by) values($1,$2),($3,$4)',[id(200),id(3),id(201),id(4)])
  await db.query('insert into public.class_sections(id) values($1)',[id(700)])
  await db.query('insert into public.class_memberships values($1,$2)',[id(700),id(1)])
  await db.query('insert into public.cli_lab_assignments values($1,$2)',[id(200),id(700)])
  for (const [table,assessment,column,offset] of [['quiz_attempts',100,'quiz_id',1000],['cli_attempts',200,'lab_id',2000]]) {
    for (const [n,status,student] of [[0,'submitted',1],[1,'expired',1],[2,'in_progress',1],[3,'submitted',2],[4,'submitted',8],[5,'submitted',9]]) {
      await db.query(`insert into public.${table}(id,${column},student_id,status) values($1,$2,$3,$4)`,[id(offset+n),id(assessment),id(student),status])
    }
  }
  for (const [n,type] of [[0,'multiple_choice'],[1,'multiple_answer'],[2,'identification'],[3,'multiple_choice']]) {
    await db.query('insert into public.questions values($1,$2,$3,$4)',[id(300+n),type,`Question ${n}`,`Original wording ${n}`])
    for (const [j,text,correct] of [[0,'Router',true],[1,'Switch',n===1],[2,'Wrong',false]]) {
      await db.query('insert into public.question_options values($1,$2,$3,$4,$5)',[id(400+n*10+j),id(300+n),text,correct,j])
    }
    for (const [attempt,base] of [[1000,500],[1002,600]]) {
      await db.query('insert into public.quiz_attempt_questions values($1,$2,$3,2,$4,null)',[id(base+n),id(attempt),id(300+n),n])
      if (n!==3) await db.query('insert into public.quiz_attempt_answers values($1,$2,$3,$4,true,2)',
        [id(base+n),id(400+n*10),n===1?[id(410),id(411)]:[id(400+n*10)],n===2?'  ROUTER  ':null])
    }
  }
  const criteria = [{type:'hostname',expected:'R1',points:7,deviceId:'r1'},{type:'hostname',expected:'R2',points:3,deviceId:'r2'}]
  await db.query('update public.cli_attempts set criteria_snapshot=$1,session_state=$2',
    [JSON.stringify(criteria),JSON.stringify({deviceStates:{r1:{hostname:'R1'},r2:{hostname:'wrong'}}})])
  await db.query("insert into public.cli_commands values(1,$1,'r1',1,'hostname R1','ok',true,'config','config')",[id(2000)])
  for (const [type,n] of [['quiz',1002],['cli',2002],['quiz',1000],['cli',2000]]) await db.query(
    'insert into public.active_assessment_sessions(student_id,assessment_type,attempt_id) values($1,$2,$3)',[id(1),type,id(n)])
  await db.exec('set role authenticated')
  for (const n of [null,7,8,10,11]) {
    await user(n); await denied(access); await denied(()=>review('quiz',1000)); await denied(()=>policy('quiz',100))
  }
  await user(12); await denied(()=>policy('quiz',100)); await denied(()=>setPolicy('quiz',100,true))
  await user(1)
  assert.deepEqual(await access(),[])
  const topology = await rpc('get_cli_lab_topology_data',[[id(200)]])
  assert.equal(topology[0].id,id(200),'Actual active topology definer RPC survives restrictive lab policy')
  assert.equal(topology[0].devices[0].type,'router')
  for (const type of ['quiz','cli']) { await denied(()=>review(type,type==='quiz'?1000:2000)); await denied(()=>legacy(type,type==='quiz'?1000:2000)) }
  for (const table of ['quiz_attempt_questions','quiz_attempt_answers','cli_attempts','cli_commands','questions','question_options','cli_labs']) {
    assert.equal((await db.query(`select * from public.${table}`)).rows.length,0,`No raw student content from ${table}`)
  }
  assert.equal((await db.query('select * from public.quiz_attempts')).rows.length,3,'Existing own grade history retained')
  for (const type of ['quiz','cli']) {
    await denied(()=>legacy(type,type==='quiz'?1002:2002,'wrong-client-1234567890'),/no longer controls/)
    const live = await legacy(type,type==='quiz'?1002:2002)
    assert.equal(live.attempt.status,'in_progress')
    assert(!JSON.stringify(live).includes('isCorrect'))
    assert(!JSON.stringify(live).includes('criteria_snapshot'))
  }
  for (const [type,n] of [[null,100],['wrong',100],['quiz',null]]) {
    await user(3); await denied(()=>policy(type,n)); await denied(()=>setPolicy(type,n,true))
  }
  await user(3)
  assert.deepEqual(await policy('quiz',100),{allowReview:false})
  assert.deepEqual(await policy('cli',200),{allowReview:false})
  await denied(()=>setPolicy('quiz',100,null),/true or false/)
  await denied(()=>setPolicy('quiz',101,true)); await denied(()=>setPolicy('cli',201,true))
  await setPolicy('quiz',100,true); await setPolicy('cli',200,true)
  await user(1)
  assert.deepEqual(await access(),[{assessmentType:'cli',attemptId:id(2000)},{assessmentType:'cli',attemptId:id(2001)},
    {assessmentType:'quiz',attemptId:id(1000)},{assessmentType:'quiz',attemptId:id(1001)}])
  for (const [type,n] of [['quiz',1002],['cli',2002],['quiz',1003],['cli',2003],['quiz',9999],['quiz',null],[null,1000],['wrong',1000]]) await denied(()=>review(type,n))
  const old = await review('quiz',1000)
  assert.match(old.historicalContentNotice,/Original.*not saved/)
  assert.deepEqual(old.questions[1].selectedOptionIds,[id(410),id(411)])
  assert.deepEqual(old.questions[1].correctAnswers,['Router','Switch'])
  assert.equal(old.questions[2].answerText,'  ROUTER  ')
  assert.equal(old.questions[3].pointsAwarded,0)
  const cli = await review('cli',2000)
  assert.deepEqual(cli.criteria.map(c=>[c.deviceId,c.met,c.pointsAwarded]),[['r1',true,7],['r2',false,0]])
  assert.equal(cli.commands[0].command,'hostname R1'); assert.equal(cli.commands[0].deviceId,'r1')
  assert.equal(cli.state.deviceStates.r1.hostname,'R1')
  await user(2); assert.equal((await access()).length,2); await denied(()=>review('quiz',1000))
  await user(9); assert.equal((await access()).length,2,'Expired ban permits access')
  await user(8); await denied(access); await denied(()=>legacy('cli',2000),/no longer controls/)
  await user(3); assert((await db.query('select * from public.quiz_attempt_questions')).rows.length>0,'Existing instructor detail read survives')
  assert((await db.query('select * from public.cli_attempts')).rows.length>0,'Owning instructor CLI read survives')
  await user(4); assert.equal((await db.query('select * from public.cli_attempts')).rows.length,0,'Nonowner staff scope retained')
  for (const n of [5,6]) { await user(n); await setPolicy('quiz',101,true); await setPolicy('cli',201,true) }
  // Finalization creates immutable content without changing grading or player APIs.
  await db.exec('reset role'); await user(1)
  await rpc('submit_quiz_attempt',[id(1002)])
  const completion = await review('quiz',1002)
  assert.equal(completion.historicalContentNotice,undefined)
  assert.equal(completion.attempt.scorePoints,6,'Real grading runs before completion snapshot')
  assert.equal(completion.questions[3].pointsAwarded,0)
  await db.exec("update public.questions set question_text='Changed later'; update public.question_options set option_text='Changed answer',is_correct=false; update public.quiz_attempt_answers set answer_text='Changed submission',points_awarded=0;")
  assert.deepEqual(await review('quiz',1002),completion,'Completed content, selections and feedback survive later edits')
  assert.equal((await review('quiz',1000)).questions[0].questionText,'Changed later','Legacy fallback is explicitly current content')
  await db.exec('delete from public.class_memberships')
  assert.deepEqual(await review('quiz',1002),completion,'Former class membership does not prevent historical review')
  await db.query("update public.cli_attempts set expires_at=now()-interval '1 second' where id=$1",[id(2002)])
  await denied(()=>rpc('get_cli_attempt_safe',[id(2002)]))
  await db.query("update public.cli_attempts set expires_at=now()+interval '1 hour' where id=$1",[id(2002)])
  await db.exec('set role authenticated'); await user(3)
  await setPolicy('quiz',100,false); await setPolicy('cli',200,false)
  await user(1)
  assert.deepEqual(await access(),[],'Disabling revokes every historical review')
  for (const [type,n] of [['quiz',1000],['quiz',1002],['cli',2000]]) {
    await denied(()=>review(type,n)); await denied(()=>legacy(type,n))
  }
  assert.equal((await legacy('cli',2002)).attempt.status,'in_progress','Policy does not interrupt active player')
  await user(3); await setPolicy('quiz',100,true); await user(1)
  assert.deepEqual(await review('quiz',1002),completion,'Reenable restores immutable review')
  // Read-only execution, explicit ACLs, fixed search paths and no public helper keys.
  await db.exec('begin read only'); assert.deepEqual(await review('quiz',1002),completion); await db.exec('rollback')
  for (const signature of ['get_assessment_review_policy(text,uuid)','set_assessment_review_policy(text,uuid,boolean)',
    'get_student_attempt_review_access()','get_student_attempt_review(text,uuid)']) {
    const meta = (await db.query(`select has_function_privilege('anon',$1,'execute') anon,
      has_function_privilege('authenticated',$1,'execute') authenticated,prosecdef,proconfig
      from pg_proc where oid=$1::regprocedure`,[`public.${signature}`])).rows[0]
    assert.equal(meta.anon,false); assert.equal(meta.authenticated,true); assert.equal(meta.prosecdef,true)
    assert.deepEqual(meta.proconfig,['search_path=pg_catalog'])
  }
  await denied(()=>rpc('quiz_question_review_content',[id(500)]),/permission denied/)
  await denied(()=>rpc('get_quiz_attempt_safe',[id(1000)]),/permission denied/)
  await db.exec('set role anon'); await denied(access,/permission denied/)
  console.log('PASS: actual migration (twice), role/ban/input/owner/admin checks, default-off and revocation, own finalized access, preserved grade history, direct-table/key isolation, real legacy readers and client leases, active player preservation, immutable completion snapshots, labelled legacy fallback, multi-device CLI scoring/commands/state, staff scope, read-only review and ACL/search-path checks.')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally { await db.close() }
