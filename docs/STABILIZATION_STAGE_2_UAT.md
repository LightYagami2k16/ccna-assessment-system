# Stabilization Stage 2 — Authenticated UI Acceptance Testing

Run this checklist with one instructor account and one student account.
Record failures with the role, screen width, workspace section, and a screenshot.

## Development role previews

These local-only URLs render the real role workspace shell without changing
Supabase authentication or data:

- Instructor: `http://localhost:5173/?uat-role=instructor`
- Student: `http://localhost:5173/?uat-role=student`

The preview is disabled in production builds. Use authenticated accounts for
data creation, grading, assignment, enrollment, and submission checks.

## Screen-size matrix

- Desktop: 1440 × 900
- Compact desktop: 1024 × 768
- Tablet: 768 × 1024
- Mobile: 390 × 844

## Shared authenticated shell

- The correct name, email, and role appear after sign-in.
- The course catalog and role workspace load without horizontal page overflow.
- Sign out returns to the authentication screen.
- Refreshing or restoring the window keeps the signed-in session.
- A profile-loading failure shows the recovery screen, never the wrong role.
- Try again reloads the profile; Sign out safely ends the session.

## Instructor workspace

- Every navigation section opens and remains selected after refresh:
  Question bank, Quizzes, CLI practicals, Classes & assignments,
  Exam controls, and Student results.
- The mobile instructor menu opens, closes, and collapses after selection.
- Create/edit forms remain readable and usable at every test width.
- Tables scroll inside their containers without widening the entire page.
- Collapsible course, class, student, quiz, and practical groups work.
- Bulk selection, action menus, confirmation dialogs, and exports work.
- Empty, loading, success, and error states remain aligned.

## Student workspace

- Available, History, and CLI practical tabs work with mouse and arrow keys.
- The selected tab remains selected after refresh.
- Joining a class refreshes assigned assessments.
- Quiz and CLI attempts enter focus mode without unrelated dashboard content.
- Active attempts resume after refresh or a temporary connection interruption.
- Completed attempts move to History and refresh their displayed scores.
- Archived quizzes can be restored when attempts remain.
- Timers, question navigation, autosave feedback, and submission controls fit
  at every test width.

## Resize and restore checks

- Open each instructor section, resize across all four widths, and restore it.
- Verify buttons do not overlap, jump outside cards, or become unreachable.
- Verify open forms and selected workspace sections are not reset.
- Repeat with the student tabs and an active quiz or CLI attempt.

## Assessment integrity checks

- Expired quiz and CLI attempts submit automatically.
- Submitted/expired attempts leave Live Monitoring.
- Browser integrity events appear in the correct attempt review.
- Scores, raw points, percentage, attempt number, and event count agree between
  student History and instructor Student results.

## Exit criteria

Stage 2 is complete when all checks pass at all four screen sizes, or every
remaining failure has a documented owner and follow-up task.
