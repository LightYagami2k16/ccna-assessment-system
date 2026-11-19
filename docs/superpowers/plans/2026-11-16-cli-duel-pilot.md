# CLI Duel Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline/native execution, or superpowers:subagent-driven-development if the owner chooses that method. Checklist items are not complete until their verification output has been inspected.

**Goal:** Deliver the approved local 1-vs-1 single-device CLI competition with trusted scoring, a shared time limit, HP presentation and separate results/history.

**Architecture:** One canonical simulator shared between browser and a trusted Supabase Edge Function. Dedicated competition records and private service RPCs persist verified state and grade snapshots; authenticated, sanitized RPCs expose lobby/arena/history data. Shared assessment leases prevent overlap with ordinary exams. Private Realtime broadcasts carry ID/revision-only invalidation notices; authorized HTTP reads supply protected scores/HP/history and provide a resync fallback.

**Tech Stack:** Existing React/Vite, JavaScript simulator, PostgreSQL/Supabase RLS/RPC, TypeScript Edge Function and existing Node/Playwright tools. No new browser runtime dependency.

**Spec:** docs/superpowers/specs/2026-11-16-cli-duel-pilot-design.md — owner approved November 16, 2026, with subsequent explicit time-limit confirmation.

## Global constraints

- Local, uncommitted work only. No hosted migration, function deployment, production data write, environment secret edit or publication.
- Preserve the reviewed UI and the checkpoint at C:/Users/Campos/AppData/Local/Temp/ccna-cli-duel-baseline-20261116-153425.
- First pilot: exactly two students, one switch/router, the spec's supported criterion allowlist, no links/PCs/remote connectivity/randomization/academic grading.
- Admins may host across all students; instructors only through classes they currently own and with practicals they are authorized to use. Server authorization is mandatory.
- Highest exact score first; earlier server completion breaks equal scores; exact ties share placement. HP is 100 minus the opponent's current verified percentage.
- Host-configured whole-minute limit 1–480, prefilled from practical duration. Shared 10-second countdown, then one shared starts_at/deadline. No individual pause or clock extension after Start. Warn visually in final 60 seconds.
- Deadline closes ranked input and locks unfinished work at the last verified state. Reconnection does not extend time, and local queues/client timestamps cannot backdate credit.
- Competition records never enter normal cli_attempts, academic result totals, ordinary attempt limits or academic exports.
- Student review is their own work only, default disabled, and never releases a key before the entire match settles.
- No app source/docs edits while a browser test is running. Build and browser checks run sequentially. No blind destructive cleanup or git reset --hard.

## Execution rulings and baseline

- **Ruling:** Continue in the existing checkpointed localhost workspace, preserving the user's established local-review workflow and uncommitted accepted UI. No worktree/branch/commit mutation is required.
- **Ruling:** Native implementation is recommended because server/state/session/UI interfaces depend on each other. One fresh final review follows integration; owner approved the plan and Native execution on November 16, 2026.
- **Ruling:** Docker CLI is installed but the daemon was unavailable on inspection. Node/isolated SQL and mocked browser checks may advance implementation; they cannot close real two-student local/test Supabase acceptance. Start/configure a disposable local stack only within the approved local scope, never by redirecting tests to production.
- **Ruling:** Timed-out matches may settle on a protected read/action/clock request after the deadline, but their effective scoring cutoff and recorded finish remain exactly the stored deadline. Add scheduled cleanup only if the local/test deployment supports it; correctness must not depend on an open browser.
- Baseline product changes already present: accepted device/criteria navigation, review-form spacing, and their tests. Do not roll these back or treat them as new competition work.

## Review focus

1. Browser-forged state, score, timestamps, opponent IDs or duplicate requests must never change ranked outcomes.
2. A deadline, command commit, manual Finish and cancellation racing together must have one serializable outcome; finalized per-criterion outcomes never change when grading code is updated.
3. A third assessment type must not fall through legacy quiz/CLI branches, leak keys, or break normal start/resume/expiry.
4. Revoked class ownership, ban status, partial starts and live-channel access changes must fail closed without exposing other-class records.
5. Old challenge edits, rematches, voids, reconnects and review withdrawal must preserve original evidence and clear no-longer-authorized detail.

## Contract and file map

Database migrations: 074_cli_duel_pilot.sql (dedicated storage, lifecycle, grading, safe reads and private service methods); 075_cli_duel_sessions_realtime.sql (lease integration, sanitized private broadcasts and explicit competition dispatch). Confirm these numbers are unused before creating them.

Canonical simulator: move the existing pure implementation to supabase/functions/_shared/ciscoSimulator.js; src/simulator/ciscoSimulator.js re-exports its unchanged API. Add supabase/functions/_shared/cliDuelProtocol.js for approved-pilot constants, request validation and pure state wrapping/execution. Its Node tests live at src/services/cliDuelProtocol.test.js.

Trusted function: supabase/functions/cli-duel/index.ts plus a small separately testable request handler. Validate the real user with Supabase Auth, derive UID server-side, and never log command/secret/state payloads. Protected service RPCs accept an actor UID only from this trusted function and are not executable by anon/authenticated.

Frontend: src/services/cliDuelService.js; src/hooks/useCliDuel.js; components/CliCompetitions.jsx, CliDuelLobby.jsx, CliDuelArena.jsx, CliDuelHistory.jsx and CliDuelReview.jsx plus scoped styles. Reuse existing layout/dialog/timer/review primitives where their semantics match, without turning the current normal-exam terminal into a multi-transport component.

Routing/navigation integrations: src/routing/workspaceRoutes.js, assessmentNavigation.js; components/InstructorWorkspace.jsx, AssessmentWorkspaceContent.jsx, AdminWorkspace.jsx, StudentQuizArea.jsx, WorkspaceBreadcrumbs.jsx; student Overview active-session routing/model and src/hooks/useAssessmentClientSession.js if necessary for explicit competition dispatch.

Dedicated tables: cli_competitions, cli_competition_participants, cli_competition_commands and cli_competition_events. Keep private snapshot/state/evidence unreadable through raw authenticated tables. Public safe summaries and host/student review responses must be built explicitly.

### RPC interfaces

Public authenticated RPCs:
- get_cli_duel_workspace() -> {matches, compatibleLabs, candidates}; host candidates are scoped; students receive only their invitations/history and no authoring pool.
- get_cli_duel(p_competition_id uuid) -> {competition, participants, serverNow, revision}; no private state/key/opponent commands.
- ready_cli_duel(p_competition_id uuid,p_client_id text,p_ready boolean) -> safe match summary. Actor comes from auth.uid().
- start_cli_duel(p_competition_id uuid) -> safe summary with shared startsAt/deadline. Both readiness records and cross-assessment leases checked/claimed atomically.
- get_cli_duel_player(p_participant_id uuid,p_client_id text) -> {competition, ownParticipant, ownState, ownCommands, opponentSummary, serverNow,revision}; verified lease; private task instructions released only at startsAt.
- finish_cli_duel(p_participant_id uuid,p_client_id text) -> sealed own result/safe summary; serialized against trusted command commits.
- settle_cli_duel(p_competition_id uuid) -> safe settled summary when deadline/all participants finished permits it; authorized and idempotent, no browser score/time arguments.
- manage_cli_duel(p_competition_id uuid,p_action text,p_reason text) -> safe summary; host-scoped cancel/void only, with reason and audit evidence.
- set_cli_duel_review(p_competition_id uuid,p_allow boolean) -> current policy; audited host scope, no premature release.
- get_cli_duel_review(p_participant_id uuid) -> frozen result/criteria/commands/timeline; own released student review or authorized host review only. No Final Device State panel.

Service-only RPCs (grant only service_role, security definer with pinned search_path):
- cli_duel_authoring_context(p_actor_id uuid,p_lab_id uuid,p_rematch_id uuid default null) -> authorized frozen/source definition, source fingerprint and allowed candidate scope.
- cli_duel_create(p_actor_id uuid,p_payload jsonb,p_source_fingerprint text,p_initial_state jsonb) -> ID; rechecks source/roles/roster and initial SQL score=0 before mutation. Atomically creates both participant states and snapshot; rematches copy an authorized frozen definition into a new ID.
- cli_duel_command_context(p_actor_id uuid,p_participant_id uuid,p_client_id text,p_command_id uuid,p_sequence bigint) -> private canonical state, frozen task and revision, or the already-committed result for an identical retry.
- cli_duel_commit_command(p_actor_id uuid,p_participant_id uuid,p_client_id text,p_command_id uuid,p_sequence bigint,p_expected_revision bigint,p_command text,p_outcome jsonb) -> canonical own response + safe summary. Only the trusted function supplies outcome/state. Recheck eligibility, lease, status, clock_timestamp cutoff, sequence and revision under locks; recompute SQL grading and automatic 100% completion in the same transaction.

Edge actions:
- create: {labId or rematchId,title,durationMinutes,participantSelections:[{studentId,classId}],allowReview}; obtain private context, build canonical initial state, call protected create.
- command: {participantId,clientId,commandId,sequence,expectedRevision,command}. Strictly reject state/score/HP/accepted/time/opponent fields and malformed single-line commands over existing 500-character bound. Return authoritative result; reuse command ID for uncertain network retries.

Safe camelCase responses must include enough serverNow/eventRevision data for timer calibration/resync. Final database ranking uses exact score_points descending then finished_at ascending on the shared start; stored/display elapsed time must not introduce rounded-score ties.

## Task 1 — Shared trusted execution primitives

**Files:** canonical simulator relocation/re-export, _shared/cliDuelProtocol.js, src/services/cliDuelProtocol.test.js, package.json test registration.

**Interfaces:** createDuelInitialState(snapshot); validateDuelRequest(body); executeDuelCommand(snapshot,wrappedState,command) -> next wrapped state and normal CLI output/modes/accepted flag. Supported criterion types exactly match the spec. No randomness, network, credentials or browser-only APIs in shared execution.

- [x] Write failing tests for source-wrapper export parity, state immutability, aliases, correct/wrong hostname, config_saved reset after a later change, repeated commands, invalid/unsupported criteria/device/topology, and rejection of forged outcome/time fields.
- [x] Run the focused Node test and inspect the failure.
- [x] Move the canonical simulator without semantic edits, re-export its full API, and implement narrow pure duel helpers.
- [x] Run focused tests and the existing full Node simulator/unit suite. Existing behavior must remain identical; failures block later tasks.

## Task 2 — Private persistence, rubric validation and result lifecycle

**Files:** migration 074 and scripts/test-cli-duel-sql.mjs; isolated fixture support only as needed.

**Interfaces:** public safe lifecycle/review RPCs and private authoring/create/context/commit methods above. Competition states: lobby/countdown/active/completed/cancelled/voided; participant states: invited/ready/in_progress/submitted/expired/did_not_start. Effective time transitions are server-derived; explicit created_at/started_at/deadline/submitted_at fields preserve evidence.

- [x] Write failing isolated PostgreSQL tests for host/candidate scopes, raw/private read denial, unsupported/invalid/conflicting/already-completed rubrics, immutable snapshots, commands/Finish/deadline concurrency, exact score/time ties, repeated IDs with same/different content, HP reversal, timeout timing, rematch IDs and cancel/void history.
- [x] Apply actual existing SQL criterion evaluator functions in the isolated harness; do not substitute a trivial fixture grader for final scoring proof.
- [x] Implement storage/role helpers, transaction locks, exact grading, safe reads and audited review release. Keep ordinary attempt tables/result counts untouched.
- [x] Use fixed lock order (match then participants/leases in UID order) across start/commit/finish/cancel/settle. Duplicate command ID lookup must distinguish identical retries from different-payload reuse before accepting new events.
- [x] Prove server-key-bearing snapshots and opponent state never appear in student summaries or broadcasts; expose own expected criteria only after eligible full-match release. Persist final per-criterion outcomes with the sealed result; review never regrades finalized history against a future live evaluator.
- [x] Run the harness, including transaction rollback/reapply and grant/search_path assertions. Inspect output before claiming pass.

## Task 3 — Shared assessment leases, deadline settlement and realtime privacy

**Files:** migration 075, SQL harness extensions, minimal existing session helpers as identified by source audit.

**Interfaces:** assessment_type='competition', attempt_id=participant ID, assessment_id=competition ID; existing quiz/CLI APIs unchanged. Claim/assert/heartbeat/release use existing client-ID format and 60-second stale takeover semantics with current role/ban checks.

- [x] Write failing tests that a ready lobby does not reserve a lease, Start reserves both leases or neither, concurrent quiz/CLI/duel starts cannot overlap, and participant submit/cancel/deadline releases only the matching lease.
- [x] Extend explicit database type dispatch and descriptions; no 'else means CLI' path may handle competition accidentally. Preserve 070 content guards and legacy RPC grants.
- [x] Reconcile elapsed competitions on protected reads/actions. Record timeout finish as deadline, not cleanup execution time; reject post-deadline command commits even if a transaction began earlier.
- [x] Add private channel authorization for participants/current authorized host/admin. Broadcast only {competitionId,revision} invalidation notices. Fetch scores/HP/display names through currently authorized RPCs on receipt; clear mounted content on denial. Test class/role/ban changes after a subscription is already established. No client may publish trusted scores; neither score/HP/name fields nor original/private rows enter broadcasts.
- [x] Run negative role, same-browser/takeover, revoked ownership/ban, duplicate/late request and existing ordinary assessment regressions against the real functions.

## Task 4 — Authenticated Edge command execution

**Files:** supabase/functions/cli-duel/index.ts and testable handler; local/test function config only if needed, never secrets or hosted deployment.

**Interfaces:** Edge actions and service-only RPC methods above. Read a real Supabase user via a verified token; never decode a token without verification or trust a body actor ID. A current database ban/ownership/roster check remains required even with a valid token.

- [x] Write failing handler tests for missing/expired/forged auth, extra score/state/timestamp payloads, arbitrary participant IDs, stale sequences, duplicate-ID response replay, unavailable backend and wrong deadline/status.
- [x] Implement authoring context/initialization and authoritative command execution. Return only own state/output plus safe summaries. Never log raw commands, credentials, state, grading keys or JWTs.
- [x] Check Deno module/runtime compatibility when available; Node tests alone cannot claim deployed Edge compatibility.
- [x] Exercise an actual local/test Edge request and real PostgreSQL commit with two authenticated users before closing this task. If local runtime is unavailable, record the unmet check and continue independent frontend work without an auth bypass.

## Task 5 — Host/student navigation, creation and lobby

**Files:** cliDuelService.js; CliCompetitions.jsx/CliDuelLobby.jsx and styles; workspace routing/navigation integrations listed above; focused Playwright tests.

**Interfaces:** transport methods map exactly to safe/public RPCs and authenticated Edge create; missing schema/function reports a contained unavailable state and does not fabricate successful saves. Host candidate lists come only from server-scoped responses.

- [x] Write failing mocked browser tests for admin vs instructor entry points, duplicate students, incompatible practical explanations, duration bounds 1/480/invalid fractional/zero, both-ready Start gating, contained setup errors and role routing after refresh/Back.
- [x] Build compact host lists/Create/History and student Invitations/History pages using current shared layout primitives; show time limit and review setting clearly.
- [x] Add explicit competition routing and resume behavior to student active-assessment handling and Overview. A competition ID must never enter ordinary quiz/CLI storage or terminal paths.
- [x] Ensure lobby details do not reveal instructions/keys before shared start. Selection, requests and response races must not overwrite another match's draft/state.
- [x] Run focused UI tests and ordinary workspace/session routing regressions. Freeze source/docs while each browser run is active.

## Task 6 — Duel arena with authoritative score, HP and pressure timer

**Files:** useCliDuel.js, CliDuelArena.jsx/scoped styles; server transport adapters only, no changes to normal-exam command saving semantics.

**Interfaces:** get player/command/finish/settle; existing browser lease hook with explicit competition type. Shared countdown/remaining time comes from startsAt/deadline calibrated with serverNow. Realtime revisions request a canonical resync instead of adding client-side score deltas.

- [x] Write failing browser tests for common countdown, commands disabled before start, final-minute warning text, correct/incorrect/repeated command display, retry with same ID, stale response isolation, disconnect/resume and deadline closure.
- [x] Render two readable progress/HP panels, focused Cisco terminal, score, remaining time and quiet connection status. Preserve input/focus through score refresh. Respect prefers-reduced-motion; no mandatory sound.
- [x] Keep one command in flight. No queued ranked commands while offline. A network-uncertain command keeps its ID, and resyncs from the server on return; do not retry it with a new ID.
- [x] At zero remaining time disable input immediately, request settlement and fetch canonical results. Server validation must still defeat a tampered browser clock/timer.
- [x] Use explicit confirmation for voluntary partial Finish; 100% automatic completion is server-triggered. A finished student may observe while the opponent continues, without another command path.
- [x] Verify desktop/phone/keyboard containment, private live-summary convergence, HTTP fallback and no opponent-state display.

## Task 7 — Separate competition history, review and final acceptance

**Files:** CliDuelHistory.jsx/CliDuelReview.jsx and styles; docs/CLI_DUEL_ACCEPTANCE.md; progress log; targeted SQL/browser tests and final rollback manifest.

**Interfaces:** finalized safe standings + role-scoped review RPC. Student detailed review is off by default, opens only after whole-match completion and host release, and clears when withdrawn. Reuse device-labelled criteria/command presentation without Final Device State.

- [x] Write failing history/review tests for exact score-first/time-second ranking, exact ties, 100% vs early partial submission, timeout, Did not start, cancelled/voided records, rematch preservation and no normal academic history/count changes.
- [x] Implement participant/host history and audited release/cancel/void actions, with status clearly separated from score. Students never receive opponent logs/keys; revoked review clears mounted detail.
- [x] Complete the two-student real local/test Supabase acceptance: host creates/starts, both ready, commands/HP update, one disconnects/resumes, time expires, results settle and own review follows release. Verify cross-instructor negative cases with a separate teacher account.
- [x] Run full unit suite, lint, build, secret scan, isolated SQL/Edge checks and focused browser regressions in the appropriate sequence. Broaden/repeat only for a change, failure or unresolved concern.
- [x] Request one fresh whole-feature review, fix important findings, and rerun affected checks. Mark any missing real-stack evidence explicitly rather than calling the pilot complete.
- [x] Update acceptance/progress documents and create a checksum-guarded rollback manifest that preserves the prior accepted UI and database/function backup. Leave localhost usable. Do not commit, push or deploy.

## Execution handoff

Owner approved the plan and Native execution on November 16, 2026. Recommended method: **Native** — one implementer in this session, sequential interface-driven tasks, then one independent final review. Alternative: **Subagent-driven** — fresh implementer/reviewer contexts per task, with greater context overhead and independent task gates. Product implementation begins after the owner confirms the plan and execution method, as required by the writing-plans skill.

## Execution ledger

- Task 1 complete: focused missing-module failure observed, shared engine/protocol implemented, six focused checks and the full 114-test suite pass. The canonical simulator was relocated without semantic edits; browser imports re-export the same API.
- Tasks 2/3 in progress: 074 dedicated storage, initial lifecycle/private commit and 075 session integration are being exercised with actual SQL criterion evaluation in isolated PostgreSQL. Initial class/private-read/creation/scoring/HP checks pass; extended negative/deadline/history contracts remain before completion.
- Ruling: command-context RPC includes expected revision and raw command in addition to the original outline, so duplicate IDs with changed content can be rejected before returning a replay response.
- Ruling: the protocol bounds total points to JavaScript MAX_SAFE_INTEGER to avoid inaccurate live HP/point arithmetic; ordinary practical grading is unchanged.
- A Docker Desktop background launch was attempted for the approved local acceptance setup; no hosted services or data were changed.

- November 18 continuation: migrations 001�075 applied successfully to the disposable local stack. Full unit suite 119/119 and lint pass. Host/student UI and arena added; browser launch setup timed out before app assertions, retrying without video capture. No hosted changes.

- Tasks 2�7 implementation/acceptance completed locally on November 18: private persistence/lifecycle, lease/session privacy, authenticated Edge execution, role UI/lobby, authoritative arena and separate history/review are implemented. See CLI_DUEL_ACCEPTANCE.md for exact evidence and the remaining publication boundary.
- Final review: one independent reviewer found no Critical issue; fixed all Important findings (legacy monitoring privacy, post-lock clock cutoff, coalesced refresh and retained uncertain IDs, stable candidate identities, configurable defaults/review, canonical prompt and spectator lease shutdown, retained audit access, explicit duel URL precedence). Shared realtime listener cleanup also fixed; no deferred minors.
- Red/green evidence: protocol impossible-objective check, missing refresh coordinator, ordinary-monitor duel-row exclusion and actual two-connection overdue commit reproduced failures before fixes; subsequent unit/SQL/real Edge/browser checks pass. Snapshot review found desktop input width 69px; scoped grid fix passes the final focused desktop-width/phone/deadline check.
- Ruling: local database acceptance uses a newly created, isolated Supabase project rather than a copy of the hosted database. No pre-existing local database state existed to back up; preserve the source checkpoint and a private post-test database dump. This costs fixture-only data fidelity while avoiding any production data mutation.
- Integration ruling: leave all work uncommitted in the user's existing workspace as already requested; do not ask again about publishing or cleanup. The rollback inventory preserves the accepted pre-duel UI.

- Final verification: 124/124 units, lint/build/secret scan, 7 duel + 15 existing workspace Chromium cases, final width rerun, SQL contracts, actual authenticated Edge, overlapping transaction boundaries and three real browser contexts pass. HEAD is unchanged; leave local preview 5174/55321 and private test accounts available. Source/rollback inventory finalized.
