# CLI Duel knockout and host customization — proposed amendment

Date: November 18, 2026. Status: approved by owner for local implementation.

## Intent and confirmed scope

The owner requires a 1-vs-1 duel to end as soon as a player's HP reaches zero. The owner answered yes to expanding customization to configuration objectives/grading and starting HP/damage. We interpret this as both sets of controls; the detailed choices below were subsequently approved for local implementation.

## Approach

Extend the current duel creation screen with an editable, match-specific copy of a compatible practical and combat settings. This reuses the existing supported criterion types and server simulator. The source practical remains unchanged. A separate competition content system would duplicate existing authoring/access/history work; editing the source practical for every match would change reusable academic content. This document proposes the copied-challenge approach.

## Approved host controls

Keep title, two participants, time limit and review policy. Add a customization section for student instructions, the single device's display label/starting hostname, and supported grading objectives (type, target, expected value and points). Add equal starting HP for both players and a damage value per objective. Default HP is 100; default damage is distributed in proportion to objective points. The host can override it. Total available damage must be sufficient to reach zero; starting conditions must not award objectives for free. Only the supported single-device switch/router tasks are in scope.

Instructor selection remains limited to currently owned classes and authorized source practicals; administrators may select across students/classes. Both players use the same frozen challenge and combat settings. Settings lock at Start; changes afterward require a new match/rematch.

## Approved combat and end rules

The server verifies every command. An objective deals its configured damage the first time that player satisfies it, at most once per match. Repeating the command or undoing/reapplying it cannot farm damage. Damage is permanent during the match; undoing configuration can still reduce the player's current grading score. This separates combat damage from the existing state-based assessment score.

At HP zero, the server atomically records knockout, seals both players' latest verified work, releases both leases and closes the match. No later command can change HP, score or winner. The player who caused the knockout wins even if not every grading objective is finished. Serialize rival requests under the match lock so overlapping requests cannot produce two winners.

If the deadline arrives first, keep the approved score-first/finish-time-second standings with exact ties sharing placement. Knockout before the deadline wins; a command accepted after the cutoff cannot create a knockout. The screen explains the distinction between knockout victory and timeout standings. For a voluntary Finish, retain the current confirmation and lock that student's commands; the opponent may continue until knockout, their own Finish, or the shared deadline.

## History, review and compatibility

Persist frozen custom objectives, starting HP, damage per objective, first-earned objective hits, HP remaining, winner and end reason (knockout/time expired/both finished/cancelled/voided). Retain scoring/audit events and the existing own-only review release/withdrawal behavior. Do not expose opponent state/commands or unreleased keys.

Version the new combat rules for newly created matches. Preserve completed pilot histories and the original academic practical. Use a forward local migration rather than rewriting already applied history. Keep the existing trusted simulator, authentication, scope checks, deduplication, clock cutoff and one-active-assessment safeguards. Continue local-only on the isolated stack, with no commit, push or hosted deployment.

## Verification and approved decisions

Cover first-hit damage, repeat/undo/reapply, custom challenge validation, equal starting HP, immediate bilateral input locking, overlapping knockout requests, deadline boundary, timeout ranking, immutable history and scoped authoring. Preserve the current pilot checkpoint before implementation. Update the development log and rollback inventory after changes.

The owner approved the copied challenge editor, one-time permanent objective damage, and knockout taking precedence over score. Implementation and the recorded local verification are complete.

Owner approved the written amendment and local implementation. Native execution continues.
