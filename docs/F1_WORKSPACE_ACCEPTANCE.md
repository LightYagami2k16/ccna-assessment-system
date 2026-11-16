# F1 workspace shell and breadcrumb acceptance — 2026-11-14

## Published baseline

The preceding accumulated update is committed and pushed as `199da61064725f171195c6fe7b1527c956b15f17`. Nine existing GitHub commits were integrated before a normal main push. Content-service integration retained the shared actual-batch pagination and review-aware save RPC; obsolete commented service copies were removed. Release secret scan, all 103 unit checks, lint, build and dependency audit pass (zero vulnerabilities).

[Pages deployment 56](https://github.com/LightYagami2k16/ccna-assessment-system/actions/runs/43587673413) and [production smoke test 128](https://github.com/LightYagami2k16/ccna-assessment-system/actions/runs/43587717804) succeeded for that commit. Supabase migrations 067–071 were not applied by this work; database-dependent features require their separate application/confirmation.

## New local F1 increment

- Administrator tools reuse assessment content within the existing administrator shell, without a nested instructor sidebar or duplicate workspace header.
- The labelled Assessment tool selector retains existing administrator hash addresses and uses the same content/permissions as before. Instructor navigation retains its existing sidebar.
- Shared breadcrumbs support role Overview, parent pages and instructor/admin subsections, with native links and a single aria-current item. Internal address replacement updates the breadcrumb snapshot.
- The Assessment tools parent opens canonical Question Bank rather than an intermediate URL that can retain stale tool content. Browser navigation moves focus to main content.
- Student assessment focus mode returns before breadcrumb/workspace rendering.

## Verification

Watched the administrator selector check fail before implementation. Twenty-nine focused Chromium cases pass: creation/reset and instructor/admin builder drafts, new shell/breadcrumbs, subsection routing/draft/filter/policy retention, compact keyboard navigation, 1550-question loading with 1000/500 caps, workspace navigation, refresh/Back/Forward, role guards, account modal/skip-link focus and signed-out routing. Review found a parent-breadcrumb URL/content mismatch; the added assertion failed with quizzes still selected, then all three breadcrumb cases passed after canonicalizing that link. Desktop and phone administrator screenshots inspected; narrow-screen page overflow is within one pixel. All 103 unit tests pass. Browser requests/mutations are intercepted fixtures; no production records changed. Final lint/build/diff results are recorded below.

## Owner acceptance and remaining F1 work

At localhost:5173, test real instructor/administrator subsection workflows, direct admin tool links and navigation after sign-in; verify the quiz/CLI focus boundary with real attempts. Check screen-reader behavior, 200% zoom, compact/tablet/desktop layouts and populated records. The approved standalone /admin/classes oversight route and administrator navigation consistency remain separate F1 tasks. F1 is still in progress. The new shell/breadcrumb increment remains uncommitted and unpublished for review.

Final local checks: repository secret scan, full lint, production build and diff whitespace check pass. Localhost responds HTTP 200. Independent review confirmed the parent-link fix and reported no remaining actionable findings. No additional commit or push was made for this F1 increment.
