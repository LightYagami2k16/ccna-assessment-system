# Student Overview summaries acceptance

## Behavior

- Active attempt status is checked separately from availability. A verified unfinished quiz or CLI practical shows its title, expiry and Resume action.
- A failed status lookup shows an error and preserves saved attempt IDs; it never claims there is no attempt in progress.
- Available quizzes and CLI practicals have separate compact summary cards showing counts; assessment items are hidden from the overview cards. Each category has exactly one Show Details button, opening a modal with all available assessments in that category. Each assessment shows course/module, description, duration, passing score, maximum/used/remaining attempts, and quiz deadline or CLI device type when supplied. The button is disabled when no items are loaded or available. Missing metadata is identified rather than guessed. View quizzes/View practicals navigation is inside the popup. The popup does not start an attempt; native modal focus containment, Escape, Close details, Done and focus restoration are supported. Archived, exhausted and in-progress assessments are excluded. View actions open their existing assessment pages.
- Initial counts remain unknown until successfully loaded. Resource errors are independent; failed refreshes retain the last successful data and label it accordingly.
- Upcoming assessments show authorized future quiz openings and matching closing dates in the browser's local timezone. CLI practical scheduling is not currently supported by the database.
- The overview refreshes quietly every 30 seconds while visible and when focus returns. Retry appears only after a resource or status failure. Refreshes stop when leaving the overview.

## Database preparation

`supabase/migrations/069_student_upcoming_assessments.sql` adds the student-scoped, read-only upcoming RPC. It has been tested in an isolated database, but has not been applied to Supabase. Until applied, the upcoming card displays an unavailable message; available assessments remain usable. Apply earlier migrations in order before 069.

The query respects published status, active class membership, accommodation/assignment/quiz schedule precedence, archive preferences, remaining attempts and live attempts. Its security-definer path is fixed, anonymous access is revoked and authenticated execution still requires a student identity. Each opening retains its own closing window.

## Verification and owner walkthrough

Automated browser scenarios intercept all Supabase responses. They cover eligible counts, navigation, active quiz/CLI resume, failed status recovery, missing upcoming RPC, retained partial data, automatic refresh, initial unknown/error states and phone containment. Unit checks cover lifecycle classification and schedule validation. The isolated SQL harness checks role/grant restrictions, student isolation, schedule overrides, archive/attempt limits, deterministic payloads and read-only execution.

At http://localhost:5173, sign in as a student and compare the overview with the existing quiz and practical lists. Resume a real unfinished attempt, check empty classes, and test a future quiz after applying 069. Real authenticated acceptance and Supabase migration application remain pending. No commit or push is authorized for this change.

Local verification result: 99 unit checks, 14 Chromium browser scenarios, lint and production build pass. Desktop and 390px screenshots were visually inspected. Independent review found no actionable issues.

Category-popup verification (2026-11-13): 11 Chromium browser scenarios verified, including a clean rerun of both popup checks after local documentation reloads interrupted one desktop assertion. All 100 unit tests, lint, production build and diff checks pass. Desktop and phone screenshots inspected. Exactly one Show Details button appears per card; item titles remain hidden until the corresponding popup opens. Both category lists, metadata, navigation, Escape/focus restoration, forward/reverse Tab containment and phone sizing are covered. Native-browser keyboard focus was reproduced leaving a modal for the browser chrome; explicit first/last-button cycling now keeps focus inside. Authenticated owner acceptance remains pending.

## Collapsible popup items and action placement — 2026-11-13

Category Show Details actions sit beside their item count in the header, grouped on the right. The separate footer/divider is removed; headings and controls wrap on narrow screens. Popup items start collapsed, showing only their title and an accessible Show details toggle. Expanding an item reveals its existing metadata and changes the toggle to Hide details. Cards expand independently; closing/reopening the popup resets them to collapsed. Expanded state is exposed through aria-expanded and aria-controls. No new API or database change is required. Three focused Chromium checks, full lint, production build and diff checks pass. Coverage includes both categories, independent expansion/collapse, reset on reopen, hidden initial metadata, navigation, keyboard focus and phone sizing. Desktop action placement and desktop/phone collapsed popup screenshots were visually inspected. Authenticated owner acceptance remains pending.

Count-adjacent action follow-up: moved Show Details beside the count in a right-aligned, wrapping header group and removed the footer/divider. Both existing desktop/phone popup scenarios, full lint, build and diff checks pass. The compact category-header screenshot was visually inspected. No commit or push.
