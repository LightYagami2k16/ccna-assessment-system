# Character popup, random assignment and case-sensitive text grading

> Use superpowers:executing-plans inline. User supplied explicit requirements and authorized execution; no additional approval gate.

Goal: student-only Select character button above own name opens a centered, scrollable native modal. Manual Confirm closes on successful save. Random confirms a server-selected character and closes. Host Start assigns only missing characters atomically; confirmed choices survive retries/countdown aborts and duplicates remain allowed. Both live player sessions are still required. A starting/countdown change closes the picker so it cannot obscure the game. Right-side mirroring stays intact.

Grading: exact letter case for user-defined hostname, domain and VLAN names, matching existing password/banner/description behavior. Preserve IOS keyword and interface-alias normalization. Wrong-case hostname remains valid CLI syntax but earns zero criterion points/damage. Shared SQL evaluator applies consistently to ordinary CLI practicals and duels; retained final results are not rewritten.

Implementation: new082 migration snapshots current control/selection/evaluator functions with private ACLs, adds private random helper, assigns missing characters under existing match lock, wraps text grading using the resolved device state. Preserve081 and all earlier migrations. Add dedicated modal component, refactor Arena/WaitingRoom/Picker and remove host character-ready requirement.

- [x] Save source/private local DB rollback checkpoint; write failing SQL contracts for case sensitivity, random ownership/locking, preservation and auto assignment.
- [x] Implement082; full isolated SQL contracts apply twice; apply only to disposable55321 after private backup.
- [x] Write/update UI contracts for trigger placement, centered popup, random/confirm/close, responsive scrolling and host Start without picks. Implement native modal and state behavior.
- [x] Run147+ unit suite, lint/scan/build, SQL and actual local API scoring/random checks; focused browser verification where environment permits. Read-only independent review; update acceptance/roadmap/rollback hashes.

Constraints: local only, no commit/push or hosted changes; preserve assets/simulator/builder, countdown/versus/presence and scoring semantics except requested case comparison. Checkpoint: %TEMP%/ccna-cli-duel-popup-baseline-20261119. Keep source/docs frozen during browser tests. Prior task's real3-account test was blocked at Chromium blank-page creation; do not assume a rerun passes.

Review fix: delayed-image browser regression reproduced an obsolete confirmation after Close/reopen/Random (two selection requests; late SonGoku overwrote Random). Guard asynchronous confirmation with a per-instance layout-effect liveness ref before dispatch after preload, and suppress obsolete state updates. Parent save already disables reopening through its shared busy state during an in-flight RPC. Add matching-case domain/VLAN successes, both-missing host assignment, Escape/focus and failed-RPC coverage.

API timing note: default real-clock local driver returned to waiting before countdown ended due stale presence under this machine's scheduling. Do not loosen server freshness. Explicit DUEL_FAST_LOCAL_TEST fixture mode advances only disposable DB countdown/versus timestamps through the real SQL settle functions. That mode passed actual selection/auto-assignment, wrong-case hostname zero points/no damage then exact-case points/damage, pause/retry/KO and admission race. This is API/database behavior evidence, not real-time UI acceptance.

## Completion evidence

Completed locally. SQL082 applies twice in isolated contracts; hostname/domain/VLAN mismatches fail and matching values pass, including non-primary device selection. Password/banner/description case behavior and normalized IOS enum/interface behavior remain unchanged. Both-unselected Start assigns two valid characters; one-selected Start preserves it and fills only the other. Unauthorized/wrong-browser/late selection is rejected; repeated Start and countdown abort retain choices. Private helper ACL checked.

Actual local API/Edge/database fixture test passes: Random returns a valid roster ID; host preserves Asta and fills the missing pick; hostname campus yields0 points/no damage against expected Campus, followed by hostname Campus awarding10 points/50 damage for that fixture. Pause/retry/KO/history, concurrent admission/spectator behavior and unchanged academic counts also pass. Fixture timestamps are explicitly advanced only in the disposable DB; this does not establish wall-clock multiplayer acceptance. The default real-clock driver failed closed to waiting under stale presence; production freshness rules were not changed.

147 unit tests, lint, secret scan and production build pass after the cancellation guard. Eight focused Chromium cases pass: trigger above own name, hidden inline roster, centered popup, confirmation/reload, mobile scrolling, missing-pick host readiness, versus/HP mirroring, intro input/resume, image retry, delayed snapshot presence, Random/countdown close, obsolete-image cancellation, server failure and Escape/focus. The race test failed with two requests before the guard and passes with one afterward. Phone popup/versus screenshots inspected. No product edits after the final browser run.

Independent review found oneP2 stale-image confirmation race; fixed and the follow-up review is clean. Remaining optional hardening: an explicit competing Start/selection stress test beyond current row-lock design/sequential contracts. Full real-time multiplayer/browser acceptance remains a manual follow-up on a healthy runtime; do not report the synthetic timestamp fixture as that acceptance.

082 applied twice ONLY to the isolated55321 DB after saving private-pre082-local-db.dump. Source ZIP/manifest, DB backup and guarded rollback inventories preserved. Original artwork, shared simulator, practical builder, all prior migrations and git HEAD unchanged. Logs updated; no commit/push or hosted changes.
