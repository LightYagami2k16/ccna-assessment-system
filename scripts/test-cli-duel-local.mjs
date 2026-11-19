// Only the disposable loopback stack is supported. No hosted credentials are read.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
const folder = join(tmpdir(), 'ccna-cli-duel-baseline-20261116-153425', 'local-stack')
const log = await readFile(join(folder, 'start-private.log'), 'utf8')
const settings = JSON.parse(log.split(/\r?\n/).find(line => line.startsWith('{"DB_URL"')))
assert.equal(settings.API_URL, 'http://127.0.0.1:55321')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, options)
const suffix = Date.now()
const password = `LocalDuel-${crypto.randomUUID()}!`
const users = []
async function checked(result) { const { data, error } = await result; if (error) throw new Error(error.message); return data }
function sql(query) {
  const result = spawnSync('docker', ['exec', '-i', 'supabase_db_ccna-cli-duel-local-20261116', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8', timeout: 30000 })
  if (result.status !== 0) throw new Error(`Local SQL fixture failed: ${result.stderr?.slice(0, 500)}`)
  return result.stdout.trim()
}
for (const [name, role] of [['Host', 'instructor'], ['Player One', 'student'], ['Player Two', 'student'], ['Other Teacher', 'instructor']]) {
  const email = `duel-${name.replaceAll(' ', '-').toLowerCase()}-${suffix}@example.test`
  const { user } = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } }))
  users.push({ id: user.id, name, role, email })
}
sql(users.map(user => `update public.profiles set role='${user.role}',full_name='${user.name}' where id='${user.id}';`).join('\n'))
const [host, one, two, outsider] = users
const classId = crypto.randomUUID(), labId = crypto.randomUUID()
const courseId = Number(sql("select id from public.courses where code='ITN' limit 1"))
assert.ok(courseId)
const devices = [{ id: 'switch-1', type: 'switch', label: 'Campus switch', hostname: 'Switch' }]
const criteria = [{ deviceId: 'switch-1', type: 'hostname', expected: 'Campus', target: '', points: 10 }, { deviceId: 'switch-1', type: 'config_saved', expected: '', target: '', points: 10 }]
sql(`select set_config('request.jwt.claim.sub','${host.id}',false);
insert into public.class_sections(id,name,code,created_by) values('${classId}','Local Duel Class','DUEL-${suffix}','${host.id}');
insert into public.class_memberships(class_id,student_id) values('${classId}','${one.id}'),('${classId}','${two.id}');
insert into public.cli_labs(id,course_id,created_by,title,instructions,devices,topology,grading_criteria) values('${labId}',${courseId},'${host.id}','Local verified duel','Set hostname Campus and save the configuration.','${JSON.stringify(devices)}','{"links":[]}','${JSON.stringify(criteria)}');`)
for (const user of users) {
  user.client = createClient(settings.API_URL, settings.ANON_KEY, options)
  await checked(user.client.auth.signInWithPassword({ email: user.email, password }))
}
const rpc = (user, name, args = {}) => checked(user.client.rpc(name, args))
async function action(user, body) {
  const { data, error } = await user.client.functions.invoke('cli-duel', { body })
  if (error) { let detail = error.message; try { detail = JSON.stringify(await error.context.json()) } catch { /* no body */ } throw new Error(detail) }
  return data
}
const baseline = sql('select (select count(*) from public.quiz_attempts)||\',\'||(select count(*) from public.cli_attempts)')
const created = await action(host, { action: 'create', labId, title: 'Local acceptance duel', durationMinutes: 1, participantSelections: [{ studentId: one.id, classId }, { studentId: two.id, classId }], allowReview: false })
assert.ok(created.competitionId)
const matchId = created.competitionId
const ownClient = `local:${crypto.randomUUID()}`
const otherClient = `local:${crypto.randomUUID()}`
await rpc(one, 'ready_cli_duel', { p_competition_id: matchId, p_client_id: ownClient, p_ready: true })
await rpc(two, 'ready_cli_duel', { p_competition_id: matchId, p_client_id: otherClient, p_ready: true })
const started = await rpc(host, 'start_cli_duel', { p_competition_id: matchId })
assert.equal(started.competition.status, 'countdown')
const participant = started.participants.find(p => p.displayName === one.name)
const opponent = started.participants.find(p => p.displayName === two.name)
await assert.rejects(() => rpc(outsider, 'get_cli_duel', { p_competition_id: matchId }))
const hidden = await rpc(one, 'get_cli_duel_player', { p_participant_id: participant.id, p_client_id: ownClient })
assert.equal(hidden.task, null); assert.equal(hidden.ownState, null)
console.log('PASS real auth, Edge creation, class scope and shared countdown secrecy.')
// Advance only this disposable fixture clock to avoid a slow timed acceptance run.
sql(`update public.cli_competitions set starts_at=clock_timestamp()-interval '2 seconds',deadline=clock_timestamp()+interval '58 seconds',status='active' where id='${matchId}';`)
let revision = 0
let payload
for (const command of ['enable', 'conf t', 'hostname Campus']) {
  payload = { action: 'command', participantId: participant.id, clientId: ownClient, commandId: crypto.randomUUID(), sequence: revision + 1, expectedRevision: revision, command }
  const result = await action(one, payload)
  assert.equal(result.revision, revision + 1); revision = result.revision
}
const repeated = await action(one, payload)
assert.equal(repeated.duplicate, true); assert.equal(repeated.revision, revision)
await action(two, { action:'command', participantId:opponent.id, clientId:otherClient, commandId:crypto.randomUUID(), sequence:1, expectedRevision:0, command:'enable' })
const progress = await rpc(two, 'get_cli_duel', { p_competition_id: matchId })
assert.equal(progress.participants.find(p => p.id === participant.id).scorePoints, 10)
assert.equal(progress.participants.find(p => p.id === opponent.id).hp, 50)
await assert.rejects(() => action(one, { ...payload, state: {} }))
await assert.rejects(() => rpc(two, 'get_cli_duel_player', { p_participant_id: participant.id, p_client_id: ownClient }))
await rpc(one, 'release_assessment_client_session', { p_assessment_type: 'competition', p_attempt_id: participant.id, p_client_id: ownClient })
await rpc(one, 'claim_assessment_client_session', { p_assessment_type: 'competition', p_attempt_id: participant.id, p_client_id: ownClient, p_client_label: 'Local reconnect' })
assert.equal((await rpc(one, 'get_cli_duel_player', { p_participant_id: participant.id, p_client_id: ownClient })).revision, revision)
console.log('PASS real Edge execution/SQL scoring, HP convergence, duplicate retry, forbidden payload and reconnect.')
await rpc(one, 'finish_cli_duel', { p_participant_id: participant.id, p_client_id: ownClient })
await assert.rejects(() => rpc(one, 'get_cli_duel_review', { p_participant_id: participant.id }))
sql(`update public.cli_competitions set deadline=clock_timestamp()-interval '1 second' where id='${matchId}';`)
const final = await rpc(two, 'settle_cli_duel', { p_competition_id: matchId })
assert.equal(final.competition.status, 'completed')
assert.equal(final.participants.find(p => p.id === participant.id).placement, 1)
assert.equal(final.participants.find(p => p.id === opponent.id).status, 'expired')
await assert.rejects(() => action(two, { ...payload, participantId: opponent.id, clientId:otherClient, sequence: 2, expectedRevision: 1, commandId: crypto.randomUUID() }))
await rpc(host, 'set_cli_duel_review', { p_competition_id: matchId, p_allow: true })
const review = await rpc(one, 'get_cli_duel_review', { p_participant_id: participant.id })
assert.equal(review.criteria[0].expected, 'Campus')
await assert.rejects(() => rpc(two, 'get_cli_duel_review', { p_participant_id: participant.id }))
await rpc(host, 'set_cli_duel_review', { p_competition_id: matchId, p_allow: false })
await assert.rejects(() => rpc(one, 'get_cli_duel_review', { p_participant_id: participant.id }))
assert.equal(sql('select (select count(*) from public.quiz_attempts)||\',\'||(select count(*) from public.cli_attempts)'), baseline)
await writeFile(join(folder, 'test-accounts-private.json'), JSON.stringify({ url: settings.API_URL, publishableKey: settings.PUBLISHABLE_KEY, password, classId, labId, matchId, accounts: users.map(({ client, ...user }) => user) }, null, 2))
console.log('PASS real deadline locking, separate academic history, own-only review release/withdrawal. Fictional local test accounts saved privately.')
