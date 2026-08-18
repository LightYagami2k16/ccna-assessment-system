# CCNA Assessment System — Project Roadmap and Progress Log

Last updated: August 18, 2026

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
  - **F1.3B dense-page subsections — Next.** Simplify Classes, Exam Controls,
    and Student Results into focused internal subsections while preserving all
    existing forms, filters, monitoring, exports, and review workflows.

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

### UX3 — Buttons, forms, and action menus

Status: **Partially complete**  
Priority: **Medium**

Completion criteria:

- primary, secondary, danger, icon, and link actions are visually consistent;
- dropdowns, inputs, checkboxes, and action menus share compatible dimensions;
- disabled and loading states remain readable;
- oversized controls no longer resemble empty content panels; and
- the shared Lucide icon system is used consistently.

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
