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
  await db.exec(`
    create type public.content_status as enum ('draft','published');
    create table public.courses(id bigint primary key);
    create table public.modules(id uuid primary key,course_id bigint);
    create table public.quiz_questions(quiz_id uuid,question_id uuid,sort_order integer);
    alter table public.questions add course_id bigint;
    alter table public.questions add module_id uuid;
    alter table public.questions add status public.content_status default 'published';
    alter table public.quizzes alter id set default gen_random_uuid();
    alter table public.quizzes add course_id bigint;
    alter table public.quizzes add module_id uuid;
    alter table public.quizzes add status public.content_status default 'draft';
    alter table public.quizzes add randomize_questions boolean;
    alter table public.quizzes add randomize_options boolean;
    alter table public.quizzes add max_attempts integer;
    alter table public.quizzes add show_results_immediately boolean;
    alter table public.quizzes add available_from timestamptz;
    alter table public.quizzes add available_until timestamptz;
    alter table public.quizzes add question_selection_mode text;
    alter table public.quizzes add random_question_count integer;
    alter table public.cli_labs alter id set default gen_random_uuid();
    alter table public.cli_labs add course_id bigint;
    alter table public.cli_labs add module_id uuid;
    alter table public.cli_labs add duration_minutes integer;
    alter table public.cli_labs add max_attempts integer;
    alter table public.cli_labs add grading_criteria jsonb;
    alter table public.cli_lab_assignments add assigned_by uuid;
    alter table public.class_sections add created_by uuid;
    insert into public.courses values(1);
  `)
  await loadFunction('045_identification_and_multiple_answer_questions.sql','question_is_ready')
  await loadFunction('045_identification_and_multiple_answer_questions.sql','save_instructor_quiz')
  await loadFunction('020_phase2_single_device_cli_practicals.sql','save_cli_lab')
  await loadFunction('054_phase3_pc_end_devices.sql','save_cli_lab_topology')
  await db.exec(await file('071_student_review_schedule.sql'))
  await db.exec(await file('071_student_review_schedule.sql'))
  for (const [n,role] of [[1,'student'],[2,'student'],[3,'instructor'],[4,'instructor'],[5,'admin'],[6,'administrator'],[7,null],[8,'instructor'],[9,'garbage']]) {
    await db.query('insert into public.profiles values($1,$2)',[id(n),role])
    await db.query("insert into auth.users values($1,case when $2 then now()+interval '1 day' else null end)",[id(n),n===8])
  }
  await db.query('insert into auth.users values($1,null)',[id(10)])
  await db.query('insert into public.quizzes(id,created_by) values($1,$2),($3,$4)',[id(100),id(3),id(101),id(4)])
  await db.query('insert into public.cli_labs(id,created_by) values($1,$2),($3,$4)',[id(200),id(3),id(201),id(4)])
  for (const [table,column,assessment,offset] of [['quiz_attempts','quiz_id',100,1000],['cli_attempts','lab_id',200,2000]]) {
    for (const [n,status,student] of [[0,'submitted',1],[1,'expired',1],[2,'in_progress',1],[3,'submitted',2]]) {
      await db.query(`insert into public.${table}(id,${column},student_id,status) values($1,$2,$3,$4)`,[id(offset+n),id(assessment),id(student),status])
      if (student===1) await db.query('insert into public.active_assessment_sessions(student_id,assessment_type,attempt_id) values($1,$2,$3)',[id(1),column==='quiz_id'?'quiz':'cli',id(offset+n)])
    }
  }
  const schedule = (type,n,allow,from=null,until=null) => rpc('set_assessment_review_schedule',[type,n?id(n):null,allow,from,until])
  const save = (type,payload) => rpc(type==='quiz'?'save_instructor_quiz_with_review':'save_cli_lab_with_review',[payload])
  const disabled = {allowReview:false,availableFrom:null,availableUntil:null}
  const immediate = {allowReview:true,availableFrom:null,availableUntil:null}
  const quizPayload = {courseId:1,title:'Created quiz',status:'draft',questionIds:[]}
  const cliPayload = {courseId:1,title:'Created practical',instructions:'Configure',status:'draft',classIds:[],
    criteria:[{type:'hostname',expected:'R1',points:10}],devices:[{id:'r1',hostname:'R1',type:'router'}],topology:{links:[]}}
  const stamp = async (sql) => (await db.query(`select (${sql})::text value`)).rows[0].value
  const past = await stamp("now()-interval '1 day'")
  const future = await stamp("now()+interval '1 day'")
  await db.exec('set role authenticated')
  for (const n of [null,1,7,8,9,10]) {
    await user(n)
    await denied(()=>schedule('quiz',100,true))
    await denied(()=>save('quiz',quizPayload)); await denied(()=>save('cli',cliPayload))
  }
  await user(3)
  for (const [type,n] of [[null,100],['wrong',100],['quiz',null]]) await denied(()=>schedule(type,n,true))
  await denied(()=>schedule('quiz',101,true)); await denied(()=>schedule('cli',201,true))
  await denied(()=>schedule('quiz',100,null),/true or false/)
  for (const [from,until] of [[null,future],[future,past],[future,future],['infinity',null]]) {
    await denied(()=>schedule('quiz',100,true,from,until),/closing must follow/)
  }
  assert.deepEqual(await policy('quiz',100),disabled)
  assert.deepEqual(await policy('cli',200),disabled)
  for (const [type,n,attempt] of [['quiz',100,1000],['cli',200,2000]]) {
    await user(3); await schedule(type,n,true,future,null)
    await user(1)
    assert(!(await access()).some(a=>a.assessmentType===type),'Future window hides flags')
    await denied(()=>review(type,attempt)); await denied(()=>legacy(type,attempt))
    assert.equal((await legacy(type,attempt+2)).attempt.status,'in_progress','Scheduled review does not interrupt player')
    await user(3); await schedule(type,n,true,past,future)
    await user(1); assert.equal((await review(type,attempt)).assessmentType,type)
    assert.equal((await access()).filter(a=>a.assessmentType===type).length,2,'Own finalized only, including expired')
    await denied(()=>review(type,attempt+3))
    // now() is transaction-stable: exact inclusive and exclusive boundaries without sleeps.
    await db.exec('begin'); await user(3)
    const boundary = await stamp('now()')
    await schedule(type,n,true,boundary,null)
    await user(1); assert.equal((await review(type,attempt)).assessmentType,type,'Opening equality is included')
    await user(3); await schedule(type,n,true,past,boundary)
    await user(1)
    await db.exec('savepoint closed_review')
    await denied(()=>review(type,attempt)); await db.exec('rollback to savepoint closed_review')
    await denied(()=>legacy(type,attempt)); await db.exec('rollback to savepoint closed_review')
    assert.equal((await access()).filter(a=>a.assessmentType===type).length,0,'Closing equality is excluded')
    await db.exec('commit')
    await user(3)
    assert.deepEqual(await setPolicy(type,n,true),immediate,'Old setter clears scheduling to immediate')
    await schedule(type,n,false,past,future)
    assert.deepEqual(await policy(type,n),disabled,'Disabled clears both dates')
  }
  // Real legacy content saves, not contract-only mocks; wrapper returns the created UUID.
  const createdQuiz = await save('quiz',{...quizPayload,reviewPolicy:immediate})
  const createdCli = await save('cli',{...cliPayload,reviewPolicy:{allowReview:true,availableFrom:past,availableUntil:future}})
  assert.match(createdQuiz,/^[0-9a-f-]{36}$/); assert.match(createdCli,/^[0-9a-f-]{36}$/)
  assert.deepEqual(await rpc('get_assessment_review_policy',['quiz',createdQuiz]),immediate)
  const initialCliPolicy = await rpc('get_assessment_review_policy',['cli',createdCli])
  assert.equal(initialCliPolicy.allowReview,true); assert(initialCliPolicy.availableFrom); assert(initialCliPolicy.availableUntil)
  assert.equal(await save('quiz',{...quizPayload,id:createdQuiz,title:'Edited quiz'}),createdQuiz)
  assert.deepEqual(await rpc('get_assessment_review_policy',['quiz',createdQuiz]),immediate,'Legacy payload preserves policy')
  assert.equal(await save('cli',{...cliPayload,id:createdCli,title:'Edited practical'}),createdCli)
  assert.deepEqual(await rpc('get_assessment_review_policy',['cli',createdCli]),initialCliPolicy)
  const defaultQuiz = await save('quiz',quizPayload)
  const defaultCli = await save('cli',cliPayload)
  for (const [type,n] of [['quiz',defaultQuiz],['cli',defaultCli]]) assert.deepEqual(await rpc('get_assessment_review_policy',[type,n]),disabled)
  const snapshots = async () => {
    await db.exec('reset role')
    const result = {}
    for (const table of ['quizzes','cli_labs','quiz_questions','cli_lab_assignments']) result[table] =
      (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') value from public.${table} t`.replace('order by id','order by to_jsonb(t)::text'))).rows[0].value
    await db.exec('set role authenticated'); return result
  }
  const before = await snapshots()
  for (const type of ['quiz','cli']) {
    const payload = type==='quiz'?{...quizPayload,id:createdQuiz}:{...cliPayload,id:createdCli}
    for (const reviewPolicy of [null,{}, {allowReview:null}, {allowReview:'true'}, {allowReview:true,availableFrom:123},
      {allowReview:true,availableUntil:future}, {allowReview:true,availableFrom:future,availableUntil:past},
      {allowReview:true,availableFrom:'bad-date'}]) await assert.rejects(()=>save(type,{...payload,title:'Must roll back',reviewPolicy}))
    await user(4); await denied(()=>save(type,{...payload,title:'Not owned',reviewPolicy:disabled})); await user(3)
  }
  await assert.rejects(()=>save('quiz',{...quizPayload,title:'Invalid published',status:'published',reviewPolicy:immediate}),/published manual quiz/)
  await assert.rejects(()=>save('cli',{...cliPayload,id:createdCli,title:'Rollback topology',devices:[],reviewPolicy:disabled}),/1 and 12 devices/)
  await assert.rejects(()=>save('cli',{...cliPayload,title:'Rollback new practical',devices:[],reviewPolicy:immediate}),/1 and 12 devices/)
  await assert.rejects(()=>save('cli',{...cliPayload,id:createdCli,topology:[],reviewPolicy:disabled}),/topology/)
  assert.deepEqual(await snapshots(),before,'Invalid policy, content, topology and foreign edits leave all content/assignment/policy rows intact')
  // Bans and null roles cannot exploit legacy save methods through new wrappers.
  for (const n of [7,8,9,10]) {
    await user(n); await denied(()=>save('quiz',{...quizPayload,id:createdQuiz})); await denied(()=>save('cli',{...cliPayload,id:createdCli}))
  }
  for (const n of [5,6]) {
    await user(n); await schedule('quiz',100,true,past,future); await schedule('cli',200,true,past,future)
    await save('quiz',{...quizPayload,id:createdQuiz,reviewPolicy:disabled})
    await save('cli',{...cliPayload,id:createdCli,reviewPolicy:disabled})
  }
  await user(1)
  assert.equal((await access()).length,4)
  await db.exec('begin read only'); await review('quiz',1000); await review('cli',2000); await access(); await db.exec('rollback')
  for (const table of ['quiz_attempt_questions','quiz_attempt_answers','cli_attempts','cli_commands','questions','question_options','cli_labs'])
    assert.equal((await db.query(`select * from public.${table}`)).rows.length,0,`070 raw detail restriction retained: ${table}`)
  await user(3); await schedule('quiz',100,false); await schedule('cli',200,false)
  await user(1); assert.deepEqual(await access(),[]); await denied(()=>review('quiz',1000)); await denied(()=>review('cli',2000))
  for (const signature of ['set_assessment_review_schedule(text,uuid,boolean,timestamptz,timestamptz)',
    'save_instructor_quiz_with_review(jsonb)','save_cli_lab_with_review(jsonb)']) {
    const meta = (await db.query(`select has_function_privilege('anon',$1,'execute') anon,
      has_function_privilege('authenticated',$1,'execute') authenticated,prosecdef,proconfig from pg_proc where oid=$1::regprocedure`,[`public.${signature}`])).rows[0]
    assert.equal(meta.anon,false); assert.equal(meta.authenticated,true); assert.equal(meta.prosecdef,true)
    assert.deepEqual(meta.proconfig,['search_path=pg_catalog'])
  }
  await denied(()=>rpc('prepare_assessment_review_save',['quiz',quizPayload]),/permission denied/)
  await db.exec('set role anon'); await denied(()=>save('quiz',quizPayload),/permission denied/)
  console.log('PASS: migrations 070 + 071 twice; real legacy quiz/CLI/topology saves; strict role/ban/owner/inputs; default-off/immediate/scheduled windows; exact inclusive/exclusive bounds; old setter compatibility; all review/legacy/flag guards; player and raw-table protections; atomic create/edit and rollback; missing-policy preservation; admin aliases; read-only retrieval and grants.')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally { await db.close() }
