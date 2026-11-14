# Instructor-controlled student attempt review Implementation Plan

> For agentic workers: use executing-plans or subagent-driven-development task by task.

**Goal:** Instructors can release or withdraw detailed review of completed own-student quiz/CLI attempts, including submitted work, scoring feedback and correct answers/expected configuration.

**Architecture:** Separate review permission from grades and exam execution. Add default-false allow_student_review columns on quizzes and cli_labs, managed by dedicated owner/admin RPCs so legacy assessment save/duplicate/template flows do not need changing. Settings live inside the new library-item detail popups. Student Results & history obtains independent review-access flags and opens a freshly authorized, read-only review modal. Enforce ownership, finalized status, current policy and bans in PostgreSQL and close existing bypass read paths. Preserve active client leases/player flow and instructor access.

**Tech stack:** React/Vite, Supabase/PostgreSQL, existing native LibraryItemDialog, Node tests, Playwright, temporary isolated PGlite.

**Confirmed content choice:** User explicitly selected submitted work, scoring feedback AND correct answers/expected CLI configuration. Review is disabled by default; scores and pass/fail summaries remain unchanged. No commit/push; prepare migration 070 and test it only in an isolated database. Do not apply to Supabase.

## API contract

- get_assessment_review_policy(p_assessment_type text, p_assessment_id uuid) -> {allowReview:boolean}; owner instructor/admin only.
- set_assessment_review_policy(p_assessment_type text, p_assessment_id uuid, p_allow_review boolean) -> {allowReview:boolean}; same authorization.
- get_student_attempt_review_access() -> [{assessmentType:'quiz'|'cli', attemptId:uuid}]; only own finalized enabled attempts.
- get_student_attempt_review(p_assessment_type text, p_attempt_id uuid) -> {assessmentType, attempt:{id,title,status,attemptNumber,scorePoints,maximumPoints,percentage,passed,startedAt,submittedAt}, questions:[{id,sortOrder,title,questionText,type,points,pointsAwarded,isCorrect,answerText,selectedOptionIds,options:[{id,text,isCorrect}],correctAnswers:[text]}], criteria:[{type,target,expected,points,met,pointsAwarded,deviceId}], commands:[{sequence,command,output,accepted,deviceId}], state, historicalContentNotice?}.
- Quiz response uses questions; CLI response uses criteria/commands/state. Unneeded keys may be omitted. Frontend tolerates missing optional metadata.

## Work units

- [x] Backend: migration 070 + isolated SQL harness, authorization/default/revocation/completion/role/ban tests; preserve active APIs and instructor access; account for direct tables and legacy safe readers. Preserve future completed quiz content for reliable review; older attempts must be labelled honestly if original content is unavailable. No remote database use.
- [x] Student UI: dedicated review service/access hook and review modal, independent history action/error states, quiz choices/text/correct answers/scoring and CLI expected criteria/commands/final state presentation. Fresh authorization on every open, race/unmount safety, revoke/error handling, responsive/keyboard checks. Do not change player or active-session enforcement.
- [x] Instructor UI: reusable review-policy section inside quiz/practical item popups, explicit save and default-off state, read/save errors, no assessment action regressions. Policy fetch failure must not block existing library actions.
- [x] Integration: intercepted end-to-end policy save/history/review/revocation tests, active-player/list regressions as relevant; isolated SQL harness; lint/build/unit checks; request independent review and document any availability limitation; update roadmap/acceptance logs.

## Access and historical-content decisions

Reviews apply to all own finalized attempts for an assessment while its current review permission is enabled, including older attempts and former class memberships; no access to other students. Disabling blocks subsequent review retrieval. Already delivered browser data cannot be recalled. Use stored completion feedback and snapshots when available. Quiz legacy attempts did not preserve immutable wording/options; clearly identify any current-content fallback instead of claiming it is the original submission content. CLI already has criteria_snapshot/session_state and command history. Capture future completed quiz content if feasible without changing grading/player behavior.

Integration progress: root independently reran the isolated SQL harness successfully; all 100 unit checks and full lint pass. Instructor policy release/persistence/withdrawal/failure checks pass. Six student review scenarios pass after adding conditional-modal focus cleanup and making stale-response tests compatible with development effect remounts; class/library regressions pass too. Final screenshot checks/build/logs are in progress. Independent full-feature reviewer was unavailable due to its usage limit; root is reviewing source and using the isolated SQL/browser checks instead. No remote migration apply, commit or push.

Final local verification: root SQL harness PASS; 100 unit checks; 21 distinct focused browser scenarios verified across runs; full lint/final build/diff checks PASS. Instructor and student review screenshots inspected after correcting namespace collisions and CLI label spacing. Review request failed due to reviewer usage limits; root source review completed. Migration 070 is prepared and isolated-tested only, not applied to Supabase. Authenticated acceptance remains pending. No dependency, commit or push.
