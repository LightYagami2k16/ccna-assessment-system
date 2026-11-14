// Run with PGLITE_MODULE pointing to a temporary @electric-sql/pglite installation.
// Uses an in-memory database only; never reads application credentials or Supabase.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const modulePath = process.env.PGLITE_MODULE
if (!modulePath) throw new Error('Set PGLITE_MODULE to the temporary pglite/dist/index.js path. See the live-monitoring acceptance guide.')
const { PGlite } = await import(pathToFileURL(modulePath).href)
const db = new PGlite()
const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const sqlFile = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
async function loadFunction(file, name) {
  const source = await sqlFile(file)
  const start = source.indexOf(`create or replace function public.${name}(`)
  assert.notEqual(start, -1, `Missing function ${name}`)
  const end = source.indexOf('$$;', source.indexOf('as $$', start)) + 3
  await db.exec(source.slice(start, end))
}
async function caller(id) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ? uuid(id) : ''])
}
async function submit(type, id) {
  const result = await db.query('select public.instructor_submit_assessment_attempt($1, $2) as result', [type, id ? uuid(id) : null])
  return result.rows[0].result
}
async function row(table, id) {
  return (await db.query(`select * from public.${table} where id = $1`, [uuid(id)])).rows[0]
}
async function rejects(action, message) {
  await assert.rejects(action, message)
}

try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; grant usage on schema auth to authenticated;
    create table public.profiles (id uuid primary key, role text);
    create table auth.users (id uuid primary key, banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table public.quizzes (id uuid primary key, created_by uuid, passing_score numeric);
    create table public.cli_labs (id uuid primary key, created_by uuid, passing_score numeric);
    create table public.quiz_attempts (id uuid primary key, quiz_id uuid, student_id uuid, status text default 'in_progress',
      expires_at timestamptz default now() + interval '1 hour', submitted_at timestamptz,
      score_points numeric default 0, maximum_points numeric default 10, percentage numeric default 0, passed boolean);
    create table public.cli_attempts (like public.quiz_attempts including all);
    alter table public.cli_attempts drop column quiz_id;
    alter table public.cli_attempts add lab_id uuid;
    alter table public.cli_attempts add session_state jsonb default '{}';
    alter table public.cli_attempts add criteria_snapshot jsonb default '[]';
    create table public.active_assessment_sessions (student_id uuid, assessment_type text, attempt_id uuid,
      expires_at timestamptz default now() + interval '1 hour', client_id text default 'client-1234567890',
      client_heartbeat_at timestamptz, updated_at timestamptz);
    create table public.questions (id uuid primary key, question_type text);
    create table public.question_options (id uuid primary key, question_id uuid, option_text text, is_correct boolean);
    create table public.quiz_attempt_questions (id uuid primary key, attempt_id uuid, question_id uuid, points numeric);
    create table public.quiz_attempt_answers (attempt_question_id uuid, selected_option_id uuid, selected_option_ids uuid[],
      answer_text text, is_correct boolean, points_awarded numeric default 0);
  `)
  await loadFunction('004_admin_role_compatibility.sql', 'get_current_user_role_text')
  await loadFunction('045_identification_and_multiple_answer_questions.sql', 'normalize_identification_answer')
  await loadFunction('045_identification_and_multiple_answer_questions.sql', 'grade_quiz_attempt_answers')
  await loadFunction('026_phase2_expanded_switch_configuration.sql', 'canonical_cli_line')
  await loadFunction('026_phase2_expanded_switch_configuration.sql', 'canonical_cli_vlan_list')
  await loadFunction('031_phase2_acl_configuration.sql', 'canonical_cli_interface')
  await loadFunction('031_phase2_acl_configuration.sql', 'canonical_cli_acl_id')
  await loadFunction('031_phase2_acl_configuration.sql', 'cli_criterion_is_met')
  await loadFunction('047_assessment_client_session_leases.sql', 'validate_assessment_client_id')
  await loadFunction('047_assessment_client_session_leases.sql', 'assert_assessment_client_session')
  await loadFunction('046_one_active_assessment_session.sql', 'enforce_one_active_assessment_session')
  // Permission boundary matches production: only definer functions may grade.
  await db.exec('revoke all on function public.grade_quiz_attempt_answers(uuid) from public, authenticated;')
  await db.exec(await sqlFile('068_live_monitoring_instructor_submission.sql'))
  for (const [id, role] of [[1, 'instructor'], [2, 'instructor'], [3, 'admin'], [4, 'student'], [5, null], [6, 'instructor']]) {
    await db.query('insert into public.profiles values ($1,$2)', [uuid(id), role])
    await db.query('insert into auth.users values ($1,$2)', [uuid(id), id === 6 ? new Date(Date.now() + 3600000).toISOString() : null])
  }
  for (const [table, id, owner] of [['quizzes', 10, 1], ['quizzes', 11, 2], ['cli_labs', 20, 1], ['cli_labs', 21, 2]]) {
    await db.query(`insert into public.${table} values ($1,$2,70)`, [uuid(id), uuid(owner)])
  }
  for (const [id, quiz] of [[100, 10], [101, 11], [102, 10], [103, 10], [104, 10], [105, 10]]) {
    await db.query('insert into public.quiz_attempts (id,quiz_id,student_id) values ($1,$2,$3)', [uuid(id), uuid(quiz), uuid(4)])
  }
  const criteria = [{ type: 'hostname', expected: 'SW1', points: 7 }, { type: 'enable_secret', expected: 'secret', points: 3 }]
  for (const [id, lab] of [[200, 20], [201, 21], [202, 20]]) {
    await db.query('insert into public.cli_attempts (id,lab_id,student_id,session_state,criteria_snapshot) values ($1,$2,$3,$4,$5)',
      [uuid(id), uuid(lab), uuid(4), JSON.stringify({ hostname: 'SW1', enableSecret: 'wrong' }), JSON.stringify(criteria)])
  }
  for (const [type, id] of [['quiz', 100], ['cli', 200]]) {
    await db.query('insert into public.active_assessment_sessions (student_id,assessment_type,attempt_id) values ($1,$2,$3)', [uuid(4), type, uuid(id)])
  }
  // Actual quiz grader: correct MCQ + identification + multiple answer, one wrong,
  // one unanswered. Maximum 10; last-saved answers earn 6 points.
  for (const [index, type, correct] of [[0, 'multiple_choice', true], [1, 'identification', true], [2, 'multiple_answer', true], [3, 'multiple_choice', false], [4, 'multiple_choice', null]]) {
    const question = uuid(300 + index), option = uuid(400 + index), aq = uuid(500 + index)
    await db.query('insert into public.questions values ($1,$2)', [question, type])
    await db.query("insert into public.question_options values ($1,$2,'Router',true)", [option, question])
    await db.query('insert into public.quiz_attempt_questions values ($1,$2,$3,2)', [aq, uuid(100), question])
    if (correct !== null) await db.query('insert into public.quiz_attempt_answers (attempt_question_id,selected_option_id,selected_option_ids,answer_text) values ($1,$2,$3,$4)',
      [aq, correct ? option : null, correct ? [option] : [], correct ? '  ROUTER  ' : 'Wrong'])
  }
  await db.exec(`
    create trigger quiz_attempts_one_active_session before update of status, expires_at on public.quiz_attempts
      for each row execute function public.enforce_one_active_assessment_session();
    create trigger cli_attempts_one_active_session before update of status, expires_at on public.cli_attempts
      for each row execute function public.enforce_one_active_assessment_session();
  `)
  await db.exec('set role authenticated')
  for (const id of [null, 4, 5, 6]) {
    await caller(id)
    await rejects(() => submit('quiz', 100), /Instructor access/)
    await rejects(() => db.query('select public.get_live_attempt_assessment_context()'), /Instructor access/)
  }
  await caller(2)
  await rejects(() => submit('quiz', 100), /cannot submit/)
  await rejects(() => submit('cli', 200), /cannot submit/)
  await caller(1)
  await rejects(() => submit('bad', 100), /valid assessment/)
  await rejects(() => submit(null, 100), /valid assessment/)
  await rejects(() => submit('quiz', null), /valid assessment/)
  await rejects(() => submit('quiz', 999), /cannot submit/)
  const metadata = (await db.query('select public.get_live_attempt_assessment_context() as result')).rows[0].result
  assert(metadata.some((entry) => entry.assessmentId === uuid(10) && entry.studentId === uuid(4)))
  assert(!metadata.some((entry) => entry.assessmentId === uuid(11) || entry.assessmentId === uuid(21)))
  const quizResult = await submit('quiz', 100)
  assert.equal(Number(quizResult.percentage), 60)
  assert.equal(quizResult.status, 'submitted')
  const cliResult = await submit('cli', 200)
  assert.equal(Number(cliResult.percentage), 70)
  assert.equal(Number(cliResult.maximumPoints), 10)
  await rejects(() => db.query('select * from public.instructor_attempt_submissions'), /permission denied/)
  await rejects(() => db.query("insert into public.instructor_attempt_submissions (assessment_type) values ('quiz')"), /permission denied/)
  await db.exec('reset role')
  assert.equal((await row('quiz_attempts', 100)).passed, false)
  assert.equal((await row('cli_attempts', 200)).passed, true)
  assert.equal((await db.query('select count(*)::int as count from public.active_assessment_sessions')).rows[0].count, 0)
  const audit = (await db.query('select * from public.instructor_attempt_submissions')).rows
  assert.equal(audit.length, 2)
  assert(audit.every((event) => event.performed_by === uuid(1) && event.student_id === uuid(4)))
  await caller(4)
  await rejects(() => db.query("select public.assert_assessment_client_session('quiz', $1, 'client-1234567890')", [uuid(100)]), /no longer controls/)
  await db.query('update public.quiz_attempt_answers set points_awarded=999 where attempt_question_id=$1', [uuid(500)])
  await caller(1)
  assert.equal((await submit('quiz', 100)).alreadyCompleted, true)
  assert.equal(Number((await row('quiz_attempts', 100)).percentage), 60)
  await db.query("update public.quiz_attempts set status='submitted',percentage=42 where id=$1", [uuid(102)])
  assert.equal((await submit('quiz', 102)).alreadyCompleted, true)
  assert.equal(Number((await row('quiz_attempts', 102)).percentage), 42)
  await db.query("update public.quiz_attempts set expires_at=now()-interval '1 minute' where id=$1", [uuid(103)])
  assert.equal((await submit('quiz', 103)).status, 'expired')
  await db.query("update public.cli_attempts set criteria_snapshot='[]' where id=$1", [uuid(202)])
  assert.equal(Number((await submit('cli', 202)).percentage), 0)
  await caller(3)
  assert.equal((await submit('quiz', 101)).status, 'submitted')
  assert.equal((await submit('cli', 201)).status, 'submitted')
  // A grading error must roll back attempt, lease and audit together.
  await caller(1)
  await db.query('insert into public.active_assessment_sessions (student_id,assessment_type,attempt_id) values ($1,\'quiz\',$2)', [uuid(4), uuid(104)])
  await db.exec("create or replace function public.grade_quiz_attempt_answers(p_attempt_id uuid) returns numeric language plpgsql as $$ begin raise exception 'grading failed'; end; $$;")
  await rejects(() => submit('quiz', 104), /grading failed/)
  assert.equal((await row('quiz_attempts', 104)).status, 'in_progress')
  assert.equal((await db.query('select count(*)::int as count from public.active_assessment_sessions where attempt_id=$1', [uuid(104)])).rows[0].count, 1)
  assert.equal((await db.query('select count(*)::int as count from public.instructor_attempt_submissions where attempt_id=$1', [uuid(104)])).rows[0].count, 0)
  await loadFunction('045_identification_and_multiple_answer_questions.sql', 'grade_quiz_attempt_answers')
  await db.exec(`
    create function public.simulate_busy_attempt() returns trigger language plpgsql as $$
      begin raise exception using errcode='55P03', message='simulated lock contention'; end;
    $$;
    create trigger simulate_busy before update on public.quiz_attempts for each row
      when (old.id = '${uuid(105)}'::uuid) execute function public.simulate_busy_attempt();
  `)
  await rejects(() => submit('quiz', 105), /being saved or finalized/)
  assert.equal((await row('quiz_attempts', 105)).status, 'in_progress')
  assert.equal((await db.query('select count(*)::int as count from public.instructor_attempt_submissions where attempt_id=$1', [uuid(105)])).rows[0].count, 0)
  await db.exec('drop trigger simulate_busy on public.quiz_attempts')
  assert.equal((await submit('quiz', 105)).status, 'submitted')
  await db.exec('set role anon')
  await rejects(() => submit('quiz', 105), /permission denied/)
  await db.exec('reset role')
  console.log('PASS: migration executes; roles/ownership, metadata isolation, MCQ/identification/multiple-answer grading, CLI scoring, audit permissions, retry safety, timeout, zero criteria, production session-release triggers, lease revocation, admin scope, grading-error rollback, and busy-attempt error/retry.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await db.close()
}
