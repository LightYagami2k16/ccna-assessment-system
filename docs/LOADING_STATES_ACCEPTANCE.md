# Initial loading and refresh feedback

Local implementation, 2026-11-13. No migration, dependency, commit, push, or
production change is required for this presentation update.

## Agreed behavior

1. First API loads use the centered LoadingState inside the relevant content
   panel. Page headings, workspace navigation and section headings remain visible.
2. Once a request succeeds, refreshes keep the existing populated content mounted.
   Where manual refresh is useful, RefreshButton supplies compact animated feedback
   and prevents repeated clicks while that request is active. Its two label widths
   are reserved to avoid jumps. Automatic post-save reloads retain their existing
   action feedback and do not require a permanent refresh button.
3. Counts and metrics show — until the first successful response. A successful
   empty response may then show zero and the appropriate empty-state explanation.
4. Initial errors show an unavailable message and the existing error detail, with
   a contextual Retry action where routine refresh is absent. Failed refreshes retain the last
   successful records and show an error; they do not clear the view.
5. Filters, selections and expanded groups/cards stay mounted during refresh.
   Business rules still remove references to records actually deleted by the server.
6. Successful new-class creation resets the completed form explicitly; ordinary
   refresh retains an unfinished class draft. Existing question/quiz/practical
   save-reset behavior is preserved.
7. Live Monitoring's automatic ten-second polling remains silent. Manual Refresh
   now uses the button indicator, without adding a block above subsection navigation.

## Applied screens

| Area | Screens |
| --- | --- |
| Instructor content | Question Bank library/course modules; quiz library/templates/editor initial state; practical library/templates/editor initial state |
| Instructor classes and controls | Your classes, approvals, quiz access; schedules, integrity policies, accommodations, Live Monitoring |
| Instructor reporting | Overall Results, quiz results, CLI results, question analytics and performance trends |
| Student | Available quizzes/practicals, quiz/CLI history, class enrollment; contextual Retry replaces routine student refresh controls |
| Administrator | Accounts and security history |

The existing System Health retained-data pattern remains in place. Authentication,
lazy route-module fallbacks, active quiz/CLI exam players and browser-session
enforcement were not changed.

## Manual refresh placement

- Removed routine controls from quiz/question/practical libraries, quiz/practical
  templates, Course modules, Quiz access, and schedule/integrity/accommodation forms.
  These reload after their own changes; Exam Controls also polls every ten seconds.
- Removed routine student refresh controls from Overview, available quizzes/practicals,
  Assessment history (including standalone histories), and class enrollment. These
  reload on entry, relevant actions and returning focus. Availability and enrollment
  also poll every 30 seconds while visible; active practicals pause list polling.
  Overview retains its existing visible-page polling. Fetch failures expose Retry only.
- Kept useful instructor refresh actions for monitoring, reporting, Your classes,
  enrollment approvals, and administrator records/history.
- Quiz editor first-load placeholders offer Retry only after failure.
- A fetch failure exposes Retry in the affected panel. A failed automatic reload
  keeps its previous records/filter/expansion visible; Retry reloads data rather
  than repeating the create, publish or delete operation. It disappears after recovery.
- Validation and successful-save messages do not expose Retry. Fetch failures are
  tracked separately. Existing initial loaders and unknown-count handling remain.

## Verification

- Delayed mocked API requests test first-load placement, headings/navigation,
  unknown counts, stable headings, populated refresh retention, error retention,
  empty successes and retry recovery.
- Class tests check draft retention and successful-create reset explicitly.
- Admin tests mock auth and all data requests, including initial failures and
  populated audit groups. They never invoke real account mutations.
- Student tests cover all five data components and enrollment-error recovery.
- Existing instructor workflow regressions cover retained drafts/imports, module
  filtering and publish scope, class search/deletion scope, filtered result
  metrics, live submission/detail controls, and independent practical card sizing.
- Desktop first load, desktop refresh, and phone unknown-count panels were
  inspected with isolated sample responses.

Actual authenticated owner acceptance with Supabase and naturally slow connections
remains a manual localhost check. No production database was modified by these tests.

## Local owner walkthrough

Open localhost:5173, select each relevant section, and check that its heading and
navigation stay visible. Refresh a populated screen and verify the content, search,
selection and expansion remain visible. On student pages, return focus to trigger
a quiet update and confirm no routine refresh button is shown.
Repeat at phone width. With a simulated failed request, confirm the old records
remain and a later successful retry clears the fetch error.

Student refresh cleanup verification (2026-11-13): 19 Chromium browser checks, all 99 unit checks, lint, production build and diff checks pass. Verified focus and interval freshness, no routine student buttons, contextual Retry, retained content and class-code draft, hidden-page polling pause and navigation cleanup. All browser requests were intercepted; authenticated owner acceptance remains pending. No new migration, dependency, commit or push.
