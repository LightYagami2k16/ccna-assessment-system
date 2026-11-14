# Consistent Initial Loading and Refresh Feedback

**Goal:** Apply the approved contained initial-loader / retained refresh-content pattern to the audited instructor, student and administrator screens.

**Architecture:** Shared useDataLoadState tracks request activity separately from successful first data load. DataLoadBoundary replaces only the body before first success and preserves the populated child subtree during later refreshes. RefreshButton provides compact, disabled, animated feedback. Counts remain unknown (—) until the first successful load. Existing parent heading/navigation and local expansion/filter/editor state stay mounted. Initial errors show the existing error plus a retry hint, never a false empty-state count. Background Live Monitoring polling remains silent.

**Constraints:** React/Vite, existing services and permissions; no migration or dependency change. No commits or pushes. Preserve unrelated dirty work. Ordinary question/assessment content mutations still refresh normally. Do not alter student exam-taking/loading/locking logic.

**Ownership:** Root owns helpers/styles and instructor screens. student_loading owns five student list/history/enrollment components and student-loading tests. admin_loading owns accounts/audit components and admin-loading tests. Browser runs are coordinated centrally to avoid report conflicts.

- [x] Write and observe failing delayed-response browser checks for initial placement and unknown counts.
- [x] Add shared loading state, boundary and refresh button.
- [x] Apply to Exam Controls, Quizzes, Question Bank/modules, practical library, Classes and quiz/CLI results.
- [x] Apply to student lists/histories/enrollment and admin accounts/security history.
- [x] Verify initial loading, empty/error cases, retained populated content and state during delayed refreshes, silent polling, desktop/phone containment and both roles.
- [x] Run appropriate regressions, lint/build, independent review and visual QA; update roadmap/architecture and logs.

## Verification and decisions

- The initial missing in-panel Exam Controls loader regression failed before implementation.
- Shared ready state is set only after successful data loading, preserving first-load
  error recovery and populated content on refresh failures.
- Additional review covered Overall Results, Question Analytics and Performance
  Trends: their refreshes already retained content, but initial false metrics/charts
  now use the same unknown counts and boundary. Student history reports visible
  child loading to its parent refresh action.
- The first 11 delayed-response checks passed. The expanded run passed 20 of 21;
  a cold lazy Results module still showed the workspace fallback at the test's
  15-second assertion. Tests now wait for selected-panel readiness before checking
  its API loading state. This is separate from the intentionally retained route fallback.
- Targeted rechecks pass for that Results case, stable class heading, successful
  class-create reset and the added enrollment error-recovery case. The suites now
  contain 22 focused loading scenarios, verified across main and targeted runs.
- All 31 existing affected instructor workflow regressions pass, including live
  filtering/submission, retained drafts/imports, publishing, class search, result
  metrics and independent practical expansion.
- Review found one stale enrollment fetch error after successful retry. It now uses
  a separate fetch message, preserving join-request feedback. Retry regression passes.
- ClassEditor stays mounted and disabled until initial data is ready, preventing
  a heading shift. Ordinary refresh keeps the draft; successful saves explicitly
  reset the completed editor using a revision key.
- Final lint, production build and whitespace checks pass. Desktop initial/refresh
  and phone unknown-count screenshots were visually inspected. Localhost returns 200.
- No migration, dependency change, commit, push or production write was performed.
  Actual authenticated owner acceptance remains a localhost/manual check.

## Follow-up: refresh control scope

The owner approved removing the redundant controls identified by the source audit,
including optional content-library refresh controls. Remove them from embedded
student histories, templates/libraries, Course modules, Quiz access, and the three
Exam Controls configuration forms. Retain meaningful external-update refresh
actions. Initial loading and automatic post-mutation reloads remain unchanged.

- [x] Observe the redundant template-refresh regression fail before removal.
- [x] Remove routine controls and add failure-only Retry through DataLoadBoundary.
- [x] Track fetch failures separately from validation and successful action messages.
- [x] Preserve populated content and retry feedback during recovery; retain one parent history refresh.
- [x] Verify scope, initial/automatic-reload retry, retained filters and existing workflows.
- [x] Update logs and finish local verification without commits, pushes or migrations.

Independent review found no actionable issues. The scope and recovery checks pass,
including an automatically reloaded question table remaining visible after failure
and through Retry. Loading tests now trigger the actual mutation reload or parent
history refresh instead of relying on removed buttons. A cold instructor-workspace
module initially exceeded the test's 15-second navigation assertion during a
concurrent build; the readiness wait is now explicit before API-loading assertions.

The loading/scope/student run passed 21 of 22 checks; its cold-workspace readiness
case passes in the subsequent regression run. All 25 retained-control, builder,
question-bank, module-filter, administrator and Live Monitoring regressions pass.
Final lint, production build and whitespace checks pass. Template and embedded
student-history headers were visually inspected; a browser check confirms one
parent refresh control in history. Acceptance and architecture notes are updated.
No migration, dependency change, commit, push or production write was performed.
