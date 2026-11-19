# CLI Duel Knockout and Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Let authorized hosts customize a copied single-device challenge and HP/damage, with authoritative first-hit knockout ending both attempts.
**Architecture:** Extend strict shared request/definition helpers and the authenticated Edge create path; add forward migration 076 with versioned match combat/hit history and safe authoring RPC. Keep legacy match snapshots/academic attempts intact. Extend the current host form and arena/history using safe summaries.
**Tech Stack:** Existing React/Vite, shared Cisco simulator, Supabase PostgreSQL/Edge and Node/Playwright.
**Spec:** docs/superpowers/specs/2026-11-18-cli-duel-knockout-customization-design.md (owner approved).

## Global Constraints

- Local only; no commit/push/deployment/production writes. Preserve the original practical and existing pilot history.
- Native execution persists from the approved workflow. One fresh final review, no implementer agents.
- Supported single-switch/router objectives only; identical frozen challenge/combat settings for both players.
- Server verifies commands, once-per-objective damage, immediate atomic knockout, score/time timeout fallback.
- Reuse existing session, role/ban/class, private-read, deduplication and late-write safeguards.
- Keep app source/docs frozen during browser tests and run build/browser sequentially.

## Review Focus

- Two commands completing rival lethal hits concurrently must yield one winner and one sealed result (Task 2 real DB).
- Editing/removing/reordering an objective must not detach its damage or reveal another match's key (Tasks 1/3).
- Lost knockout response retry must remain idempotent after both leases are released (Task 2).
- A custom initial hostname must not award free points, and damage budget must permit knockout (Tasks 1/2).
- Existing completed/active v1 matches retain original behavior, while new v2 timeout/void/review preserve evidence (Tasks 2/4).

### Task 1 — Strict custom definition and combat protocol
**Files:** shared cliDuelProtocol.js; handler.js; cliDuelProtocol.test.js and cliDuelHandler.test.js.
**Interfaces:** create optionally accepts rulesVersion:2, customization:{instructions,deviceLabel,initialHostname,criteria}, combat:{startingHp,damage:[number]}. Export prepareDuelDefinition(base,customization,combat) and defaultDuelDamage(criteria,hp). Version 2 criterion objective IDs are assigned from frozen ordinal, never browser-trusted identity.
- [x] Write failing tests for copied source immutability, supported edits, bounds/two-decimal HP damage, insufficient budget, malformed extras and aliases.
- [x] Implement whitelist/normalization, 1–10000 whole starting HP, 0–10000 damage per criterion with two decimals, nonzero sufficient total; zero damage is scoring-only. Default proportional cent allocation sums exactly to starting HP.
- [x] Edge validates the prepared definition, creates matching initial state and sends the original source fingerprint plus strict payload to the protected database creator. Raise create body limit to 128KiB; retain 500-character command bound.
- [x] Focused Node tests pass with legacy create tests unchanged.

### Task 2 — Versioned authoritative combat and persistence
**Files:** new 076_cli_duel_knockout_customization.sql; SQL and local boundary tests.
**Interfaces:** new get_cli_duel_authoring(p_lab_id,p_rematch_id) returns authorized source definition only to current host scope. Add starting_hp/rules_version/end_reason/winner_participant_id and private unique objective-hit records. Keep existing safe/public RPC signatures.
- [x] Write failing SQL contracts: custom creation/source unchanged, first-hit/repeat/undo/reapply, budget/free credit, lethal sealing of both/leases, late and duplicate requests, exact timeout fallback, v1 preservation.
- [x] Implement server-side whitelist preparation equivalent to Task 1, safe authoring, v2 create and HP summaries from permanent earned hits. Private helper/table access revoked; no client supplied state or damage commits.
- [x] On verified accepted state, record first newly met objectives under existing match lock, apply damage once, atomically seal both and assign knockout winner; skip v1 auto-finish path for v2 until KO/manual finish/deadline. Check cutoff after all ranked work. Non-KO completion retains score/time ranking and records reason.
- [x] Run isolated SQL, local actual Edge creation/commands, and two-connection lethal/timeout/duplicate boundary tests.

### Task 3 — Host editor and arena/history presentation
**Files:** new CliDuelCustomization.jsx; CliCompetitions.jsx; cliDuelService.js; CliDuelArena/Lobby/Review and scoped CSS; focused Playwright tests.
**Interfaces:** host retrieves safe source authoring for the selected practical/rematch, edits copied device/instructions/objectives and matching damage locally, sends rulesVersion2. Student summary gets numeric hp/maximumHp/rulesVersion/endReason/winner, never private criteria before review.
- [x] Write failing browser tests for editable copies, damage budget, stale authoring selection responses, matching payload, HP display and bilateral terminal lock/KO winner.
- [x] Build compact collapsible objective editor with points/damage per objective, add/remove supported types, explicit Reset from practical and proportional damage action. Host's title/time/players/review remain available. No academic source save.
- [x] Update arena meters for custom max HP and permanent damage explanation; show winner/end reason in arena/lobby/history and frozen hit evidence in review timeline. Preserve v1 labels.
- [x] Run focused browser checks on desktop/phone and existing duel/routing regressions after build.

### Task 4 — Local integration, review and recovery record
**Files:** acceptance/spec/roadmap/log/rollback inventory; local scripts.
- [x] Apply/serve only disposable local 55321 stack and leave demo5174 usable, preserving fixture accounts.
- [x] Run full unit/lint/build/secret scan plus actual local two-player combat/custom authoring/history/review and concurrent KO checks. Inspect desktop/phone screenshots.
- [x] One independent final review; fix important findings with regression tests, no further implementation approvals.
- [x] Update logs and checksum-guarded rollback inventory; preserve both original pre-duel and pre-knockout checkpoints, no git mutation.

## Execution ledger

- Owner approved the concrete amendment and local implementation. Ruling: retain the already selected Native method and proceed without another routine permission loop; developer instructions prioritize existing session authorization over skill handoff conventions.
- Checkpoint: temporary ccna-cli-duel-knockout-baseline-20261118/working-folder.zip plus SHA256 manifest; prior rollback guards verified first.
- Ruling: new fields are optional to support legacy callers/tests; only rulesVersion2 enables new combat. Existing rows remain v1. Damage uses hundredths; zero is scoring-only, default budget allocated by largest remainder, current score can fall while previously dealt damage persists.
- Tasks 1–4 complete locally; no hosted publication.

- Verified 130/130 Node checks, lint/build, migration 076 applied twice in isolated PostgreSQL, legacy v1 regression contracts and real authenticated Edge/DB custom combat acceptance. Ten Chromium duel cases pass, including custom payloads, rematch settings and voided UI.
- Final independent review completed. Fixed workspace initialization reference, attainable expected whitespace, exact decimal allocation parity, locked lease ownership/expiry, correct cancellation/void/finish reasons, rematch defaults, v2 explanatory text and visible objective-hit history. No additional reviewer is needed; regression proof covers the fix pass.
- Red/green evidence: missing customization exports, editor absence, v2 rematch HP resetting to100, KO remaining current after void, fractional default mismatch [1,1,4], double-space expected value accepted, and actual release racing lethal damage all reproduced failures before fixes. Subsequent affected unit/SQL/real Edge/browser checks pass.
- Ruling: exact cents use decimal BigInt in JS and div/mod numeric remainders in SQL, avoiding binary tie differences. Expected configuration strings must use canonical single spaces because the simulator collapses command whitespace; invalid values are rejected rather than silently editing a source practical.
- Ruling: terminal reason is derived from sealed participant timestamps/status, and void/cancel clears a current winner while preserving the original knockout in audit events. Source selection and rematch draft keys prevent stale authoring responses from being submitted.

- Final real three-context browser acceptance passed with custom200HP, independent student configurations, opponent HP convergence, reload/resume, immediate bilateral knockout, both terminals removed, no stale spectator lease error after21seconds, standings and live review withdrawal. Desktop/phone authoring and arena screenshots inspected.
- Final verification:130 unit checks,10 Chromium duel cases, lint/build, secret scan/diff checks, isolated076 + legacy contracts, real authenticated Edge/SQL concurrency and lease-release races pass. Prior builder/spacing/routing/canonical simulator hashes match the working pilot. No review findings deferred.
- Recovery: both source checkpoints are preserved; pre076 local database dump is stored privately alongside the pre-amendment checkpoint. Final rollback inventory includes a separate knockoutCheckpoint section so either the amendment or full pilot can be backed out after hash verification. HEAD unchanged.
