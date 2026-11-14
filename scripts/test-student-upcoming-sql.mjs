// Run with PGLITE_MODULE pointing to a temporary pglite/dist/index.js installation.
// Isolated in-memory PostgreSQL only: never reads app credentials or contacts Supabase.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const modulePath = process.env.PGLITE_MODULE
if (!modulePath) throw new Error('Set PGLITE_MODULE to the temporary pglite/dist/index.js path.')
const { PGlite } = await import(pathToFileURL(modulePath).href)
const db = new PGlite()
const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const file = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
async function loadFunction(filename, name) {
  const source = await file(filename)
  const start = source.indexOf(`create or replace function public.${name}(`)
  assert.notEqual(start, -1, `Missing function ${name}`)
  const end = source.indexOf('$$;', source.indexOf('as $$', start)) + 3
  await db.exec(source.slice(start, end))
}
async function caller(id) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ? uuid(id) : ''])
}
async function upcoming() {
  return (await db.query('select public.get_student_upcoming_assessments() as result')).rows[0].result
}
const tables = ['profiles', 'courses', 'modules', 'quizzes', 'class_sections', 'class_memberships',
  'quiz_assignments', 'student_quiz_accommodations', 'student_quiz_preferences', 'quiz_attempts']
async function snapshot() {
  const rows = {}
  for (const table of tables) {
    rows[table] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]') as data from public.${table} t`)).rows[0].data
  }
  rows.users = (await db.query('select jsonb_agg(to_jsonb(t) order by id) as data from auth.users t')).rows[0].data
  return rows
}

try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table public.profiles (id uuid primary key, role text);
    create table public.courses (id bigint primary key, code text);
    create table public.modules (id uuid primary key, code text);
    create table public.quizzes (id uuid primary key, course_id bigint, module_id uuid,
      title text, status text, available_from timestamptz, available_until timestamptz,
      max_attempts integer default 2, instructions text default 'PRIVATE INSTRUCTIONS');
    create table public.class_sections (id uuid primary key, is_active boolean default true);
    create table public.class_memberships (class_id uuid, student_id uuid, primary key(class_id, student_id));
    create table public.quiz_assignments (id uuid primary key, quiz_id uuid, class_id uuid,
      available_from timestamptz, available_until timestamptz, unique(quiz_id, class_id));
    create table public.student_quiz_accommodations (quiz_id uuid, student_id uuid,
      extra_attempts integer default 0, available_from timestamptz, available_until timestamptz,
      primary key(quiz_id, student_id));
    create table public.student_quiz_preferences (quiz_id uuid, student_id uuid, archived boolean,
      primary key(quiz_id, student_id));
    create table public.quiz_attempts (id uuid primary key, quiz_id uuid, student_id uuid,
      status text, expires_at timestamptz, started_at timestamptz default now());
  `)
  await loadFunction('004_admin_role_compatibility.sql', 'get_current_user_role_text')
  await loadFunction('011_exam_controls_and_integrity.sql', 'student_can_access_quiz')
  await db.exec(await file('069_student_upcoming_assessments.sql'))
  const base = new Date((await db.query('select now() as value')).rows[0].value).getTime()
  const date = (hours) => hours === null ? null : new Date(base + hours * 3_600_000).toISOString()
  for (const [id, role] of [[1, 'student'], [2, 'student'], [3, 'instructor'], [4, 'admin'],
    [5, 'administrator'], [6, null], [7, 'student'], [8, 'student'], [50, 'student']]) {
    await db.query('insert into public.profiles values ($1,$2)', [uuid(id), role])
    await db.query('insert into auth.users values ($1,$2)', [uuid(id), id === 7 ? date(24) : id === 8 ? date(-24) : null])
  }
  await db.query('insert into auth.users values ($1,null)', [uuid(9)])
  await db.exec("insert into public.courses values (1,'ITN');")
  await db.query("insert into public.modules values ($1,'M1')", [uuid(90)])
  for (const id of [10, 11, 12, 20, 30, 40]) {
    await db.query('insert into public.class_sections values ($1,$2)', [uuid(id), id !== 30])
  }
  for (const [section, student] of [[10, 1], [11, 1], [12, 1], [20, 2], [30, 1], [10, 8]]) {
    await db.query('insert into public.class_memberships values ($1,$2)', [uuid(section), uuid(student)])
  }
  let assignmentId = 1000
  let attemptId = 2000
  async function quiz(id, { start = 2, end = 3, status = 'published', classes = [10], title = `Quiz ${id}`, module = 90 } = {}) {
    await db.query('insert into public.quizzes (id,course_id,module_id,title,status,available_from,available_until) values ($1,1,$2,$3,$4,$5,$6)',
      [uuid(id), module ? uuid(module) : null, title, status, date(start), date(end)])
    for (const section of classes) await assignment(id, section)
  }
  async function assignment(id, section, start = null, end = null) {
    await db.query('insert into public.quiz_assignments values ($1,$2,$3,$4,$5)', [uuid(assignmentId++), uuid(id), uuid(section), date(start), date(end)])
  }
  async function accommodation(id, start, end, extra = 0, student = 1) {
    await db.query('insert into public.student_quiz_accommodations values ($1,$2,$3,$4,$5)', [uuid(id), uuid(student), extra, date(start), date(end)])
  }
  async function attempt(id, status = 'submitted', expires = -1, student = 1) {
    await db.query('insert into public.quiz_attempts (id,quiz_id,student_id,status,expires_at) values ($1,$2,$3,$4,$5)',
      [uuid(attemptId++), uuid(id), uuid(student), status, date(expires)])
  }
  await quiz(100)
  await quiz(101, { classes: [] }); await assignment(101, 10, 4, 5)
  await quiz(102, { classes: [] }); await assignment(102, 10, 4, 5); await accommodation(102, 6, 7)
  await quiz(103, { classes: [] }); await assignment(103, 10, 4, 5); await accommodation(103, null, 7)
  await quiz(104, { end: null, module: null })
  await quiz(110, { status: 'draft' })
  await quiz(111, { classes: [30] })
  await quiz(112, { classes: [20] })
  await quiz(113, { classes: [] })
  await quiz(114, { classes: [40] })
  await quiz(115, { start: -4, end: -2 })
  await quiz(116, { start: 4, end: 3 })
  await quiz(117, { start: null, end: null })
  await quiz(118, { start: null, end: null, classes: [] })
  await assignment(118, 10, -1, 1); await assignment(118, 11, 4, 5)
  await quiz(119, { start: 4, end: 5 }); await attempt(119, 'in_progress', 1)
  await quiz(120); await attempt(120); await attempt(120, 'expired')
  await quiz(121); await attempt(121); await attempt(121); await accommodation(121, null, null, 1)
  await quiz(122)
  await db.query('insert into public.student_quiz_preferences values ($1,$2,true)', [uuid(122), uuid(1)])
  // Closed earlier window and two future windows: never combine their end dates.
  await quiz(123, { start: null, end: null, classes: [] })
  await assignment(123, 10, -4, -2); await assignment(123, 11, 4, 5); await assignment(123, 12, 8, 10)
  // Invalid earliest opening must not hide the next valid window.
  await quiz(124, { start: null, end: null, classes: [] })
  await assignment(124, 10, 2, 1); await assignment(124, 11, 6, 8)
  await quiz(125); await attempt(125, 'in_progress', -1)
  await quiz(126); await attempt(126, 'in_progress', 1, 2); await attempt(126, 'submitted', -1, 2)
  await accommodation(126, 20, 21, 0, 2)
  await db.query('insert into public.student_quiz_preferences values ($1,$2,true)', [uuid(126), uuid(2)])
  await quiz(127, { title: 'Same title' }); await quiz(128, { title: 'Same title' })
  await quiz(129, { start: null, end: null, classes: [] })
  await assignment(129, 10, 6, 8); await accommodation(129, 4, null)
  await quiz(130, { start: 4, end: 4 })
  await quiz(131); await attempt(131); await attempt(131); await attempt(131); await accommodation(131, null, null, 1)
  await quiz(132, { start: 5, end: 6 }); await accommodation(132, 3, 2)
  await quiz(200, { classes: [20] })
  const before = await snapshot()
  await db.exec('set role authenticated')
  for (const id of [null, 3, 4, 5, 6, 7, 9]) {
    await caller(id)
    await assert.rejects(upcoming, /Student access is required/)
  }
  await caller(1)
  const result = await upcoming()
  const byId = new Map(result.map((item) => [item.id, item]))
  const expected = [100, 101, 102, 103, 104, 121, 123, 124, 125, 126, 127, 128, 129]
  assert.deepEqual([...byId.keys()].sort(), expected.map(uuid).sort())
  assert.equal(result.length, expected.length, 'One result per quiz')
  const window = (id, from, until) => {
    assert.equal(new Date(byId.get(uuid(id)).availableFrom).getTime(), new Date(date(from)).getTime())
    assert.equal(byId.get(uuid(id)).availableUntil === null ? null : new Date(byId.get(uuid(id)).availableUntil).getTime(), until === null ? null : new Date(date(until)).getTime())
  }
  window(100, 2, 3); window(101, 4, 5); window(102, 6, 7); window(103, 4, 7)
  window(104, 2, null); window(123, 4, 5); window(124, 6, 8); window(129, 4, 8)
  assert.equal(byId.get(uuid(104)).moduleCode, null)
  assert(result.every((item) => item.assessmentType === 'quiz' && item.courseCode === 'ITN'))
  assert(result.every((item) => Object.keys(item).sort().join(',') === 'assessmentType,availableFrom,availableUntil,courseCode,id,moduleCode,title'))
  const ordered = [...result].sort((a, b) => new Date(a.availableFrom) - new Date(b.availableFrom) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  assert.deepEqual(result, ordered, 'Opening/title/id order is deterministic')
  await assert.rejects(() => db.query('select instructions from public.quizzes'), /permission denied/)
  await caller(50)
  assert.deepEqual(await upcoming(), [], 'A student without eligible assignments gets an empty array')
  await caller(2)
  assert.deepEqual((await upcoming()).map((item) => item.id).sort(), [112, 200].map(uuid).sort())
  await caller(8)
  assert((await upcoming()).some((item) => item.id === uuid(100)), 'Expired ban permits student access')
  await db.exec('reset role')
  assert.deepEqual(await snapshot(), before, 'RPC leaves all fixture tables unchanged')
  const grants = (await db.query(`select has_function_privilege('anon','public.get_student_upcoming_assessments()','execute') as anon,
    has_function_privilege('authenticated','public.get_student_upcoming_assessments()','execute') as authenticated,
    prosecdef, provolatile, proconfig from pg_proc where oid='public.get_student_upcoming_assessments()'::regprocedure`)).rows[0]
  assert.equal(grants.anon, false); assert.equal(grants.authenticated, true)
  assert.equal(grants.prosecdef, true); assert.equal(grants.provolatile, 's')
  assert.deepEqual(grants.proconfig, ['search_path=pg_catalog'])
  assert.equal((await db.query("select count(*)::int as count from pg_proc p, lateral aclexplode(p.proacl) a where p.oid='public.get_student_upcoming_assessments()'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'")).rows[0].count, 0)
  await db.exec('set role anon')
  await assert.rejects(upcoming, /permission denied/)
  await db.exec('reset role')
  await caller(1)
  await db.exec('begin read only; set local role authenticated;')
  assert.deepEqual(await upcoming(), result, 'RPC executes inside a read-only transaction')
  await db.exec('rollback')
  console.log('PASS: student upcoming RPC; authenticated grants/role and ban checks; class/student isolation; published/active classes; schedule priority; intact earliest valid windows; current/live suppression; archive and attempt limits; deterministic safe payload; database unchanged and read-only execution.')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await db.close()
}
