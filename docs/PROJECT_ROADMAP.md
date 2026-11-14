# CCNA Assessment System — Project Roadmap and Progress Log

Last updated: November 14, 2026

This file is the source of truth for unfinished project work. Update it whenever
a sprint begins, changes status, is completed, or is intentionally removed from
scope. Detailed implementation and operating instructions remain in the other
phase documents under `docs/`.

## Status definitions

- **Not started** — no implementation work has begun.
- **In progress** — active implementation is underway.
- **Partially complete** — usable functionality exists, but acceptance criteria
  remain.
- **Code complete; deployment pending** — repository work is finished, but a
  migration, configuration, deployment, or live verification is still required.
- **Complete** — implementation and stated acceptance checks are finished.
- **Recurring** — an operational or release check that must be repeated.

## Completed baseline

| Area | Status | Notes |
| --- | --- | --- |
| Phase 5 — Exam security and session controls | Complete | Single active assessment, browser leases, autosave recovery, integrity events, automatic submission, and live monitoring are implemented. |
| Phase 8 — Content management and portability | Complete | Question import/export, validation reports, quiz and practical templates, duplication, and instructional backup/restore are implemented. |
| Phase 9 — Engineering QA and accessibility automation | Complete | Unit, simulator, browser, responsive, and automated accessibility coverage is established. Manual classroom and screen-reader sign-off remains recurring for releases. |
| Phase 10 — Production readiness implementation | Complete | CI gates, runtime monitoring, backup/recovery documentation, authentication delivery guidance, and security handoff documentation are present. |
| UI/UX Redesign Phases 1–5 | Complete | Shared design foundation, application shell, instructor responsive review, and student assessment/history redesign are complete. |

## Open frontend sprints

### F1 — Multi-page workspace architecture

Status: **In progress**  
Priority: **High**  
Depends on: UX1

Move the largest role workspaces from one long conditional page into focused,
addressable landing pages while preserving current permissions and business
logic.

Scope:

- Dashboard overview
- Question Bank
- Quizzes
- CLI Practicals
- Classes and Enrollment
- Exam Controls
- Student Results
- Content Backup
- User Administration
- route persistence after refresh;
- breadcrumbs and reliable back navigation; and
- assessment focus mode remaining isolated from normal workspace navigation.

Completion criteria:

- every major feature has a stable page address;
- refresh restores the selected page;
- unauthorized roles cannot open restricted pages;
- no current workflow or stored workspace state is lost; and
- desktop, tablet, and mobile navigation tests pass.

Implementation progress:

- **F1.1 routing foundation — Complete.** Student, instructor, and
  administrator feature selections now have stable hash addresses. Refresh,
  browser Back/Forward, legacy local-storage selection, role guards, and quiz
  and CLI focus addresses are covered without adding a routing dependency.
- **F1.2 student pages — Complete.** Overview, quizzes, CLI practicals,
  results and history, classes, and the exam guide now have focused pages with
  stable addresses and responsive desktop/mobile navigation. The repeated
  student course catalogue was removed, while assessment focus mode, autosave,
  archive/restore, and active-session recovery remain intact.
- **F1.3 instructor page composition — In progress.**
  - **F1.3A instructor Overview — Complete.** The instructor now lands on
    `#/instructor/overview`, with focused shortcuts to every instructor tool.
    The repeated non-interactive course catalogue was removed. Administrator
    assessment tools continue to open directly at Question Bank in the
    administrator routing context.
  - **F1.3B dense-page subsections — Local review pending.** Classes now has
    three focused subsections, Exam Controls has four, Student Results has
    five, Question Bank has four, and Quizzes and CLI practicals each have three
    (Library, Create / edit, and Templates). Assessment libraries are the default;
    their course expansion and selections survive subsection switches. Question Bank opens the library by default,
    with separate Create / edit question, Course modules, and Import / export
    sections. Saving or cancelling an edit returns to the filtered library;
    successful saves reset the completed editor form. Nested addresses support
    refresh and browser Back/Forward in both
    instructor and administrator assessment tools. Inactive panels stay mounted
    to retain drafts, filters, and reviews while switching subsections. Practical
    access links to the existing CLI builder. Unchanged monitoring refreshes no
    longer overwrite unsaved integrity-policy fields. Implementation is local
    and uncommitted for the owner's localhost review; authenticated acceptance
    and publication remain pending.

### F2 — Live dashboard summaries

Status: **Partially complete**  
Priority: **Medium**

Replace remaining static summary values with current role-appropriate data.

Completion criteria:

- student dashboard shows active, upcoming, and recently completed work;
- instructor dashboard shows pending enrollment, active assessments, and recent
  submissions;
- administrator dashboard shows account, class, monitoring, and unresolved
  error summaries; and
- every summary card opens its corresponding page.
- Student Results summary cards reflect the active class, course, assessment,
  search, and result-status filters. Pass rate and average score use graded
  matching attempts; empty selections show zero values.

Implementation progress:

- **Student Overview availability and active/upcoming work — Local review pending.** Separate eligible quiz/practical counts and titles, verified resume status, partial-error handling and quiet freshness are implemented. Upcoming quiz migration 069 is isolated-tested and not applied to Supabase. Recently completed-work summaries and authenticated owner acceptance remain pending. See `STUDENT_OVERVIEW_ACCEPTANCE.md`.

- **Filtered Student Results summaries — Local review pending.** Quiz and CLI
  result cards now use the same filtered attempts as their lists. Browser
  checks cover combined filters, empty and active-only results, unassigned
  students, numeric-string percentages, and reset behavior. The remaining F2
  dashboard-summary criteria are still open.

### F3 — Offline synchronization and reconnection UX

Status: **Partially complete**  
Priority: **Medium**

Current quiz answers and CLI state survive refreshes and temporary connection
loss. The application is not intended to be a permanently offline examination
system.

Remaining scope:

- persistent online/offline and synchronization indicators;
- queued-change counts during an assessment;
- clear confirmation when all changes reach the server;
- failed-queue recovery after reconnection;
- delayed-submission behavior after server-side expiry; and
- prolonged offline quiz and CLI acceptance testing.

### F4 — Feature-level recovery states

Status: **Partially complete**  
Priority: **Medium**

Loading, empty, validation, permission, offline, and deployment-recovery states
exist. Remaining work is to keep a failure inside the affected feature instead
of replacing the full role workspace whenever possible.

Completion criteria:

- major lazy-loaded pages have feature-level recovery boundaries;
- retry actions use consistent language and styling;
- stale deployment chunks recover without reload loops; and
- backend permission errors remain inside the relevant panel.

## Open backend sprints

### B1 — Administrator class-teacher identity deployment

Status: **Complete**  
Priority: **High**

Required migration:

```text
supabase/migrations/066_admin_class_teacher_identity.sql
```

Completion criteria:

- migration 066 is applied to production (confirmed August 18, 2026);
- administrators see the teacher name and email on every valid class;
- instructors continue seeing only their own classes; and
- classes owned by deleted or non-instructor accounts are not exposed as valid
  class sections.

### B2 — Cross-instructor authorization audit

Status: **Partially complete**  
Priority: **High**

Classes are already creator-exclusive, while the question bank and registered
student lookup are intentionally shared. Complete an RLS and security-definer
function audit for assignments, schedules, monitoring, results, exports, CLI
practicals, and reusable templates.

Completion criteria:

- automated negative tests prove one instructor cannot read or modify another
  instructor's private records;
- administrator access is explicit rather than inherited accidentally;
- shared content is limited to the agreed question bank and student lookup; and
- the authorization matrix is documented.

### B3 — Offline queue reconciliation hardening

Status: **Partially complete**  
Priority: **Medium**

Completion criteria:

- queued quiz answers and CLI commands are idempotent;
- duplicate synchronization cannot inflate attempts or command counts;
- delayed submission respects the server's recorded expiry time;
- conflicts from a second device are resolved predictably; and
- reconnection and expiry cases have automated tests.

### B4 — Operational diagnostics refinement

Status: **Partially complete**  
Priority: **Low**

Production monitoring deliberately excludes raw messages, stack traces, form
values, answers, commands, names, and email addresses. Improve diagnosis without
weakening that privacy boundary.

Completion criteria:

- errors can be grouped by release and safe feature identifier;
- frontend rendering, network, authorization, and backend-service failures are
  distinguishable;
- retention and cleanup rules are defined; and
- administrator alerts identify recurring unresolved categories.

## Open UI/UX sprints

### UX1 — Information architecture and landing pages

Status: **Complete**  
Priority: **Highest**

Decide which information and actions belong on each landing page before F1
changes the workspace structure.

Completion criteria:

- student, instructor, and administrator site maps are approved;
- duplicate and redundant cards are identified for removal;
- each page has one primary task and a clear action hierarchy;
- navigation labels and terminology are consistent; and
- the proposed structure preserves current user permissions and workflows.

Approved implementation blueprint:

- [`UI_INFORMATION_ARCHITECTURE.md`](UI_INFORMATION_ARCHITECTURE.md)

### UX2 — Card hierarchy and page composition

Status: **Partially complete**  
Priority: **High**

Completion criteria:

- summary, content, action, warning, and result cards have documented roles;
- expanding one card does not resize unrelated cards;
- primary actions occupy consistent locations;
- card density is appropriate for each viewport; and
- redundant borders, headings, descriptions, and status labels are removed.

Implementation progress:

- **Live Monitoring assessment groups and instructor submission — Local review;
  migration pending.** Under UX2 and the Phase 5 exam-control extension, active
  attempts are grouped Class → exact assessment → student, with class/type/exact
  assessment filters. Filters and expansion survive refresh, polling and subsection
  switches. A confirmed instructor submission grades saved server work and records
  an audit event; server-side role/ownership checks, nonblocking locks, idempotency
  and browser lease removal protect the action. Migration 068 is prepared only,
  so real Supabase submission remains unavailable until it is applied.
  See [the acceptance guide](LIVE_MONITORING_ACCEPTANCE.md) for verification and
  deployment prerequisites, including actual concurrent-session testing.

- **Question Bank module filter — Local review pending.** The content library
  now has one Module dropdown, course-qualified module labels, All modules,
  Unassigned module, and Clear filter. Options reflect modules in the loaded
  question bank. Selecting a module shows only matching questions and opens
  matching course tables. Counts and bulk actions use only visible questions;
  filter state survives question refreshes and resets safely if a selected
  named module no longer has questions.

- **Complete question loading — Local review pending.** The Question Bank and
  quiz builder load successive, consistently ordered batches rather than one
  capped response. Loading advances by the actual batch size until no rows
  remain, including when the API cap is below 1000. A failed batch rejects the
  load instead of presenting a partial bank. The quiz builder continues to
  exclude archived questions.

- **Independent CLI practical card heights — Local review pending.** The
  practical library grid top-aligns cards so expanding a practical or its answer
  key preserves neighboring card heights. Desktop and phone regressions cover
  expansion, collapse, another card's expansion, and horizontal containment.

- **Class-wide enrolled-student search — Local review pending.** Your classes
  has one name-or-email search with Search and Clear controls. Results contain
  only matching class cards and matching enrolled students, with those rosters
  opened automatically. Clear restores the previous roster expansion state.
  Applying or clearing a search clears deletion selections, and bulk deletion
  is limited to selected classes still visible in the filtered list.

### UX3 — Buttons, forms, and action menus

Status: **Partially complete**  
Priority: **Medium**

Completion criteria:

- primary, secondary, danger, icon, and link actions are visually consistent;
- dropdowns, inputs, checkboxes, and action menus share compatible dimensions;
- disabled and loading states remain readable;
- oversized controls no longer resemble empty content panels; and
- the shared Lucide icon system is used consistently.

Implementation progress:

- **Consistent first-load and refresh feedback — Local review pending.** Audited
  instructor, student and administrator panels now contain their first loader,
  display unknown counts until a successful response, and retain loaded content
  and local state during refresh. Shared refresh buttons provide compact feedback;
  initial failures support retry and failed refreshes retain the last valid data.
  Live Monitoring automatic polling stays silent. No migration is required.
  See [loading-state acceptance](LOADING_STATES_ACCEPTANCE.md).

### UX4 — Final responsive and accessibility regression

Status: **In progress**  
Priority: **High**

This continues UI/UX Redesign Phase 6.

Completion criteria:

- compact phone, phone, tablet, laptop, and large desktop layouts pass;
- no unintended page-level horizontal overflow remains;
- long labels and real production data stay within their containers;
- keyboard-only navigation and visible focus pass across every role;
- modal focus trapping and restoration pass;
- screen-reader review is completed for quiz and CLI assessment flows; and
- 200% browser zoom remains usable.

### UX5 — Final visual consistency and production-language pass

Status: **Not started**  
Priority: **Medium**

Completion criteria:

- development-phase wording is removed from user-facing pages;
- capitalization and assessment terminology are standardized;
- notifications, badges, dialogs, tables, and empty states follow shared
  patterns; and
- student, instructor, and administrator visual walkthroughs are signed off.

## Open production and operations sprints

### Phase 11.2 — Authenticated production acceptance

Status: **Not started**  
Priority: **High before classroom launch**

- maintain controlled student, instructor, and administrator test accounts;
- verify deployed role routing and access boundaries;
- test invitation, confirmation, recovery, quiz, and CLI flows; and
- record results in the production release record.

### Phase 11.3 — Operational review cadence

Status: **Recurring**

- review application health, security events, and email delivery weekly;
- review database growth and backup completion monthly; and
- complete a disposable-project recovery drill quarterly.

### Phase 11.4 — Feedback and release governance

Status: **Not started**

- collect structured student and instructor feedback;
- classify defects by severity and affected role;
- maintain release notes and rollback references; and
- separate production incident fixes from planned feature releases.

## Intentionally excluded or deferred

- NTP and Syslog simulator support were explicitly skipped.
- A permanently offline, unsupervised exam system is not part of the current
  deployment model; temporary offline continuation and recovery remain in scope.
- Remaining advanced simulator additions should be added as separately approved
  content phases rather than silently expanding the current roadmap.

## Recommended execution order

1. Continue F1 multi-page workspaces with F1.3B instructor dense-page subsections.
2. Finish UX2 and UX4 card/responsive cleanup alongside each migrated page.
3. Complete B2 cross-instructor authorization testing.
4. Complete F3/B3 synchronization and reconnection hardening.
5. Complete Phase 11.2 authenticated production acceptance.
6. Finish UX3 and UX5 consistency work.
7. Begin the recurring Phase 11.3 and 11.4 operating process.

## Progress log

| Date | Change | Result |
| --- | --- | --- |
| 2026-11-14 | Authorized release of accumulated local updates and continuation of F1 | Owner explicitly authorized commit and push, superseding earlier local-only restrictions. Release preflight secret scan, all 103 unit tests, lint and production build pass. Integrating nine existing GitHub commits before a normal push; migrations 067–071 remain a separate Supabase deployment requirement. Continuing F1 against the approved information architecture after publication. |
| 2026-11-14 | Reviewed the specific remaining development tasks | Read the current roadmap and feature acceptance records to separate unfinished frontend/backend/UX work from locally completed features awaiting authenticated acceptance and release. Deployment records still list migrations 067–071 as pending; remote Supabase/GitHub state was not checked during this read-only code review. No application changes, database changes, commit or push. |
| 2026-11-14 | Aligned student Available CLI practical cards locally | Scoped the student practical grid to stretch cards within each row and use column layout with bottom-aligned actions. Wrapped titles/descriptions retain full content; instructor cards keep independent sizing. Browser sample-data measurements reproduced differing heights before the fix and verified equal row widths/heights/action bottoms at 1920px and 1000px, with a naturally stacked 390px layout and no page overflow. Desktop screenshot visually inspected. Production build and diff checks pass. No database changes, commit or push. |
| 2026-11-13 | Added review scheduling to creation/editing and repaired student Review actions locally | Student result tables now reserve a correctly sized Review column and use an aligned icon action. Shared review fields are present in quiz/CLI create/edit forms and existing item-policy popups: disabled, after submission, or a scheduled opening with optional closing. Browser-local times serialize to ISO timestamps; malformed or reversed windows are rejected. Prepared migration 071 for schedule-aware authorization and atomic content/topology/policy saves. New records default off; unknown existing policy blocks saving until reloaded. Verification: 103 unit tests, 19 distinct focused Chromium cases across integration runs, isolated SQL schedule/security/atomic-save checks, responsive screenshots and source review; final lint/build results are recorded in STUDENT_ATTEMPT_REVIEW_ACCEPTANCE.md. Fixed the CLI form checkbox width found during visual inspection. Migrations 070 and 071 are prepared locally, not applied by this work. No commit or push. |
| 2026-11-13 | Implemented instructor-controlled attempt review locally | Per-assessment Student attempt review controls in quiz/practical detail popups save release/withdrawal separately from assessment content, default off. Student Results & history adds authorized per-attempt read-only review, including submitted work, feedback and correct answers/expected CLI configuration as explicitly selected by the owner. Grades/history stay available independently. Prepared migration 070 with current-policy/ownership/finalization/role/ban checks, guarded legacy readers, restrictive direct detail-table access and future quiz completion snapshots; older content fallback is labelled. Root independently reran the isolated SQL harness successfully, including migration reapplication, actual grading/readers/client leases/topology, role/ban/owner isolation, default-off, revocation, raw-detail isolation and immutable snapshots. All 100 unit checks, 21 distinct focused Chromium feature/regression scenarios across integration runs, full lint, final production build and diff checks pass. Fixed conditional-modal focus restoration and isolated student review styles from instructor results; screenshots of instructor controls and student quiz/phone CLI reviews were visually inspected. Full-feature independent review was unavailable due to reviewer usage limits; root performed source review and SQL/browser verification. Authenticated owner acceptance remains pending. Migration is not applied to Supabase. No commit or push. |
| 2026-11-13 | Investigated instructor-controlled student attempt review | Student histories currently show scores/outcomes without a detailed review screen. Quiz editor currently submits showResultsImmediately as true; that field is not a complete review-permission policy. CLI has instructor-only attempt review, but no student review control. Proposed per-quiz/per-practical Allow attempt review with completed-attempt review opened from student Results & history. Review content is awaiting owner clarification: submitted work/scoring feedback only, or also correct quiz answers/expected CLI configuration. Existing completed-attempt RPCs and direct-table read policies must be considered alongside the new student review endpoint so the permission is enforced by the database. Investigation only; no application or database changes, commit or push. |
| 2026-11-13 | Implemented compact Your classes cards and detail popups locally | Class cards show only the class name and Show details. The class popup contains status/code/term, administrator teacher identity, roster, join code/QR/manual enrollment, individual deletion selection and edit/delete actions. Student search and bulk tools remain on the page; searched popups show only matching students. Existing roster expansion and selection behavior is preserved. Editing closes the popup, and section/filter/record removal clears its selected class. Shared dialog supports a Class details label and ignores nested-dialog cancellation/key events. Observed the compact-card regression fail before implementation. Six focused Chromium scenarios verified across class popups and roster search for both roles, class draft retention, and shared quiz popup behavior; class popup checks were repeated after the phone header correction. Coverage includes QR display, reset/delete confirmation cancellation, nested join-code Escape, selection retention and filtered bulk-delete payload. Desktop/phone screenshots were visually inspected. Full lint, production build and diff checks pass. Independent review found no actionable issues. Authenticated owner acceptance remains pending. No new migration, dependency, commit or push. |
| 2026-11-13 | Implemented compact instructor assessment library cards locally | Quiz library and CLI Practical library cards now show only the item title and Show details. Native modal dialogs contain the existing metadata and management controls, including CLI selection and answer keys. Course grouping and bulk controls remain available. Editing closes the dialog before opening the editor; section navigation and deleted-record reloads clear the selected item. Shared dialog keyboard handling includes buttons, checkboxes and action selectors. Observed the missing Show details regression before implementation; 13 Chromium checks now pass across instructor/administrator libraries, creation/edit/save and draft retention, selections, confirmations, answer keys, focus, compact sizing and delayed duplication reload. Desktop/phone popup screenshots were visually inspected. Full lint, production build and diff checks pass. Independent review found no actionable issues. Authenticated owner acceptance remains pending. No new migration, dependency, commit or push. |
| 2026-11-13 | Moved category Show Details beside item counts locally | Grouped each category count and Show Details action on the right side of the card header. Removed the separate footer/divider to make the cards compact. Header content wraps on smaller screens. Collapsible popup behavior is preserved. Both existing desktop/phone popup browser checks pass, including independent expansion and focus handling. The compact header screenshot was visually inspected; full lint, production build and diff checks pass. Authenticated owner review remains pending. No commit or push. |
| 2026-11-13 | Polished category actions and collapsed assessment popup cards locally | Category Show Details buttons now sit in a separated footer aligned right on desktop and full width on phones. Popup items initially show only the assessment title and a Show details toggle. Each item expands independently to reveal the existing metadata and can be collapsed again; closing/reopening resets all items. Toggle state and panel association are exposed accessibly. Observed the default-collapse regression fail before implementation; three focused Chromium scenarios now pass for both categories, independent expansion/collapse, reset on reopen, metadata/navigation, keyboard containment and phone sizing. Desktop action placement, collapsed desktop popup and collapsed phone popup screenshots were visually inspected. Full lint, production build and diff checks pass. Authenticated owner acceptance remains pending. No new migration, dependency, commit or push. |
| 2026-11-13 | Added available-assessment detail popups locally | Available quizzes and Available CLI practicals each show only their count and one Show Details button in Student Overview, with assessment items hidden, as clarified by the owner. Its modal lists every available assessment in that category with course/module, description, duration, passing score, max/used/remaining attempts and quiz deadline or CLI device type. Empty/loading categories disable the button. Uses existing authorized metadata with explicit field selection; no questions/answers or new request are added. View quizzes/View practicals navigation is inside the popup. Escape, Close details, Done, focus containment/restoration and responsive scrolling are included. Verified 11 Chromium browser scenarios (including a clean rerun of both popup checks after documentation-triggered development reloads), all 100 unit tests, lint, production build and diff checks. Desktop/phone popup screenshots were visually inspected. Browser coverage checks exactly one card button, hidden item titles, both category lists, metadata, navigation, Escape/focus restoration, Tab/Shift+Tab containment and phone sizing. Real authenticated owner acceptance remains pending. No new migration, dependency, commit or push. |
| 2026-11-13 | Removed routine student refresh buttons locally under UX3 | Removed persistent refresh actions from Overview, Quizzes, CLI practicals, Results & history (including standalone history variants), and My classes. Failed loads offer contextual Retry only. Availability and enrollment update every 30 seconds while visible and on returning focus; histories refresh on focus, and Overview retains its existing polling. List updates pause during active practicals and related start/archive/restore/join actions. Removed unused history parent refresh/loading wiring. Existing content, enrollment expansion and class-code drafts remain mounted. All 99 unit tests, 19 Chromium browser checks, lint, production build and diff checks pass. Browser coverage verifies no routine student controls, focus/interval updates, hidden-page and navigation cleanup, retained content/expansion/drafts, failure-only Retry, and existing overview/session behavior. Real authenticated owner testing remains pending. No new database migration, dependency, commit or push. |
| 2026-11-13 | Implemented Student Overview assessment summaries locally under F2 | Added separate eligible quiz/practical counts and titles, verified active-attempt resume, and upcoming quiz windows. Archived, exhausted and in-progress work is excluded from ready-to-start counts. Failed status lookups retain saved attempt IDs and cannot show a false-ready banner. Independent resource errors preserve populated data; one overview refresh plus visible-page 30-second/focus updates keeps summaries fresh. Prepared migration 069 and verified authorization, schedule precedence, attempt/archive rules, isolation and read-only behavior in an isolated database; it is not applied to Supabase. All 99 unit checks, 14 Chromium browser checks (six overview scenarios plus student loading/guide regressions), lint, production build and diff checks pass. Desktop and phone screenshots were visually inspected. Independent review found no actionable issues. Recently completed-work summaries and authenticated owner acceptance remain pending. No commit or push. |
| 2026-11-13 | Investigated Student Overview assessment summary behavior | StudentOverview currently renders only the activeSession supplied by StudentQuizArea: a student's unfinished quiz/CLI session from get_student_active_assessment_session. It does not fetch or summarize assigned/available/upcoming assessments, so the ready banner may appear even when open assessments are available. Full student overview summaries remain under unfinished F2 criteria. Source also shows active-session lookup can return null for missing-function errors or errors mentioning the RPC name, and overview session state has no periodic refresh; these are possible false-ready/staleness paths if an actual unfinished attempt exists. The screenshot alone does not establish the authenticated student's database state. Recommended clearer no-attempt wording, availability/upcoming summaries and distinct unavailable/error handling. Investigation only; no application code, tests, migration, commit or push changes were made. |
| 2026-11-13 | Removed redundant refresh controls locally under UX3 | Removed routine refresh from the reviewed quiz/question/practical libraries, templates, Course modules, Quiz access, three Exam Controls configuration forms, and embedded quiz/CLI history headings. Kept monitoring/reporting, Your classes/approval, student availability/enrollment, administrator and parent history refresh controls. Failed fetches expose contextual Retry; validation/success messages do not. Retry preserves existing content and filters and reloads data without repeating a mutation. Initial loaders, unknown counts and automatic post-save/poll reloads remain. The new scope/recovery tests pass, including a failed automatic question reload with retained table/filter during retry. The combined loading/scope/student run passed 21/22; its cold workspace-readiness case passes after an explicit readiness wait in the subsequent 25-test regression run, which passes fully. Lint, production build and whitespace checks pass. Independent review found no actionable issues. Clean template/history headers were visually inspected and history has one parent refresh control. Updated loading acceptance and architecture notes. No migration or dependency change is required. Changes remain local, uncommitted and unpublished. |
| 2026-11-13 | Evaluated refresh-button clutter without changing application code | Source review identified redundant embedded quiz/CLI Refresh results buttons under the student's parent Refresh history control; always-visible quiz/practical template refresh controls despite mutation-driven reloads; schedule/integrity/accommodation refresh actions despite the shared ten-second polling and post-save reload; Course modules refresh despite automatic mutation reload; and repeated Quiz access class-workspace refresh. The quiz-editor initial-loading refresh action should be failure-only Retry rather than a routine control. Question/quiz/practical library refresh buttons are optional decluttering candidates, while monitoring/results, external enrollment/approval updates and administrator accounts/history have stronger freshness needs. Normal refresh controls can be removed independently of contained loading feedback; initial failure recovery must retain a contextual Retry action. Recommendations only: no application code, tests, migration, commit or push changes were performed. |
| 2026-11-13 | Standardized initial loading and refresh feedback locally under UX2 / UX3 / UX5 | Added shared successful-load state, contained initial loading boundaries and compact animated refresh buttons. Applied them to audited instructor content/classes/controls/results, student lists/histories/enrollment and administrator accounts/security history; reporting metrics/charts now avoid false initial zeros. Headers/navigation remain visible, populated content/filter/expansion state survives refresh and failures, and counts remain unknown until first success. Automatic Live Monitoring polling remains silent. Successful class creation explicitly resets its completed form while manual refresh retains drafts. Review found a stale enrollment fetch error; separate fetch feedback and a recovery regression resolve it. The expanded loading run passed 20/21; the cold lazy Results readiness case and targeted class/recovery checks pass after an explicit test readiness wait and class-heading stabilization. The suites contain 22 focused scenarios verified across main/targeted runs; all 31 existing affected workflow regressions pass. Final lint, production build and whitespace checks pass. Desktop first-load/refresh and phone previews were visually inspected. Updated architecture and loading acceptance notes. No migration or dependency change is required. Actual authenticated acceptance remains pending; the server is available at localhost:5173. Changes remain local, uncommitted and unpublished. |
| 2026-11-13 | Audited loading-state placement across application source | Exam Controls inserts a large LoadingState above subsection navigation; Quizzes inserts one below its navigation while panels remain mounted. Related content-replacement patterns occur in Question Bank library/course modules, CLI practical library, instructor quiz/CLI results, Classes, student assessment lists/histories/enrollment, and administrator accounts/security history. The shared LoadingState has a 144-pixel minimum height; WorkspaceLoading uses 180 pixels. Overall Results, Question Analytics, Performance Trends and Admin System Health retain populated content during refresh and use compact button feedback. Automatic Exam Controls polling is already silent; initial/manual loading causes its large block. Findings are based on source inspection, not a latency-controlled visual walkthrough of every screen. No application code was changed and no tests, commit, push or migration were performed for this audit. |
| 2026-11-13 | Added student-name search to Live Monitoring under UX2 | Placed a labeled Student name search before Class. Partial-name matching ignores case and surrounding spaces and combines with class, assessment-type and exact-assessment filters. Matching groups open automatically while student details retain their own collapsed state. Counts follow the search; Clear filters resets the query and dropdowns. Search persists through refresh and polling. Added responsive filter columns and aligned 48-pixel controls. The five existing monitoring browser checks pass; the new search regression passes after correcting a small input/select height difference, covering matching, combined filters, no matches, refresh/poll retention, clear, desktop order/alignment and phone containment. Lint, final build and whitespace checks pass. Desktop and phone filter previews were visually inspected. Updated architecture and acceptance notes. No migration is required; changes remain local, uncommitted and unpublished. |
| 2026-11-13 | Collapsed individual Live Monitoring attempts by default under UX2 | Student quiz and CLI attempt cards now show only name, email, event count and Show details initially. Show details reveals timing, events, session information, CLI command count and Submit attempt; Hide details collapses only that attempt. Expansion is keyed by assessment type and attempt ID, persists through polling and refresh, and does not affect neighboring cards. Added accessible expanded/controls attributes and explicit hidden-panel styling. All five monitoring browser checks pass, covering default collapse, independent expansion, refresh/poll retention and existing instructor/admin quiz/CLI submission flows. Lint, production build and whitespace checks pass. Architecture and acceptance notes are updated. No migration is required for this presentation change. Changes remain local, uncommitted and unpublished. |
| 2026-11-13 | Added assessment-based Live Monitoring and instructor submission locally under UX2 / Phase 5 | Active attempts now group Class → exact quiz/CLI practical → student, with class/type/exact-assessment filters, filtered counts, automatic opening of filtered groups, and retained expansion/filter state across polling, refresh and subsections. Added a confirmed Submit attempt action with named student/assessment, saved-work grading and persistent feedback. Prepared migration 068 with role/ownership and suspension checks, metadata isolation, transactional audit, idempotency, browser lease revocation and nonblocking locks. Independent review identified a lock inversion with expiry reconciliation; the NOWAIT strategy resolves it and follow-up review found no remaining actionable issues. The isolated PostgreSQL harness passes authorization, real quiz/CLI grading, production session-release trigger, audit access, retry/expiry/zero-criteria, lease and rollback checks. Four final monitoring browser checks and six existing subsection checks pass; lint, production build and whitespace checks pass. Desktop/phone previews were visually inspected. Updated the architecture and acceptance guide. Migration 068 is prepared only and has not been applied to Supabase; actual authenticated and concurrent-session acceptance remains pending. The server is available at localhost:5173. Changes remain local, uncommitted and unpublished. |
| 2026-11-12 | Added Quizzes and CLI practical subsections locally under F1.3B | Each page now opens its library by default and provides Create / edit and Templates subsections in instructor and administrator contexts. Mounted panels retain drafts, library selections, and course/card expansion while switching. Edit opens the corresponding builder; Save and Cancel return to the library and reset completed drafts. Quiz question selection and practical devices, topology, grading criteria, class assignments, and answer-key actions remain in their existing content context. Creation/reset, edit/save, draft retention, populated-library state, refresh/history, phone/desktop containment, and independent card sizing are covered with intercepted database requests. Independent review found no actionable correctness issues and requested the populated-library coverage, which was added. An intermittent administrator history test passed twice in isolation; explicit URL waits and a document-reload assertion were added before final verification. All eight final Chromium checks pass, along with lint and the production build. Desktop quiz library and phone practical builder layouts were visually inspected. No migration is required; actual authenticated acceptance remains pending. Changes remain local, uncommitted, and unpublished for localhost review. |
| 2026-11-12 | Added Question Bank subsections locally under F1.3B | Added Question library (default), Create / edit question, Course modules, and Import / export using the shared subsection navigation and instructor/administrator routes. Mounted panels retain unsaved drafts, module filters, and selected import files across switches. Library Edit opens the editor; successful saves and edit cancellation return to the filtered library. Successful creation resets the completed form. All nine focused Chromium checks pass, covering both roles, phone/desktop containment, refresh/history, draft/import retention, creation/edit saves, module-filter actions, and complete 1550-row loading. Lint and the production build pass. Desktop library and phone editor layouts were visually inspected. Independent review found no actionable correctness issues and requested the successful-creation regression, which was added and passed. No database migration is required. Actual authenticated acceptance remains pending; changes are local, uncommitted, and unpublished for localhost review. |
| 2026-11-12 | Fixed the local 1000-question cutoff | The Question Bank and quiz-builder loaders previously made a single Supabase select request. Added a shared batch loader ordered by created_at and id, advancing by the actual returned row count and stopping on an empty batch. Both loaders preserve their existing columns and transformations, including answer-option sorting and the builder's archived-question exclusion. Browser checks confirm 1550 sample bank questions, all 550 questions in a module beyond the first batch, and 1549 eligible builder questions after excluding one archived fixture, under both 1000- and 500-row response caps. All five pagination/module-filter browser checks, 95 unit tests, lint, and the production build pass. Unit coverage includes empty banks, exact boundaries, short responses, and later-batch failure without partial results. Independent review found no actionable issues or material gaps. Updated module-filter mocks to honor ranges and registered the new unit checks in npm test. Actual authenticated record counts remain for owner verification. The server remains at localhost:5173; changes are local, uncommitted, and unpublished. No migration is required. |
| 2026-11-12 | Added a Question Bank module filter locally under UX2 | Added a module dropdown with course-qualified labels, All modules, Unassigned module, and Clear filter. Filtering updates course sections, counts, tables, and bulk-selection scope. Filter state is stored in the parent so publish/delete refreshes retain it. Changing filters clears selection; mutation requests use only visible selected question IDs. A removed named-module option resets to All, while an empty Unassigned filter shows a clear message. Three browser regressions pass with isolated data for instructor/admin views, duplicate module codes across courses, filtered publish requests, persistence, deletion recovery, and empty states. Desktop and phone previews were visually checked with zero page overflow. Lint and the production build pass; independent review found no actionable issues or material gaps. Updated the information architecture blueprint. No migration is required. Changes remain local, uncommitted, and unpublished for owner acceptance. |
| 2026-11-12 | Fixed CLI practical card stretching locally under UX2 | Reproduced a collapsed sibling growing from about 134 to 497 pixels when another card expanded. Set the CLI library grid to align items at the start so cards keep independent content heights. Two browser regressions pass at 1920 and 390 pixels, covering expansion, answer-key display, collapse, another card's expansion, unchanged sibling dimensions, and zero horizontal overflow. Desktop top alignment was visually checked with sample practicals. The position assertion uses document coordinates so browser scrolling is accounted for. Lint and the production build pass. The change remains local, uncommitted, and unpublished for owner review. |
| 2026-11-12 | Polished class student-search actions locally under UX3 | Replaced the inherited bulk-action layout with dedicated compact Search and Clear search controls and shared Lucide icons. Removed inherited label margins so the input and buttons align at 48 pixels on desktop. Phone layouts place equal-width buttons beneath the input. Browser measurements at 1440, 390, and 320 pixels confirm aligned controls and zero horizontal overflow; desktop and compact-phone screenshots were visually inspected. Lint and the final production build pass. Search behavior is preserved. Changes remain local, uncommitted, and unpublished for owner review. |
| 2026-11-12 | Exempted quiz fullscreen exits locally under Phase 5 | The client no longer records or warns about quiz fullscreen exits, including Escape. Because fullscreenchange does not identify the exit mechanism, all quiz fullscreen exits are exempt. Page-hidden monitoring remains active, and CLI fullscreen monitoring is preserved. Two browser regressions pass against the real hook with intercepted RPC responses; lint and the production build pass. Prepared migration 067 to ignore legacy quiz fullscreen events and exclude historical fullscreen rows from incident limits while retaining ownership checks and page-hidden/time-away enforcement. Independent review found no actionable issues. The migration has not been applied or runtime-tested against Supabase; database and authenticated acceptance remain pending. Updated the Phase 5 acceptance guide. Changes remain local, uncommitted, and unpublished. |
| 2026-11-12 | Added one enrolled-student search across Your classes locally under UX2 | Search by student name or email now displays only matching class cards and matching enrolled students. Matching rosters open automatically; Clear search restores all classes and the previous roster expansion state. Search survives subsection switching and supports Enter submission. Applying or clearing a search resets deletion selections; bulk deletion submits only selected visible class IDs. Instructor and administrator browser scenarios pass with sample rosters, including the intercepted deletion payload; the class-draft regression also passes. Phone-width containment, lint, and the production build pass. Independent review found no actionable code issues and requested the deletion-payload check, which was added and verified. The administrator scenario required a longer test timeout for its extended sequence. All test writes were intercepted. Changes remain local and uncommitted, with actual-record acceptance pending. |
| 2026-11-12 | Corrected filtered Student Results summaries locally under F2 | Quiz and CLI summary cards now recalculate total attempts, active attempts, pass rate, and average score from matching attempts. Search and result-status filters are included. Graded attempts determine pass rate and average score; empty or active-only selections return zero percentages. Watched the quiz regression fail with all-record totals after selecting a class, then verified both quiz and CLI browser checks pass with isolated sample data. Lint and the production build pass. The localhost server is running at port 5173. Changes remain uncommitted and unpublished for owner review. No migration is required; authenticated acceptance with actual records remains pending. |
| 2026-11-11 | Implemented F1.3B locally for owner review | Added addressable Classes, Exam Controls, and Student Results subsections in instructor and administrator contexts. Preserved mounted form/filter state and existing management actions; linked practical access to the CLI builder. Fixed unsaved policy fields being overwritten by unchanged polling responses. Six focused browser checks pass with intercepted Supabase requests, including CLI policy saving and refresh retention. All 89 unit tests, lint, and the production build pass. Visually checked desktop Classes and phone CLI policies. Of 24 existing workspace/responsive browser checks, 23 passed on the first run; the remaining keyboard test passes after adding workspace readiness and keyboard input to the test. Independent review found no actionable issues. The owner requested localhost testing before any commit or push. No database migration is required; authenticated acceptance remains pending. |
| 2026-11-11 | Updated the shared workspace header logo under UX5 | Reused the supplied favicon PNG in BrandMark with a base-aware URL and fixed 34 by 34 dimensions; removed the superseded SVG styling. The image is decorative beside the existing application name. Lint and the production build pass. Browser checks confirm the image loads at desktop and phone widths for student, instructor, and administrator previews; the instructor desktop header was visually inspected. Published as commit 8101f7a. [Pages deployment](https://github.com/LightYagami2k16/ccna-assessment-system/actions/runs/42991975301) and the [production smoke test](https://github.com/LightYagami2k16/ccna-assessment-system/actions/runs/42992083341) passed. The live application contains the new header image reference and release SHA; the page, dashboard script, and icon return HTTP 200. |
| 2026-11-11 | Added the supplied website favicon under UX5 | Copied the original PNG to public/favicon.png and linked it from index.html using the configured Vite base URL. The production build passes; the built HTML resolves the icon under /ccna-assessment-system/ and the built PNG matches the supplied file. Published as commit af88197. [Pages deployment](https://github.com/LightYagami2k16/ccna-assessment-system/actions/runs/42990893682) and the [production smoke test](https://github.com/LightYagami2k16/ccna-assessment-system/actions/runs/42990983125) passed. The live page links to the PNG; the icon returns HTTP 200 with image/png and its SHA-256 matches the uploaded file. Browser-tab appearance has not been visually inspected. UX5 remains open for its other visual and language checks. |
| 2026-11-11 | Prepared the login description and dependency security fix | Updated the local login description to match GitHub commit adf0fa7. Deployment 52 failed during the dependency audit before building. Updated locked versions of brace-expansion to 1.1.21, js-yaml to 4.3.2, source-map-js to 1.2.2, and Vite to 7.3.8 within existing package ranges. Clean installation and audit report zero vulnerabilities; all 89 unit tests, lint, and the production build pass. The build required access beyond the restricted local process. Published as commit 4257cbb. [Pages deployment 53](https://github.com/LightYagami2k16/ccna-assessment-system/actions/runs/42985952993) and the [production smoke test](https://github.com/LightYagami2k16/ccna-assessment-system/actions/runs/42986058985) passed. The live HTML and application script returned HTTP 200; the script contains the updated login wording and release SHA. No database migration is required. |
| 2026-11-09 | Completed the read-only F1.3B source walkthrough | Mapped Classes, Exam Controls, and Student Results to the existing subsection blueprint, including shared administrator routes. Confirmed practical assignments currently live in the CLI builder. Visual and authenticated acceptance checks remain pending. |
| 2026-08-18 | Standardized successful sign-in landing pages | Student, instructor, and administrator credential sign-ins now open their role Overview. Existing signed-in sessions still preserve the current route on refresh and browser navigation. |
| 2026-08-18 | Completed F1.3A instructor Overview | Instructors now land on a stable Overview page with seven focused tool shortcuts. The redundant course catalogue was removed, administrator assessment tools retain their existing context, and routing plus compact responsive checks pass. |
| 2026-08-18 | Completed F1.2 student pages | The student workspace now provides stable Overview, Quizzes, CLI practicals, Results & history, My classes, and Exam guide pages. Refresh, Back/Forward, role guards, compact-phone through desktop containment, and assessment focus behavior pass focused tests. |
| 2026-08-18 | Cleared protected workspace routes after logout | Signing out, inactivity logout, and signed-out protected-route entry now return the address bar to the base site URL without altering Supabase authentication links. |
| 2026-08-18 | Completed F1.1 route foundation | Stable role routes, refresh and Back/Forward persistence, role guards, legacy-state compatibility, and student assessment focus addresses pass focused browser tests. |
| 2026-08-18 | Completed the UX1 information architecture | Student, instructor, and administrator site maps, route conventions, page ownership, redundancy cleanup, and F1 implementation slices are documented. |
| 2026-08-18 | Added administrator class-teacher identity | Migration 066 has been applied as confirmed by the project owner. |
| 2026-08-18 | Updated account inactivity logout to 15 minutes | The local application now signs out an inactive account after 15 minutes instead of five; deployment is pending the next requested release. |
| 2026-08-18 | Added stale deployment-component recovery | Complete and deployed through GitHub; old open tabs recover with one guarded reload. |
| 2026-08-18 | Consolidated the remaining roadmap | This document becomes the source of truth for unfinished sprints. |

## Update procedure

For every completed task:

1. update the relevant sprint status;
2. check or revise its completion criteria;
3. add a dated row to the progress log;
4. note any required migration or manual production action; and
5. commit the roadmap update with the related implementation whenever possible.
