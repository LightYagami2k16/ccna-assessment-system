# Live Monitoring: assessment groups and instructor submission

Local implementation, 2026-11-13. No commit, push, or production database change
is included. Migration 068 is prepared and has been executed only in an isolated
in-memory PostgreSQL test database. Actual Supabase acceptance remains pending.

## Behavior

- Exam Controls → Live monitoring groups Class → exact assessment → student attempts.
- Filter by class, quiz/CLI type, and exact assessment; Clear filters restores all.
- Student-name search appears before Class, matches partial names without regard
  to capitalization or surrounding spaces, and combines with all three filters.
  Clear filters also resets the search. Its value survives refresh and polling.
- Assessment identity uses type + database ID. Same-title exams remain separate.
- Filtered groups open automatically. Counts and cards show matching attempts only.
- Individual student attempt details start collapsed. Show details reveals timing,
  browser/session information, command counts and Submit attempt; Hide details
  collapses only that attempt. Student name, email and event count remain visible.
  Expansion persists during polling, refresh and subsection switches.
- Filters and expansion survive subsection switches and refreshes; a selected
  assessment with no remaining active attempts shows a matching empty state.
- Submit attempt confirms the named student and assessment. It grades only
  server-saved answers or CLI state, not unsaved/offline browser work.
- Instructor scope matches existing monitoring ownership (assessment creator).
  Administrators may manage all assessments. Students, anonymous callers,
  suspended accounts, and other instructors cannot invoke submission.
- Submission and grading are transactional; repeated requests never regrade a
  completed attempt. Already-expired attempts retain expired status. No retry
  allowance or future attempt policy is changed.
- Attempt and browser-session rows use nonblocking locks. If saving or expiry
  finalization already holds a conflicting lock, submission returns a retry
  message without changing results. This avoids waiting in an inverted lock order.
- An audit row records actor, student, assessment, attempt, time, reason and
  resulting score. Browser roles cannot read/write the audit table directly.
- The active browser lease is removed. The student's next save/heartbeat is
  rejected by the existing session guard. A disconnected browser may continue
  displaying local content, but its later writes cannot change the finalized result.
- This control ends a selected attempt; it does not verify physical location.

## Database rollout dependency

Apply `supabase/migrations/068_live_monitoring_instructor_submission.sql` through
the normal reviewed migration process before using the action with real records.
It depends on migrations through 066 and is independent of pending migration 067.
Without 068, the interface displays an availability notice and disables submission;
assessment identities cannot be resolved reliably until the migration is applied.

The migration adds `get_live_attempt_assessment_context`,
`instructor_submit_assessment_attempt`, and the protected
`instructor_attempt_submissions` audit table. It does not regrade existing results.

## Isolated SQL verification

Install the test runtime in a temporary directory, without changing application
dependencies or reading Supabase credentials:

```powershell
$sqlHarnessRoot = Join-Path $env:TEMP 'ccna-monitor-sql-test'
npm.cmd install --prefix $sqlHarnessRoot --no-save --ignore-scripts @electric-sql/pglite
$env:PGLITE_MODULE = Join-Path $sqlHarnessRoot 'node_modules/@electric-sql/pglite/dist/index.js'
node scripts/test-live-monitoring-sql.mjs
```

The harness executes migration 068 against minimal schema fixtures and loads the
actual quiz-answer grader, CLI hostname/secret grader, browser-session assertion
and production status/session-release trigger
from existing migrations. It verifies roles and ownership, metadata isolation,
MCQ/identification/multiple-answer scoring, CLI scoring, missing/unanswered work,
audit access, administrator scope, retry safety, expiry, zero criteria, session
removal, rollback after grading failure, and the busy-attempt error/retry path. A
synthetic lock error verifies rollback; actual concurrent lock contention remains
a multi-connection acceptance check. It does not replace production schema,
full simulator, or concurrent multi-connection acceptance testing.

## Owner acceptance after migration application

1. Use disposable quiz/CLI attempts and two instructor accounts plus a student.
2. Verify identical titles remain separate; combine all three filters and refresh.
3. Cancel a submission and verify the student may continue normally.
4. Submit each assessment type while the student browser is open. Verify the
   score matches saved work and the next save/heartbeat blocks continuation.
5. Repeat while the student is offline and reconnect; verify the result is unchanged.
6. Submit the same attempt from two instructor tabs; verify only one audit row and
   no regrading. Test simultaneous student save/submit and timeout reconciliation.
7. Verify another instructor cannot submit an assessment they do not own, including
   direct RPC calls. Verify administrator access and rejection of student/anon calls.
8. Inspect audit rows using trusted database administration access and confirm
   ordinary application roles cannot modify them.
