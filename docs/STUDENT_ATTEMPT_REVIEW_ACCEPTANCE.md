# Instructor-controlled student attempt review

## Instructor use

Open Quiz library or Practical library, expand its course group, then choose Show details for the assessment. Student attempt review has an Allow students to review completed attempts checkbox and an explicit Save review access action. New and existing assessments default to disabled when migration 070 is installed. Enabling releases own completed/expired attempts, including earlier submissions, to their students. Disabling withdraws subsequent access. Scores and pass/fail history remain visible independently. Copies/templates create new assessments with review disabled.

The detail-popup setting is saved independently and does not block existing edit/publish/duplicate/template actions if unavailable. Creation/editing forms also contain review controls as described in the review-window update below; saving an existing edit requires its policy to load first. Draft changes survive a failed save; a failed initial policy read offers a contextual retry. Both owner instructors and authorized administrators can manage a policy; other instructors cannot.

## Student use

Results & history has a Review action for each attempt, enabled only when the current access list authorizes it. Opening always requests a fresh authorized review. Quizzes show questions, submitted selections or identification text, correct/accepted answers, and scoring feedback. CLI review shows expected configuration requirements, met/unmet points, own commands and readable final device state. Empty expected values for required-state criteria display their meaningful expected state; saved hostnames identify devices where available.

Only own finalized attempts can be reviewed. Access failures do not block grades/history. A denied or withdrawn review clears its displayed detail payload; outdated replies from closed/older reviews are ignored. Visible-page/focus revalidation retains already loaded content while checking and clears it on failure. Previously delivered browser information cannot be recalled by switching permission off.

## Database preparation and historical content

Migration `supabase/migrations/070_student_attempt_review.sql` is prepared locally and must be applied in migration order before real-data use. It has not been applied to Supabase. Existing direct detail-table and legacy safe-reader paths are guarded, while active exam client leases, topology reads and instructor access remain in place. Review APIs enforce signed-in role, bans, ownership, finalized state and the current assessment permission.

Future completed quiz attempts snapshot wording, choices/key, submitted answers and scoring feedback at finalization. Earlier completed attempts did not retain original wording/options; their review explicitly labels current-content fallback. CLI uses its existing criteria snapshot, commands and final session state. Reviewing past own attempts does not require current class membership once the instructor releases the assessment.

## Verification

Verification: all 100 unit checks and 21 distinct focused Chromium scenarios verified across integration runs. New cases cover policy release/persistence/withdrawal/read-save failures; quiz choices/identification/correct answers; CLI required-state expectations/device names/commands/state; failed or withdrawn access; stale closed-review responses; retained content during delayed revalidation. Existing history loading, class popups and instructor/admin library flows also pass. A conditional-modal focus-return issue was corrected with layout-time close/cleanup; development effect remounts are handled by request generations and the race test. Student review CSS is isolated from the instructor results panel, and Expected labels have separate spacing. Instructor controls and desktop quiz/phone CLI screenshots were visually inspected. Full lint, final production build and diff checks pass. Root reran the isolated SQL harness successfully against the actual migration and existing grading/reader/lease/topology functions. Full-feature independent review was unavailable because the reviewer reached its usage limit; root performed source review and the SQL/browser checks. All browser mutations are intercepted fixtures; SQL runs in an isolated in-memory PostgreSQL database without app credentials. No new dependency, commit or push. Authenticated owner acceptance and Supabase migration application remain pending.


## Review windows and creation controls — 2026-11-13

Quiz and CLI creation/editing forms now contain Student attempt review fields. Leave review disabled, enable After submission, or select Scheduled window with a required Review opens time and optional Review closes. The same controls exist in each item’s detail popup. Inputs use browser-local time; the server stores timezone-aware ISO values. Opening is inclusive and closing is exclusive. A closed/past window may be retained when editing; end must be after start. Switching to disabled or after-submission access clears the window.

Existing policy must load before an assessment edit can be saved; policy errors offer Reload review settings while retaining other form drafts. New forms default off and reset review choices after save/cancel. The new save RPCs commit assessment content and review policy together; CLI topology is included in that transaction. Existing callers without a reviewPolicy payload keep their original policy.

Migration 071 extends migration 070 and has not been applied to Supabase by this work. Apply migrations in order before authenticated real-data testing. Schedules are enforced through the current database review permission, access list and guarded legacy readers, rather than a browser clock alone.

Student result tables reserve explicit review-action widths instead of assigning the earlier columns 100% and squeezing the new one. Review headings remain horizontal, icon buttons have readable width, and phone result-card presentation is retained. Tablet tables retain horizontal scrolling. Shared review checkbox sizing explicitly overrides the CLI editor’s full-width input style so its label stays visible.

Verification: 103 unit tests pass. Nineteen distinct focused Chromium cases pass across integration runs: six existing instructor/admin builder cases plus four popup-policy, three student action-layout and six create/edit-policy cases. After visual corrections, all three affected student layout cases and both creation forms were rechecked successfully. Screenshots of desktop/tablet/phone history and both scheduled creation controls were inspected. The isolated PostgreSQL harness passes with migration 071 applied twice after 070, using actual legacy saves and readers; it covers inclusive/exclusive timing, permissions/bans, old policy API compatibility, direct-reader protections, content/topology rollback and missing-policy preservation. Browser data/mutations are intercepted fixtures. No Supabase application, commit or push. Final lint/build results are recorded below.

Final local verification for the review-window update: full lint and production build pass; final diff whitespace check passes. Local development endpoint responds HTTP 200. Nothing committed or pushed.
