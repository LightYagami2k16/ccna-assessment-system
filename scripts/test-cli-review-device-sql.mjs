// Isolated PostgreSQL contract/authorization probe; fixture grader, no hosted writes.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const file = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,banned_until timestamptz);
    create table public.profiles(id uuid primary key,role text,full_name text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.get_current_user_role_text() returns text language sql stable as $$ select role from public.profiles where id=auth.uid() $$;
    create table public.courses(id int primary key,code text);
    create table public.modules(id int primary key,code text);
    create table public.cli_labs(id uuid primary key,created_by uuid,title text,course_id int,module_id int,device_type text);
    create table public.cli_attempts(id uuid primary key,lab_id uuid,student_id uuid,attempt_number int,status text,score_points numeric,maximum_points numeric,percentage numeric,passed boolean,started_at timestamptz,submitted_at timestamptz,session_state jsonb,criteria_snapshot jsonb);
    create table public.cli_commands(device_id text,attempt_id uuid,sequence_number int,command_text text,mode_before text,mode_after text,accepted boolean,output_text text,entered_at timestamptz);
    create function public.cli_criterion_is_met(jsonb,jsonb) returns boolean language sql as $$ select coalesce(($2->>'met')::boolean,false) $$;
  `)
  const helper = await file('070_student_attempt_review.sql')
  const start = helper.indexOf('create or replace function public.assessment_review_user_allowed(')
  await db.exec(helper.slice(start, helper.indexOf('$$;', start) + 3))
  for (const [n, role] of [[1,'instructor'],[2,'instructor'],[3,'administrator'],[4,'student'],[5,'admin']]) {
    await db.query('insert into auth.users values($1,$2,null)', [id(n), 'test@example.test'])
    await db.query('insert into public.profiles values($1,$2,$3)', [id(n), role, 'Test User'])
  }
  const criteria = [{deviceId:'r1',type:'hostname',expected:'Router',points:2,met:true},{deviceId:'r2',type:'hostname',expected:'Router',points:2,met:false},{type:'config_saved',points:1,met:false}]
  await db.exec("insert into public.courses values(1,'ITN');")
  await db.query("insert into public.cli_labs values($1,$2,'Practical',1,null,'router')", [id(10),id(1)])
  await db.query("insert into public.cli_attempts values($1,$2,$3,1,'submitted',2,5,40,false,now(),now(),$4,$5)", [id(20),id(10),id(4),{deviceStates:{r1:{hostname:'Router'},r2:{hostname:'Router'}}},criteria])
  await db.query("insert into public.cli_commands values('r2',$1,1,'show vlan','user_exec','user_exec',true,'VLAN 20',now()),(null,$1,2,'legacy','user_exec','user_exec',false,'Invalid',now())", [id(20)])
  const migration = await file('072_cli_review_criterion_devices.sql')
  await db.exec(migration); await db.exec(migration)
  const commandMigration = await file('073_cli_review_command_devices.sql')
  await db.exec(commandMigration); await db.exec(commandMigration)
  const user = n => db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : ''])
  const review = async () => (await db.query('select public.get_instructor_cli_attempt_review($1) result', [id(20)])).rows[0].result
  for (const n of [1,3,5]) {
    await user(n); const result = await review()
    assert.deepEqual(result.criteria.map(c=>c.deviceId),['r1','r2',null])
    assert.deepEqual(result.commands.map(c=>[c.deviceId,c.sequence,c.command,c.output]),[['r2',1,'show vlan','VLAN 20'],[null,2,'legacy','Invalid']])
    assert.deepEqual(result.criteria.map(c=>c.pointsAwarded),[2,0,0])
    assert.equal(result.attempt.state.deviceStates.r2.hostname,'Router')
  }
  for (const n of [null,2,4]) { await user(n); await assert.rejects(review, /access is required|cannot be reviewed/) }
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [id(1)])
  await user(1); await assert.rejects(review, /access is required/)
  assert.deepEqual((await db.query('select criteria_snapshot from public.cli_attempts')).rows[0].criteria_snapshot,criteria)
  assert.equal((await db.query("select has_function_privilege('anon','public.get_instructor_cli_attempt_review(uuid)','execute') allowed")).rows[0].allowed,false)
  console.log('PASS: 072 and 073 twice; command device IDs/order/output preserved; recorded device IDs/order/missing IDs/state preserved; owner/admin aliases; other instructors/students/anonymous/banned denied; snapshot unchanged; fixture-grader scores preserved.')
} finally { await db.close() }
