# Full CLI Practical Builder for CLI Duels — Implementation Plan

**Goal:** Reuse the actual practical configuration editor and all supported practical devices, topology and criterion capabilities in duels; retain HP, per-criterion damage and player selection as duel additions.
**Reference:** Owner explicitly selected full builder/capabilities, beyond matching layout. Existing approved knockout rules remain binding.
**Architecture:** Extract shared practical configuration UI/controller/model from InstructorCliLabBuilder, consume it from both workspaces, and extend trusted simulator transport with version3 device/PC operations. Forward migration077 admits fully validated copied/blank configurations without writing academic practicals. Preserve old match versions.
**Method:** Existing owner-approved Native workflow, one implementer and one final independent review. Local only, no commit/push/hosted changes. Use the current checkpointed workspace. Owner's explicit reuse/full-capability selection supplies scope; implementation details are delegated to the agent rather than requiring another permission loop.

## Constraints and contracts

- Up to12 routers/switches/PCs, physical links, complete practical criterion catalog and applicable quick presets; same device editor, device filter, expandable criteria, labels/help/duplicate/remove controls.
- Reuse course/module/title/description/instructions/duration configuration. Academic publishing, class assignments and retry controls are not duel actions; preserve them in the ordinary practical builder. Duels keep separate history, roles/classes, review and KO rules.
- Support both blank configuration and loading a permitted practical/rematch as a starting copy. An optional source never writes or publishes the original academic practical.
- Commands are server executed. New request operation includes selected device and command or PC settings/DHCP intent, never state/score. PC commands, DHCP, routing/probes and remote SSH use the existing canonical simulator behavior.
- A participant's global sequence/revision and exact canonical request identity cover all device operations; changed device/settings on a reused command ID must fail. Locked lease, cutoff, duplicate-after-KO and one-winner rules remain.
- Freeze device IDs/topology/objectives/damage together at creation; history has accurate per-device command metadata and grading. Keep v1/v2 behavior and records intact.
- Maintain app-source/docs freeze during browser checks; build/browser sequential. Preserve checkpoints and source originals; update logs and guarded rollback inventory.

## Task1 — Shared practical editor
- [x] Write failing browser checks for full duel device/PC/topology/preset/criteria editor and direct blank creation.
- [x] Extract shared model helpers, controlled editor hook and pure configuration fields. Replace only the normal builder form block/controller with shared pieces; retain existing library, save and review logic.
- [x] Replace small duel-only editor with shared fields, per-criterion damage extension, HP/player controls and optional template loader. Preserve damage by criterion identity on duplicate/remove/type/device edits.
- [x] Run ordinary builder navigation/filter/publish tests and duel form checks; verify source practical is never saved by duel actions.

## Task2 — Full trusted device operations
- [x] Write failing protocol/engine tests for multiple device maps, router/switch/PC applicability, link validation, full criterion catalog, DHCP/probes/SSH parity and immutable input.
- [x] Add version3 shared preparation and operation execution using the canonical simulator; share criterion catalog/applicability, don't fork command semantics. Validate complete request payload and PC settings, include device/operation in retry identity.
- [x] Extend Edge creation/context/commit selection and only return own state plus safe standings.

## Task3 — Version3 database and persistence
- [x] Write failing SQL tests for full copied/blank creation, course/module scope, all device criteria, topology validation, no free initial credit, legacy isolation and metadata-aware retries.
- [x] Forward077 adds rules3, full authoring/workspace contracts, safe definition validation, per-device command metadata/request identity and wrappers around protected command commits. New capabilities retain permanent hits, knockout, timeout and privacy policies.
- [x] Actual local two-student scenarios cover multidevice configuration, PC static/DHCP/probes, KO from a non-primary device, exact repeated operations, concurrency/lease/deadline and source/history preservation.

## Task4 — Arena and final acceptance
- [x] Device tabs, device-specific canonical prompts/logs, topology summary and PC configuration/CMD views in duel arena, via trusted transport only. Reuse normal practical field conventions.
- [x] Full units, lint/build/scan, isolated SQL, normal builder and duel Chromium regressions, real local multi-context acceptance and desktop/phone screenshots.
- [x] One final independent whole-feature review, regression fixes, logs/rollback update. Leave local5174/55321 usable, no publishing.

## Review focus

- Extracting shared editor must preserve ordinary draft, device removal/link cleanup, preset scope and academic save payload.
- Criterion reorder/duplicate/removal must preserve the corresponding damage; no foreign device/criterion identity on creation.
- PC/remote SSH can mutate more than the selected device; commit every canonical affected state and preserve the issued-device command log.
- Same command ID with changed device, operation, PC settings or DNS must fail, even after knockout/lease release.
- Blank creation must require host/course/module authorization; old version definitions cannot be submitted through a new operation path to evade guards.

## Execution ledger

- Full capability scope explicitly selected by owner. Prior v2 checkpoint and guards verified; new source checkpoint in temporary ccna-cli-duel-full-builder-baseline-20261118.
- Tasks1–4 complete locally;138 unit,11 duel and3 ordinary builder Chromium checks, isolated SQL, lint/scan/build and real API/browser acceptance pass. DHCP/probes/remoteSSH verified through the canonical engine; real database test covers static PC plus advanced router objectives. No hosted changes.
- Ruling: shared configuration excludes academic publish/assign/retry actions in duel mode because those controls would otherwise imply academic writes. Existing practical behavior remains unchanged.

- Final independent review completed. Corrected additive objective identity, unattainable values using canonical command probes, line/ACL alias deduplication and operation retry reconciliation; JS/SQL regressions pass. Generic starting state/zero credit and legacy behavior retain protected database checks.
- Superseded CliDuelCustomization component removed; both creation flows use CliPracticalConfigurationFields. Checkpoint and pre077 dump retained; logs/rollback inventory updated.
