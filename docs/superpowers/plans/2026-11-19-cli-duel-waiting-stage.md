# Waiting arena, full-window battle and winner celebrations

Owner explicitly requests: newly created host arena must be a waiting room like both players; hide dual terminals/task until the five-second Start countdown completes; full-screen gameplay; remove points from player outcome popups; lightweight victory fireworks; host popup naming winner. Continue local-only, no commit/push or hosted changes.

Ruling: fill browser viewport automatically with a dedicated arena stage for host/players, independent of workspace sidebar. A direct Enter fullscreen button requests true browser fullscreen (browser requires user gesture); exits restore workspace. Keep pause/resume and host-independent match lifecycle unchanged. On pause/resume after first start, preserve the battle display behind its overlay. Results use canonical winner ID for KO, placement for timeout/other finishes, tie names for shared first. Native accessible centered dialogs; finite CSS fireworks only on victory, suppressed under reduced motion. No database or scoring changes.

- [x] Browser contracts: pre-start host/player waiting room has no task/terminal; after countdown full-viewport battle, host fullscreen control, leave restores workspace.
- [x] Implement dedicated stage, shared waiting room, host battle gating and winner popup, points-free player outcomes and lightweight fireworks.
- [ ] Verify winner/tie naming, pre-start/active/paused/results, popup centering/reduced motion, reload/leave, normal builder and legacy regressions; lint/build/units and real3-account UI acceptance.
- [x] Logs, guarded source rollback inventories; preserve local080 backend untouched.

Checkpoint: %TEMP%/ccna-cli-duel-waiting-baseline-20261119. Source freeze during browser testing; builds and browser runs sequential. Implementation and focused verification completed; final live three-account rerun remains pending as documented below.

Owner steering: ensure mouse-wheel and scrollbar scrolling in the game. Add a regression for terminal scrolling and wheel chaining to the stage at a terminal boundary; preserve a user's position when reading older log output. Keep body/workspace isolation but allow the dedicated stage to scroll.

## Execution ledger

Implemented the shared waiting room and viewport-filling stage, explicit browser fullscreen control, battle gating until the initial countdown completes, canonical winner selection, points-free result dialogs, named host winner and finite CSS victory fireworks. Reduced motion suppresses fireworks. Focus and workspace scrolling are restored on leave; the initial host loading/error view includes a Leave arena escape.

Mouse-scroll regression reproduced a jump to the newest output when reading older history. Fixed by following output only when already near the bottom, removing mouse-down cancellation, preserving native scrollbar interaction and allowing terminal-boundary wheel scrolling to chain into the arena. The stage owns its vertical scrollbar while the background workspace is isolated.

Verification: 144 unit checks, lint, secret scan and production build pass. 18 distinct Chromium regressions passed across ordinary builder, legacy duel, full-builder and host arena coverage; a final three-case focused batch passed after the scrolling fix. Cases include desktop/phone scrolling, native fullscreen entry/exit, waiting task privacy, countdown/battle transition, pause, canonical knockout winner, named host popup, no point totals, reduced motion and spectator entry. One independent read-only review completed; missing player battle gating and placement-based knockout outcome were corrected. The early host error escape was subsequently implemented and build/lint verified, but its new browser assertion could not complete because Chromium stopped opening pages.

Final real three-account acceptance remains pending: the first rerun failed closed at the intended disconnect/restart countdown boundary, so no backend safety threshold was weakened. Reconnection stabilization was added to the test driver, but a later browser startup failure prevented the rerun. The prior host-controlled backend acceptance remains historical evidence, not acceptance of this UI amendment. No database changes were made. Source checkpoint and all guarded source inventories updated; no commit, push or hosted updates.
