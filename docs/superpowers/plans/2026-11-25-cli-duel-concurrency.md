# CLI Duel concurrency implementation plan

> Execute inline with superpowers:executing-plans; user approved the proposed concurrency solution. No commit, push or hosted deployment is requested.

**Goal:** Keep CLI drafting usable and verified operations correct with eight simultaneous matches.

**Architecture:** Reduce idle traffic and stop hidden parent polling. Separate drafting from submission authorization. Add migration 085 with a nonlocking settlement fast path for healthy active matches, lightweight presence, and cursor-based player logs. Preserve countdown/versus acknowledgements, deadline/KO sealing, exact retries, authoritative revisions and permissions. Use a minimal stateless fetch adapter inside the worker; distinguish local worker policy from hosted capacity.

**Stack:** Existing React/Supabase/PostgreSQL/Playwright; no added dependencies.

## Constraints and review focus

- Never replay uncertain commands with new IDs or award client-side points.
- Explicit access denial removes private state and disables both drafting and submission; transient failures may preserve a draft but cannot permit execution.
- Pausing, terminal state, lease loss, deadlines and countdowns still block submission.
- Log deltas must merge across slow reads/newer command ACKs without losing earlier entries or leaking other players' logs.
- Future evaluator changes and final full grading remain guarded by migration 084.

## Tasks

- [x] Write failing unit tests for drafting/submission policy and cursor merge; implement helpers and wire console/arena. Verify transient errors preserve typing while denied/terminal states stay locked; uncertain commands require exact retry.
- [x] Reduce active polling/presence frequency, skip hidden polling, schedule after completion, stop parent polls while child arena is shown. Verify lifecycle and browser tests.
- [x] Add failing SQL contracts, then migration 085: fast-path healthy active settlement, due-only actor settlement, lighter presence outside countdown, private log cursor plus protected incremental player reader. Keep old RPC behavior compatible. Run full duel contracts and repeat-install checks.
- [x] Add incremental command-response support and merge transcript deltas. Remove the remote SDK startup graph; measure actual Edge behavior and worker policy without silently changing local/hosted capacity limits.
- [x] Run unit, lint, security and build verification. Apply only to disposable local database/functions, reproduce eight active matches, check active input, actual accepted revisions/score/HP, errors and cleanup. Review changes and record evidence/remaining limits. Leave source uncommitted.

## Verification ledger

- 183 unit tests pass; lint, repository secret scan and production build pass.
- Isolated SQL contracts apply085 twice and cover read-only lease tuple identity, cursor isolation/legacy compatibility, class/browser permissions, private helper ACLs, deadline sealing, pause/resume, actual simulator outcomes, exact retries, knockout and cache cleanup. A baseline broadcast flag deliberately fails the navigation-notification regression; final migration passes it.
- Real two-connection regression first failed because presence held the lease while waiting for the participant. Participant-before-lease locking fixed it; the final read-only presence path also passes. Its fictional fixture is restored.
- Browser regressions cover editable drafts with submission disabled during transient errors, automatic bounded overload retry, explicit uncertain transport retry, stale ACK/authorization isolation, mode prediction, HP/ports, mobile geometry, host controls, parent polling suspension, independent presence and phase changes without false departures. The temporary runner uses the installed headless Edge channel; the bundled headless Chromium stalled during page setup before loading the app. It uses the repository's15-second assertion timeout.
- Independent read-only review found one lock-order blocker, reproduced and corrected. Follow-ups approved the adapter, read-only guards, phase timing and retry/notification deltas.

Ruling: replace the Edge Supabase SDK with native authenticated fetch calls — the first improved UI run still hit local worker boot/CPU failures; auth remains an authoritative Auth user lookup, protected RPC calls use an explicit allowlist, and auth outages return503 rather than revoking sessions.

Ruling: coalesce notifications120ms and suppress only zero-score-delta command broadcasts — command rows/revisions/events remain complete; real scoring, objective damage and lifecycle events still notify. Hosts retain fallback log polling. Server limits, pool size and worker policy are unchanged.

Ruling: retry temporary HTTP429/500/503/504/546 at most twice with500/1000ms plus jitter and the same command identity — permission/disposal checks prevent retries after pause, denial or leaving. Unknown transport/502 and definitive errors remain explicit; exhausted retries remain explicit. No fresh drafts are automatically replayed.

Ruling: preserve presence across phase changes — changing timer cadence must not send an arena departure; a phase ref throttles active HTTP while keeping750ms countdown cadence. Visibility/unmount departure and late-response cleanup remain.

Ruling: routine player reads and presence validate the existing lease without writing it — dedicated20-second heartbeats and verified commits maintain it. SQL ctid regressions demonstrated the unnecessary writes and now prove they are absent. Mutation lease locking and strict three-second countdown freshness remain.

Local load reports are ignored artifacts under test-results/duel-concurrency. Intermediate runs exposed remaining worker/pool limits and one safely aborted countdown. The final acceptance run must verify all eight matches actually reach active state before measuring typing and score parity; any host restart of a safe abort must be reported. Hosted deployment is not part of this task.

Final acceptance: the latest actual countdown run confirmed all eight matches active before45 seconds of simultaneous commands. It required one host restart of a safely aborted countdown. Active-phase inputs:0 disabled and0 missing across144 sampled states;287 typing/submission attempts with0 typing failures. Seven raw HTTP errors occurred (six Edge failures handled by bounded retries and one host workspace statement timeout). API medians still reflect constrained local capacity, not a latency guarantee. At the45-second cutoff,15/16 participants had at least three accepted revisions; after remaining in-flight work finished, all16 had at least three revisions and configured hostnames. All final stored scores matched the full grader. Reports: ignored accepted-report.json and terminal database verification. All fictional diagnostic matches were cancelled; ended caches and academic attempt counts were checked. Source remains uncommitted; hosted Supabase is unchanged.

Final countdown refinement: presence writes take only the participant lock in host-controlled waiting/countdown/paused/active states. Explicit countdown departure retains match-first abort locking. Readers advance due boundaries after committed heartbeats; healthy future countdown reads avoid match locks, and actor-wide reconciliation ignores future boundaries. Freshness remains three seconds before start, and both post-boundary acknowledgements remain mandatory. Real held-match tests cover countdown heartbeats and active reads; read-only review found no blocker.
