# CLI Duel characters implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task in this session.

**Goal:** Add cosmetic character choice and a fair synchronized versus introduction.
**Architecture:** Approved artwork catalog, authenticated participant selection, server-gated countdown/introduction, shared character UI across student/host/history.
**Tech Stack:** Existing React, CSS, Supabase/PostgreSQL, Node tests and Playwright. No new runtime dependencies.
**Spec:** docs/superpowers/specs/2026-11-19-cli-duel-characters-design.md

## Constraints
Local only; preserve current working folder through source/private local DB checkpoint. No commit/push/hosted mutation. Keep practical builder/simulator/scoring untouched. Filenames determine names; duplicate selections allowed. Respect reduced motion and scrolling.

## Review focus
- Wrong student/browser attempts to select; invalid character IDs.
- Concurrent Start and selection; choices lock at countdown.
- Disconnect during versus, elapsed acknowledgements and no early command/time loss.
- Legacy matches, resume and reload don't replay versus.
- Wide artwork, phone layout, image failure and reduced motion.

## Tasks
- [x] 1. Save checkpoint; write failing SQL contracts for allowlist/ownership/locking/duplicate selection and two-second timer gate. Extend shared catalog unit contracts for stable IDs and versus phase selection. Run red.
- [x] 2. Implement migration081: selection RPC; preserve existing ACLs; extend summaries/history; new-match flag; countdown-to-versus-to-active gate, disconnect reset and no replay on resume. Run SQL green, apply twice only to disposable55321 after private backup.
- [x] 3. Copy original supplied assets; implement scrollable keyboard-accessible selection, shared character render/versus modal; host gating, HP portraits and outcomes/history. Add browser contracts first and run red/green.
- [ ] 4. Run unit suite/lint/scan/build sequential to browser tests; verify local API/two-browser lifecycle, reduced motion, responsive layout, scrolling and image handling. Review changed code, fix important findings; update logs and all rollback inventories.

## Execution ledger
Ruling: user has explicitly approved the recommendation and requested execution; proceed without another approval gate. Implement in the existing local workspace to preserve localhost testing; checkpoint all current source files first. No source changes during browser verification. Source checkpoint: %TEMP%/ccna-cli-duel-characters-baseline-20261119.

Owner steering: mirror right-side character artwork only across waiting/versus/paired gameplay; labels and controls remain readable. Use CSS individual scale so mirroring remains during hit animation. Read-only independent review found no important security/timing issues; fix minor same-character preview recovery after transient image failure.

Diagnosis: actual browser countdown returned to waiting before versus. A focused delayed-snapshot browser contract reproduced presence gaps of3748ms (over the server's3-second freshness window) because the presence loop awaited full data refresh. Decouple refresh from presence request completion, keeping coalesced snapshot reads and all server safety thresholds unchanged. Source remains frozen during browser testing; the earlier cold-server red batch timed out before app controls loaded and was interrupted, not recorded as assertion evidence. The warm-server delayed-refresh test failed at its intended assertion before the fix.

## Verification and completion record

Implementation complete locally. Five focused Chromium checks pass on the warm5174 demo: all15 roster choices/confirmation and reload, host gating and mirrored mobile versus/host gameplay, no input during intro and no replay on resume, same-character recovery after transient asset failure, and presence continuity during a3500ms snapshot delay. Inspected phone selection/versus screenshots; artwork faces inward and text remains readable. The delayed-refresh case failed at3748ms before the one-line presence fix and passes afterward. The original initial-feature test failed because character selection did not yet exist; later cold-server red checks timed out before app controls and were not counted as assertion evidence.

147 unit checks, lint, secret scan and final production build pass. Isolated SQL contracts apply081 twice with074–080 regressions: allowlist, own-browser/student checks, duplicate selection, confirmation locking, full exam duration after intro, departure reset, retained history/re-entry, resume without replay and anonymous RPC denial. Actual local API/DB acceptance passes real five-second countdown plus versus, pause/frozen time, retries/KO, submitted spectator/concurrent admission and unchanged academic counts. No prior migrations, practical builder or simulator changed.

Independent read-only review and follow-up found no important issues. The minor latched image fallback was fixed by remounting the preview after successful preload. Review suggestions for further dedicated race/grace-period stress coverage remain future hardening; current selection/Start serialization, missing-presence handling and post-boundary acknowledgements are exercised by existing contracts.

Final real three-account UI acceptance is NOT marked passed. An initial run reset at the countdown boundary; the independently reproduced slow-refresh heartbeat coupling was corrected and regression checked. The next run stalled before game interaction and was interrupted. A diagnostic rerun then timed out at blank browser page creation before loading the app, and browser cleanup also timed out. This environment limitation does not establish acceptance of the complete live browser scenario. Remaining task4 item: repeat that real-account scenario when Chromium page creation is healthy; manual local testing can proceed now.

Source ZIP/manifest and a private pre081 local DB dump are preserved under %TEMP%/ccna-cli-duel-characters-baseline-20261119. All guarded rollback inventories updated. Migration081 applied twice only to the disposable55321 stack; no hosted mutation, commit or push. No new animation library or generated artwork. Original15 PNGs are copied byte-for-byte; image requests use lazy thumbnails and cached selected artwork. Test/plan/log artifacts retained locally.
