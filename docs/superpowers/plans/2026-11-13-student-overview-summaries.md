# Student Overview assessment summaries

**Goal:** Show current unfinished work, available quizzes/practicals, and upcoming scheduled work; never present a failed session lookup as no active attempt.

**Architecture:** Keep the active-session authority in StudentQuizArea and preserve the existing server-side assessment/session guards. Overview availability uses existing student-scoped listing and archive/lifecycle RPCs; exclude archived, exhausted and in-progress assessments from ready-to-start counts. Fetch the categories independently with partial-error and stale-data handling. A new read-only migration 069 exposes authorized future quiz windows, respecting assignment/accommodation overrides and active class membership. Existing CLI practicals have no schedule columns; do not invent CLI schedules. One overview refresh action plus quiet visible-page interval/focus refresh; no new per-card refresh buttons.

**Scope:** Titles/counts and links for available work, actual opening times for upcoming quizzes, verified resume card, checking/unavailable status, clear no-attempt wording, unknown initial counts. Retain populated data through failed refreshes. Existing destinations become Results/history, My classes, Exam guide; the two availability cards provide quiz/practical navigation without duplicate shortcuts.

**Constraints:** All local, no commit/push. Migration prepared and isolated-tested only, not applied to Supabase. No new dependency. Active attempt players and integrity/session ownership enforcement remain unchanged. Upcoming unavailability must not block existing availability summaries.

- [x] Observe a failing overview-summary browser regression.
- [x] Add testable availability classification and student overview services/state.
- [x] Add summary UI and safe active-session loading/error/freshness handling.
- [x] Prepare and isolated-test migration 069 for authorized upcoming quiz windows.
- [x] Verify session missing/error/active quiz/active CLI, archive/attempt rules, empty/partial/stale states, refresh/polling/navigation and responsive layout.
- [x] Run lint/build/appropriate regressions, independent review and visual QA; update roadmap and acceptance documentation.

Verification: original missing-summary regression failed before implementation; all 99 unit tests, 14 Chromium browser scenarios, lint, production build and diff checks pass. Isolated SQL harness passes without changes to the source database. Independent review found no actionable issues. Desktop and 390px screenshots inspected. Real authenticated acceptance and migration 069 application remain pending; no commit or push.

## Requested follow-up: student refresh cleanup

Remove routine student refresh buttons, including the overview action introduced above. Use contextual Retry after failures. Preserve initial and post-action loads; refresh histories when focus returns and availability/enrollment every 30 seconds while visible. Pause list refreshes during active practicals and related actions. Remove obsolete history-parent refresh state. Verify no routine controls, focus/poll freshness, retained content/expansion/drafts, error recovery and timer cleanup; update acceptance documents and roadmap. No migration, commit or push.

Follow-up verification: observed the no-routine-controls browser check fail against the previous Overview button before implementing the cleanup. Afterward, 19 Chromium browser checks, all 99 unit tests, lint, production build and diff checks pass. Authenticated owner acceptance remains pending; no commit or push.
