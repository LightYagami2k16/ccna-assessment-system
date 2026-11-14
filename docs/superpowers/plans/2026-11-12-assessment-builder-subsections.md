# Assessment Builder Subsections Implementation Plan

**Goal:** Extend the established subsection navigation to Quizzes and CLI practicals.

**Architecture:** Reuse workspaceSubsections, useInstructorSubsection, and mounted hidden panels. Each page has Library (default), Create / edit, and Templates. Keep question selection inside the quiz editor and topology, criteria, and class assignments inside the practical editor. Answer keys stay in the practical library. Existing actions retain their behavior.

**Tech stack:** React, Vite, Supabase, Playwright.

**Constraints:** Work in the current local workspace; preserve unrelated changes. No commit or push. No database migration. Update the roadmap. Drafts and library state survive ordinary subsection switches; explicit cancel and successful save reset completed sessions.

- [x] Add and run a failing regression for missing quiz/practical navigation.
- [x] Register three routes per page and pass administratorMode through InstructorWorkspace.
- [x] Split quiz editor, templates, and library into mounted panels; route Edit, Create, Save, and Cancel.
- [x] Split practical editor, templates, and library into mounted panels; route Edit, Save, and Cancel without resetting on tab switches.
- [x] Verify both roles, drafts, history/refresh, save/cancel, existing card layout, lint, and production build.
- [x] Review, visually inspect desktop/phone, and update roadmap and architecture documentation.

Review found no actionable correctness issues. Its requested populated-library
coverage was added for both roles, covering selection, expansion, Edit routing,
and saving. Browser fixtures intercept all database requests. The creation test
course locator was corrected to use the combobox role, and practical fixtures
include required student instructions. Desktop quiz library and phone practical
builder screenshots were visually inspected. Final lint and build pass.

One administrator Back/Forward check intermittently lost its draft in the full
run; the unchanged scenario then passed twice in isolation. Source review found
no ancestor-route mismatch. Added explicit URL waits around subsection navigation
and history traversal, plus a performance.timeOrigin assertion to detect a
document reload. All eight final Chromium checks pass after this test-only change;
final lint and whitespace checks pass. The production build passes. No commits,
pushes, migrations, or real database mutations were performed.
