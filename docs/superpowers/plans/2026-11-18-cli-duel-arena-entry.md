# CLI Duel arena entry and presentation plan

Goal: course/module-free duel setup, familiar CLI Practical attempt layout, both players inside before a shared animated5-second countdown, consistent duel spacing/actions.

Authorization: owner explicitly requested these concrete changes, continuing the local-only workflow. Execute inline, no commit/push/hosted migrations. Preserve existing practical builder and legacy matches. Source checkpoint: temporary ccna-cli-duel-arena-baseline-20261118; preserve local DB before078.

Architecture: forward078 gives new full-builder duels an arena-entry gate. Host opens a waiting arena, existing leases reserve both students, and authenticated own-browser arena presence starts a server-timed5-second countdown. Instructions/state remain sealed until play starts. Leaving before start returns to waiting; stale/disconnected presence cannot start play. Reload/re-entry during active games keeps the original deadline. A shared canonical server remains authoritative for commands, damage and outcomes.

Ruling: reuse existing practical terminal CSS/markup and device/PC controls with trusted duel transport; do not replace transport with the ordinary client-scored academic path. Course/module omitted in duel serialization, optional in full-definition validation for compatibility with older snapshots; academic fields unchanged.

- [x] Add failing JS/browser/SQL contracts for absent course/module, two-player admission, five-second shared start, no early commands/finish, reload/leave/role guards.
- [x] Implement optional duel academic metadata and forward078 waiting/admission/presence state with private guards and safe summary; preserve legacy behavior and ACLs.
- [x] Match arena practical terminal/instructions/device/PC presentation, inline Enter commands, countdown overlay/reduced motion, tidy host/list/lobby/setup controls.
- [x] Run units, SQL, lint/scan/build then browser regressions; real local two-player admission/KO/review. One final independent review, logs/rollback hashes. No source edits during browser tests.

Review focus: simultaneous entry, stale or wrong browser, early commands/finish, leaving during countdown, first-player wait without timer, cancelled/completed immutability, legacy data, phone terminal containment and ordinary builder preservation.

Execution ledger: completed locally.139 units,15 Chromium regressions and final3-case visual/arena rerun pass; SQL078 repeated and all new/legacy contracts pass; lint/scan/build and final real3-account browser acceptance pass. Existing requirements completely specify the interaction; continue without an additional approval gate.

- Independent review: fixed elapsed-countdown departure resetting an already-running game (observed SQL regression red then green); restored scroll containment/auto height through900px. Verified transparent inline terminal input and reduced-motion countdown.
- Ruling: waiting phase reserves normal assessment leases for one day so another assessment cannot overlap; host cancellation releases them. Existing live/history matches keep their launch rules; new and unstarted full-builder lobbies use the admission gate. No source edits during browser runs.
- Source checkpoint/pre078 local DB dump preserved; roadmap, acceptance and all guarded rollback inventories updated. No commit/push/hosted changes.
