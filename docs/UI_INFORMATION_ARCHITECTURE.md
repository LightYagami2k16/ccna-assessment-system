# CCNA Assessment System — Information Architecture Blueprint

Last updated: August 18, 2026

This document defines the approved role-based page structure for the next
frontend implementation sprint. It reorganizes the existing application; it
does not change assessment rules, permissions, scoring, or stored data.

## Design principles

1. Give every page one primary purpose.
2. Keep navigation labels short, familiar, and consistent across roles.
3. Give major features stable addresses so refresh and browser navigation
   preserve the user's location.
4. Keep quiz and CLI attempts in an isolated assessment focus mode.
5. Show summaries on overview pages and detailed records only on their owning
   pages.
6. Preserve role guards and existing database authorization.
7. Use the same responsive navigation model across student, instructor, and
   administrator workspaces.

## Shared application shell

Every signed-in workspace uses the same shell:

- product identity and role in the header;
- account settings and sign out in the global account area;
- persistent desktop navigation and a mobile navigation drawer;
- one page title, one supporting description, and optional breadcrumbs;
- a main content region with a visible keyboard-focus target; and
- feature-level loading, empty, offline, permission, and error states.

Account settings remains a global dialog. It is not a separate workspace page.

Initial data loading belongs inside the selected feature panel, below its heading;
it must not insert an extra block above subsection navigation. Until the first
successful response, counts show — rather than implying an empty dataset. Later
refreshes retain populated content and local filter/expansion state, using compact
button feedback. Failed refreshes retain the last valid view and show the error.
Automatic Live Monitoring polling remains silent. See
[loading-state acceptance](LOADING_STATES_ACCEPTANCE.md) for scope and verification.

Loading feedback does not require a permanent refresh control on every panel.
Content libraries, templates and configuration forms use their existing automatic
reloads; contextual Retry is available after a fetch failure. Keep manual refresh
where other users can change the displayed information, such as monitoring,
reporting, instructor enrollment approvals and administrator records. Embedded student histories
refresh quietly on returning focus and show Retry only after a fetch failure.

Assessment focus mode removes the normal dashboard, course catalogue, and role
navigation until the attempt is submitted or exited through an allowed action.

## Route convention

The application is hosted on GitHub Pages, so implementation should use stable
hash-based routes unless the hosting strategy changes.

### Student routes

| Address | Navigation label | Primary task |
| --- | --- | --- |
| `#/student/overview` | Overview | See current priorities and resume active work. |
| `#/student/assessments` | Quizzes | Start, resume, or archive assigned quizzes. |
| `#/student/practicals` | CLI practicals | Start, resume, or archive CLI practicals. |
| `#/student/history` | Results & history | Review completed quiz and CLI attempts. |
| `#/student/classes` | My classes | Join a class and review enrollment status. |
| `#/student/guide` | Exam guide | Learn the assessment workflow and requirements. |
| `#/student/quiz/:attemptId` | Assessment focus | Take one quiz attempt. |
| `#/student/practical/:attemptId` | Assessment focus | Take one CLI practical attempt. |

### Instructor routes

| Address | Navigation label | Primary task |
| --- | --- | --- |
| `#/instructor/overview` | Overview | See teaching and assessment priorities. |
| `#/instructor/question-bank` | Question bank | Manage modules, questions, and question files. |
| `#/instructor/quizzes` | Quizzes | Build and manage quizzes. |
| `#/instructor/practicals` | CLI practicals | Build and manage practical exams and answer keys. |
| `#/instructor/classes` | Classes | Manage classes, enrollments, approvals, and access. |
| `#/instructor/exam-controls` | Exam controls | Schedule, monitor, and configure exam enforcement. |
| `#/instructor/results` | Student results | Review, export, and analyze quiz and CLI outcomes. |
| `#/instructor/content-backup` | Content backup | Export, validate, restore, and protect content. |

### Administrator routes

| Address | Navigation label | Primary task |
| --- | --- | --- |
| `#/admin/overview` | Overview | See platform health and unresolved priorities. |
| `#/admin/users` | User accounts | Invite, manage, disable, or delete accounts. |
| `#/admin/classes` | Class oversight | Review classes with their responsible instructor. |
| `#/admin/security` | Security history | Review authentication and administrative events. |
| `#/admin/system-health` | System health | Review safe operational diagnostics. |
| `#/admin/assessment-tools/*` | Assessment tools | Open approved instructor content tools in administrator context. |

The administrator must not contain a second, nested instructor navigation bar.
Administrator assessment-tool routes should reuse the underlying content
components while retaining the administrator shell and authorization context.

## Page content map

### Student workspace

#### Overview

- active assessment with one resume action;
- available quiz and CLI counts;
- next scheduled or expiring assessment;
- most recent result;
- current class/enrollment status; and
- shortcuts to Quizzes, CLI practicals, Results & history, and Exam guide.

The full course catalogue does not repeat here. Course membership belongs on My
classes, while assessment cards belong on their assessment pages.

#### Quizzes

Use addressable subsections: Quiz library (default), Create / edit quiz, and
Templates. Retain the mounted editor and library when switching subsections.
Library Edit opens the editor; successful save or Cancel returns to the library
and clears the completed editor session. Course expansion and bulk selections
remain in the library. The same routes apply within administrator assessment tools.

- available and resumable quiz cards;
- remaining attempts, duration, due date, and class assignment;
- archive/restore behavior when attempts remain; and
- a single refresh/synchronization action.

#### CLI practicals

Use addressable subsections: Practical library (default), Create / edit practical,
and Templates. Retain draft devices, topology, criteria, assignments, library
expansion, and bulk selections while switching. Edit opens the builder; successful
save or Cancel returns to the library and resets the completed draft. Answer keys
remain contextual to each library card. Support both instructor and administrator
assessment-tool addresses.

- available and resumable practical cards;
- course/module, duration, attempts, and device/topology summary;
- archive/restore behavior when attempts remain; and
- a single refresh/synchronization action.

#### Results & history

- quiz history grouped by quiz with attempts beneath it;
- CLI history using the same visual hierarchy;
- raw score, percentage, outcome, and completion time; and
- optional attempt review only when feedback is released.

#### My classes

- active memberships;
- pending enrollment requests;
- class-code and QR enrollment entry; and
- clear ownership/instructor information where allowed.

#### Exam guide

- preparation checklist;
- autosave and offline-recovery explanation;
- integrity-monitoring explanation;
- submission and expiry behavior; and
- browser/device requirements.

### Instructor workspace

#### Overview

- pending enrollment approvals;
- active assessment attempts and integrity-event totals;
- assessments ending soon;
- recent submissions; and
- shortcuts to create a question, quiz, practical, or class.

#### Question bank

Use internal subsections because all actions manage the same content domain:

1. Question library grouped by course with module filtering (default)
2. Create / edit question
3. Course modules
4. Import / export and validation

Each subsection has its own address in instructor and administrator assessment
tools. Switching subsections retains drafts, module filters, and the selected
import file. Library Edit opens the editor; saving or cancelling an edit returns
to the library. A successful save resets the completed editor form.

The library module filter lists modules represented in its loaded questions,
with course-qualified labels, All modules, and Unassigned module. Choosing a
module shows only matching questions and opens the matching course sections.
Counts and bulk selection follow the filter. The filter remains selected after
question updates; if its last question is deleted, a named module filter resets
to All modules. Unassigned remains selectable even when it has no questions.

The primary action is **Create question**. Bulk publish, unpublish, and delete
remain contextual actions inside the library.

#### Quizzes

- quiz builder opened only when creating or editing;
- quiz library grouped by course;
- question-selection rules and random-pool settings; and
- publish, duplicate, assign, and delete actions.

#### CLI practicals

- practical builder opened only when creating or editing;
- practical library grouped by course;
- answer-key review;
- topology/device summary; and
- publish, duplicate, assign, and delete actions.

#### Classes

Use page-level subsections or tabs:

1. Your classes
2. Enrollment approvals
3. Quiz and practical access

Creating a class is an explicit primary action that opens a focused form. Class
cards remain independently collapsible and never resize sibling cards.

#### Exam controls

Use page-level subsections or tabs:

1. Assignment schedules
2. Integrity enforcement
3. Student accommodations
4. Live monitoring

Live monitoring must group active attempts by class and student while showing
quiz and CLI activity consistently.

The local monitor now groups Class → exact quiz/CLI practical → student attempts.
Class, assessment-type, and exact-assessment filters control the displayed groups,
counts and cards; same-title assessments use separate database identities.
Student-name search sits before Class, matches partial names case-insensitively,
and combines with these filters. Clear filters resets the search as well.
Filtered groups open automatically, with previous expansion restored on Clear.
Filters persist across polling, manual refresh, and subsection switching.
Student attempt cards start collapsed, retaining the name, email and event count.
Show details reveals monitoring fields and the submission action; Hide details
collapses that attempt independently. Expanded state survives refresh and polling.
Each attempt has a confirmed Submit attempt action for authorized instructors or
administrators. It grades saved server work, ends the current attempt, revokes its
browser lease and records an audit row. Busy attempts return a safe retry message.
Migration 068 is required and remains unapplied; without it the action is disabled.
See [Live Monitoring acceptance](LIVE_MONITORING_ACCEPTANCE.md).

#### Student results

Use page-level subsections or tabs:

1. Overall results
2. Quiz results
3. CLI practical results
4. Question analytics
5. Performance trends and mastery

Filtering and CSV export apply consistently to quiz and CLI results. Detailed
reviews remain nested under a selected student and attempt rather than shown on
the landing view.

#### Content backup

- export summary and scope;
- safe import/restore workflow;
- validation report before mutation; and
- reusable templates and content portability actions.

### Administrator workspace

#### Overview

- total and active accounts by role;
- class and instructor ownership summary;
- unresolved security and system-health events;
- recent administrative activity; and
- direct links to the relevant administration page.

#### User accounts

- search and role filter;
- invitation workflow;
- role and access management;
- protected password/reset processes; and
- account deletion with last-administrator safeguards.

#### Class oversight

- every valid class with teacher name and email;
- student/enrollment totals;
- orphaned or invalid ownership warnings; and
- administrator-only corrective actions.

#### Security history

- categorized, privacy-safe administrative and authentication events;
- date, category, actor type, and outcome filters; and
- retention/cleanup status.

#### System health

- safe frontend, network, authorization, and backend-service categories;
- release/build identifier;
- unresolved recurring issue groups; and
- links to operational documentation.

## Redundant elements to remove during implementation

- the complete course catalogue repeated above every role workspace;
- a portal hero, workspace hero, page title, and card heading that repeat the
  same label on one screen;
- duplicate refresh controls within one feature;
- repeated instructions already present in a page description;
- nested administrator and instructor navigation systems;
- active-assessment banners inside the assessment focus route;
- repeated result totals in both an outer panel and its first inner card;
- decorative status pills that restate adjacent text; and
- oversized buttons that visually resemble empty content panels.

## Navigation and state behavior

- The URL is the source of truth for the selected page.
- Existing local-storage section values may be read once for backward
  compatibility, then translated to the corresponding route.
- Browser Back and Forward must move between workspace pages normally.
- Refresh must restore the same authorized page.
- Unauthorized routes redirect to the signed-in role's overview and show a
  feature-level permission notice.
- Unsaved builders warn before route changes.
- Successful assessment submission returns to Results & history; exiting an
  unsubmitted attempt returns to the originating assessment list when allowed.
- Account settings closes back to the same page and restores keyboard focus to
  the button that opened it.

## Responsive and accessibility requirements

- Desktop uses a persistent sidebar; tablet and phone use a labeled navigation
  disclosure or drawer.
- Navigation never forces horizontal page scrolling.
- Current-page state is conveyed by text/semantics, not color alone.
- Page headings follow a single logical `h1` hierarchy.
- Main content receives focus after a route change.
- Touch targets remain at least 44 by 44 CSS pixels where practical.
- Tables keep their own keyboard-focusable horizontal region on narrow screens.
- Cards switch to a single column before their controls wrap or overlap.
- Reduced-motion preferences disable nonessential route and drawer animation.
- Assessment focus routes retain keyboard, zoom, and screen-reader usability.

## F1 implementation slices

### F1.1 — Routing foundation

- introduce the route table and role guards;
- create the shared role shell and route-aware navigation;
- migrate stored section values to routes; and
- add refresh, Back/Forward, and unauthorized-route tests.

### F1.2 — Student pages

- split overview, quizzes, CLI practicals, history, classes, and guide;
- keep quiz and CLI focus routes isolated; and
- preserve active-attempt and offline-recovery behavior.

### F1.3 — Instructor pages

- split all seven instructor feature areas plus overview;
- retain builders, collapsible groups, filters, exports, and monitoring state;
- add internal subsections only where defined in this blueprint.

### F1.4 — Administrator pages

- split accounts, class oversight, security, health, and assessment tools;
- remove nested instructor navigation; and
- preserve explicit administrator permissions.

### F1.5 — Regression and cleanup

- remove superseded conditional-workspace and duplicate presentation code;
- verify deep links at GitHub Pages paths;
- run role, responsive, keyboard, accessibility, and assessment-focus tests; and
- complete a visual walkthrough for all three roles.

## Approval and completion record

This blueprint completes UX1 when it is accepted as the implementation source
for F1. Material changes to navigation, page ownership, or permissions should be
recorded here before implementation diverges from it.

## Student Overview summary update — 2026-11-13

The Overview now separates verified in-progress work from ready-to-start quiz and CLI practical summaries, and from upcoming scheduled quizzes. Availability cards own the links to Quizzes and CLI practicals; the remaining workspace shortcuts are Results & history, My classes and Exam guide. Counts start unknown and exclude archived, exhausted and active work. Failed requests preserve populated data and expose category-specific feedback. A failed active-session lookup cannot produce a ready banner. Visible-page polling/focus refresh keeps the summaries current; a Retry action appears only after a failed load. Migration 069 supplies authorized future quiz windows; it is prepared locally and not applied to Supabase. CLI scheduling and recently completed-work summaries remain outside this slice. See STUDENT_OVERVIEW_ACCEPTANCE.md for verification and owner checks.


## Student refresh cleanup — 2026-11-13

Student Overview, Quizzes, CLI practicals, Results & history and My classes omit routine refresh buttons. Existing entry/action reloads remain. Visible availability and enrollment pages update every 30 seconds and when focus returns; history updates on focus, and Overview retains its existing polling. List polling pauses during active practicals and start/archive/restore/join actions. Failed loads offer contextual Retry, preserving populated content, enrollment expansion and the class-code draft. Instructor and administrator controls retain their existing scope.


## Available-assessment detail popups — 2026-11-13

Available quizzes and Available CLI practicals each show a count and a single Show Details button; their assessment lists are hidden from the overview cards. It opens an informational modal listing every available assessment in that category using the existing student-scoped availability and lifecycle data. Details include course/module, description, duration, passing score and attempt allowance; quiz deadlines and CLI device type appear when applicable. View quizzes/View practicals navigation is provided inside the popup. The modal cannot start/resume attempts, adds no data request, and uses native focus containment and Escape dismissal. No new migration is required.


## Collapsible assessment item cards — 2026-11-13

Category Show Details controls sit beside the count in a right-aligned header group. The group wraps on narrow screens without a separate footer or divider. Popup assessments start collapsed with only their name and a Show details toggle. Each card independently reveals/hides its metadata, exposes its expanded state and panel association, and resets when the popup is closed and reopened. Existing popup navigation and keyboard controls remain. See STUDENT_OVERVIEW_ACCEPTANCE.md for local verification.


## Instructor assessment library item popups — 2026-11-13

Quiz library and CLI Practical library cards show only the assessment title and Show details. Native dialogs hold each record’s metadata and existing management actions. Individual CLI selection and answer keys are inside the popup; course grouping and bulk tools remain on the page. Editor actions close the popup before navigation. Active-section changes or removal of a record close its dialog; reloads preserve a still-existing selected record. The shared modal handles Escape, close/Done actions, nested confirmations and keyboard focus through buttons, checkboxes and action selectors. See INSTRUCTOR_LIBRARY_DETAILS_ACCEPTANCE.md.


## Your classes item popups — 2026-11-13

Your classes uses compact class-name and Show details cards. The shared native popup has a Class details label and contains status, identifier/term, administrator teacher identity, roster, password reset, join-code/QR/manual enrollment tools, individual selection and edit/delete controls. Search and bulk actions remain on the page; matching-student filtering and controlled roster/selection state are preserved within popups. The popup closes before editing and on section/filter/record removal. Nested join-code confirmation cancellation and keyboard events are handled by the owning dialog, leaving its parent popup open. See CLASS_DETAILS_ACCEPTANCE.md.


## Student attempt review release — 2026-11-13

Each quiz/practical library detail popup has an independent Student attempt review setting with an explicit save. It defaults off and applies to that assessment’s own completed/expired student attempts, including earlier submissions. Student Results & history owns the fresh-authorized review action and read-only popup; grades remain independent. Reviews include submitted work, scoring feedback and correct answers/expected CLI configuration. Current-policy checks and guarded underlying access live in migration 070; it is prepared locally and not applied. See STUDENT_ATTEMPT_REVIEW_ACCEPTANCE.md for historical-content limitations and owner checks.


## Student review schedules and creation controls — 2026-11-13

Quiz/CLI create and edit forms now own review availability alongside content: disabled, after submission, or a scheduled opening with optional closing. The existing library detail-popup policy uses the same fields and saves independently. Local datetime inputs serialize to ISO timestamps, while database permission checks enforce opening-inclusive/closing-exclusive access. Existing edit policies must load before saving. Migration 071 adds atomic assessment/review saves (including CLI topology) and extends the 070 review guards. Both migrations remain prepared locally, not applied by this work. Student result tables reserve an explicit Review column and an icon action, retaining phone cards and tablet scrolling. See STUDENT_ATTEMPT_REVIEW_ACCEPTANCE.md.
