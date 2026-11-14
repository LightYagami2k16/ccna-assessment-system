# Live Monitoring Assessment Groups and Instructor Submission

**Goal:** Group active attempts by class, exact quiz/practical, and student; filter them and let authorized instructors submit an attempt.

**Architecture:** Extract the monitor into LiveAttemptMonitor. Keep filters and expansion mounted across Exam Controls subsections and polling. Use assessment-type + database ID keys, never titles as identity. Add migration 068 with authorized metadata and a transactional instructor submission RPC, grading saved quiz answers / CLI state with existing grading helpers. Record an immutable audit row. Lock the attempt then browser lease with NOWAIT, refusing busy attempts atomically to avoid a wait cycle with student writes or expiry reconciliation. Grade only after both locks succeed; completed attempts are idempotent and must not be regraded. Student browser lease removal blocks further writes.

**Scope:** Class, type, exact-assessment filters and Clear; filtered counts and empty state; Class → assessment → student attempt cards. Confirm instructor submission with named student and assessment and saved-work explanation. Retain error messages through background polling. No physical-location detection. No commit, push, or production migration application.

- [x] Add failing grouping/filter/submission browser checks using isolated data.
- [x] Extract and implement the monitor; connect service and metadata capability detection.
- [x] Prepare migration 068: role/ownership checks, grading, audit, grants, idempotency and session release.
- [x] Runtime-test SQL locally if available, including forbidden callers and already-ended attempts. Verify both roles, identical titles, filter/poll retention, cancellation, submit success/failure, and responsive layout.
- [x] Run lint/build and related regressions; request independent review; update roadmap and acceptance notes with unapplied migration status.

## Verification and review record

- Watched the missing monitor/filter regression fail before implementation.
- Fixed manual refresh unmounting the monitor by rendering the loading indicator
  inline, preserving filters and hidden subsection state.
- Four final monitoring browser checks pass for instructor/admin views, duplicate
  titles, class/type/exact filters, refresh, background polling, subsection state,
  expansion, confirmation cancellation, quiz/CLI submission, errors and missing migration.
- All six existing instructor subsection regressions pass.
- The isolated PostgreSQL harness executes migration 068, real quiz grading and
  CLI hostname/secret grading, real status/session-release trigger and lease guard.
  Authorization, ownership, metadata isolation, audit access, scoring, idempotency,
  expiry, empty criteria, session revocation, grading-error rollback and busy retry pass.
- Review identified lock inversion with expiry reconciliation. Attempt and lease
  locks now use NOWAIT before grading; contention returns a safe retry error.
  Independent follow-up verified the fix and found no remaining actionable issues.
- Final lint, production build and whitespace checks pass. Desktop and phone
  sample monitor screenshots were visually inspected. Server responds at port 5173.
- Migration 068 remains unapplied to Supabase. Actual authenticated workflows and
  true concurrent student/instructor/expiry transactions remain deployment acceptance.
- No commits, pushes or production database mutations were performed.

## Follow-up: collapsed student attempt details

The owner requested student quiz/CLI cards collapsed by default with Show details.
Added per-attempt expansion state keyed by type and attempt ID, accessible toggle
buttons and hidden panels. Summary identity and event count remain visible;
monitoring details and Submit attempt are inside the expanded panel. Expansion
survives refresh and polling and remains independent for each student attempt.
Watched the missing-toggle regression fail, then verified all five monitoring
browser checks pass after implementation. Lint, build and whitespace checks pass.
Updated the roadmap, architecture and acceptance guide. No migration, commit,
push or production database change is included in this follow-up.

## Follow-up: student-name search

Add a labeled search field immediately before Class in the monitor filter bar.
Match partial student names without regard to capitalization or surrounding
spaces. Combine with all existing filters, retain the query through refresh and
polling, and reset it with Clear filters. Search opens matching class/assessment
groups while individual student details remain collapsed unless explicitly opened.
Keep desktop controls aligned and use the existing phone filter stack.

- [x] Verify search behavior, combined filters, refresh retention, clear and layout.
- [x] Update the local logs and acceptance guide after lint/build and browser checks.

The missing-search regression failed before implementation. Five existing monitor
checks passed on the first implemented run; the search check caught a 1.2-pixel
input/select height difference. Setting a shared 48-pixel height fixed alignment,
and the search regression passes, including mixed-case/trimmed partial matching,
combined filters, empty state, refresh/poll retention, Clear, desktop order and
phone containment. Lint, final production build and whitespace checks pass.
Desktop/phone previews were inspected. No migration, commit or push is included.
