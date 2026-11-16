# Instructor-controlled student attempt review

## Instructor use

Open Quiz library or Practical library, expand its course group, then choose Show details for the assessment. Student attempt review has an Allow students to review completed attempts checkbox and an explicit Save review access action. New and existing assessments default to disabled when migration 070 is installed. Enabling releases own completed/expired attempts, including earlier submissions, to their students. Disabling withdraws subsequent access. Scores and pass/fail history remain visible independently. Copies/templates create new assessments with review disabled.

The detail-popup setting is saved independently and does not block existing edit/publish/duplicate/template actions if unavailable. Creation/editing forms also contain review controls as described in the review-window update below; saving an existing edit requires its policy to load first. Draft changes survive a failed save; a failed initial policy read offers a contextual retry. Both owner instructors and authorized administrators can manage a policy; other instructors cannot.

## Student use

Results & history has a Review action for each attempt, enabled only when the current access list authorizes it. Opening always requests a fresh authorized review. Quizzes show questions, submitted selections or identification text, correct/accepted answers, and scoring feedback. CLI review shows expected configuration requirements, met/unmet points, own commands organized by device dropdown filters. Empty expected values for required-state criteria display their meaningful expected state; saved hostnames identify devices where available.

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


## Device-grouped CLI review — 2026-11-16

Student Expected configuration and instructor CLI practical result Grading criteria are now grouped by recorded device ID. Each device section shows the saved hostname (or saved device metadata when available) and its Device ID. Identical names with different IDs stay in separate sections. Each criterion keeps its expected value, outcome and points; relative criterion order within each group and first-seen group order are retained. This initial grouping increment retained command chronology and final-state details; the subsequent command-tab update below replaces the flat log and removes the final-state display. Missing IDs display Device ID not recorded; IDs without a saved name display Device name not recorded. The active device and current lab definitions are not used to guess missing identities.

The student RPC already supplies criteria deviceId. Migration 072_cli_review_criterion_devices.sql restores that field to the existing instructor RPC, retaining its response shape, grading calls, state, ordinality and creator/admin scope. It uses migration 070’s signed-in role/ban helper and revokes anonymous execution. Apply in migration order before authenticated instructor grouping acceptance; 072 has not been applied by this work. Older snapshots that never recorded an ID cannot recover one through this presentation change.

Verification: 106 unit tests and lint pass. Eight distinct Chromium scenarios pass across runs: two new grouped student/instructor cases and six existing student review cases, including access failure/revocation, retry, stale responses and retained content during revalidation. The new student sample initially omitted required review identity fields and was correctly rejected by the service; its complete fixture passes without weakening validation. Multi-device cases cover interleaved criteria, repeated names, missing/unknown IDs and page containment. Phone student and desktop instructor screenshots inspected. The isolated PGlite probe applies 072 twice and verifies IDs/order/state, creator/admin aliases, denial for other instructors/students/anonymous/banned users and an unchanged snapshot. Its grader is explicitly a fixture; it verifies the response contract and unchanged scoring plumbing, not the full simulator. Independent read-only review found no actionable issues. Browser requests/mutations are intercepted. No hosted database changes, commit or push; earlier local F1 changes are preserved. Final build/diff results recorded below.

Final checks for device grouping: repository secret scan, lint, production build and diff whitespace check pass. The two new device-grouping browser cases pass on the final rerun. Migration 072 remains unapplied; instructor real-data acceptance awaits its application.


## Device command tabs and overview — 2026-11-16

The score and device-grouped expected configuration/grading criteria remain the attempt overview. Both student and instructor review Command log sections now use the shared device-tab component. Each tab has the saved device name, recorded ID and command count; only its own command log is visible. Original global sequence numbers, command/output text and acceptance status remain available, sorted within that device. Saved devices and explicit criterion devices with no commands show an empty log. Missing command IDs remain in an explicitly labelled unrecorded-device tab rather than being assigned to the active or first device. Same-name devices stay separate by ID. Tabs support click, Left/Right arrows, Home/End, roving keyboard focus and linked tab panels. A vanished selection falls back to the first current device.

The student Final device state section is removed. Saved attempt state remains internal for device identity; raw final-state details are no longer rendered. Migration 073_cli_review_command_devices.sql follows 072 and adds the existing command.device_id to instructor command responses without changing role/ban/owner checks, criteria scoring or command order. Student review already returns command deviceId. Migration 073 is prepared locally and not applied by this work; confirm/install prerequisite migrations in order for real instructor data.

Verification: 108 unit tests and full lint pass. Three focused Chromium cases pass across integration runs, covering student/instructor tabs with identical device names, interleaved sequences, output/acceptance, empty devices, missing IDs, keyboard switching, overview retention, no Final device state heading and phone containment. An existing phone assertion initially matched the same missing-ID label in both overview and tabs; its scope now correctly targets the overview. Phone/student and desktop/instructor screenshots inspected; shared command status colors were darkened for the light review background. The isolated PostgreSQL contract probe applies 072 and 073 twice, preserving command IDs, null IDs, sequence and output; its existing permission and snapshot checks pass. The grader remains an explicit fixture. Independent read-only review found no actionable issues. No remote migration, commit or push. Prior local F1 and device-group work is preserved. Final release checks recorded below.

Final command-tab checks: repository secret scan, full lint, production build and diff whitespace checks pass. Localhost responds HTTP 200. Migration 073 remains unapplied; nothing committed or pushed.


## Student section tabs and expected-device filter — 2026-11-16

Student CLI review now has Expected configuration (default) and Command log section tabs. Expected configuration includes a labelled Filter by device dropdown with All devices and the saved criterion device names/IDs. Same-name devices remain distinct through their IDs; missing IDs retain their explicit unrecorded label. Filtering affects only expected criteria. The filter persists across section switches, with All devices fallback if its group disappears. Both panels remain mounted but hidden when inactive, retaining the independent command-device tab choice. Opening a new attempt resets the section/filter. Score summary stays above both sections; Final device state remains removed.

Three focused Chromium checks pass: student filtering/section isolation/filter restoration/missing-ID reset and keyboard switching; instructor command-tab regression; existing phone CLI review. The missing section-tab check failed before implementation and passes afterward. Phone screenshot visually inspected. Lint passes. This is a presentation-only change using the already authorized review payload, with no new RPC, migration, dependency or database writes. Existing review permission/revalidation logic is unchanged. Earlier F1, device grouping and command-tab changes remain local and preserved. No commit or push. Final release checks recorded below.

Final student section/filter checks: full lint, production build and diff whitespace check pass; localhost returns HTTP 200. No new migration, commit or push.


## Shared device dropdowns and compact spacing — 2026-11-16

This update supersedes per-device command tabs. Student Command log and instructor Command log now use the same labelled Filter by device dropdown as Expected configuration; instructor Grading criteria has its own independent dropdown. One shared control supplies All devices (default), saved names/IDs, explicit missing-ID labels and command counts when applicable. All-device command logs retain separate device headings and original sequence/output/status; selecting one device shows only its records, including empty-device feedback. Student Expected configuration and Command log section tabs remain unchanged, preserving the independent criteria/command filter choices across section switches.

General label margins caused the excessive vertical gaps in the supplied image. The shared review filter resets its own label/select margins and uses a .4rem label-to-control gap; the review heading has a consistent .75rem bottom margin. Instructor grading/command sections now wrap their own heading and filter to prevent outer grid gaps being added between them. These styles are scoped to CLI reviews.

Verification: three focused Chromium cases pass across runs for student filters, instructor criteria/command filters, existing phone review, All devices reset, identical names/distinct IDs, unknown IDs, output/status, no device tablist and page containment. Geometry checks verify label-to-select spacing at most 12px and heading-to-label spacing at most 20px. An old student assertion initially followed the newly visible command dropdown rather than the hidden criteria dropdown; it is now scoped to Expected configuration and passes. Desktop instructor and phone student screenshots inspected. Existing data grouping and review authorization are unchanged. No new RPC, migration, dependency, hosted changes, commit or push. Earlier local work remains preserved. Final release checks recorded below.

Final dropdown/spacing checks: full lint, production build and diff whitespace check pass; localhost responds HTTP 200. Nothing committed or pushed.


## Silent CLI background checks — 2026-11-16

Loaded student CLI reviews no longer render Checking review access during focus/poll revalidation. Initial Loading attempt review and permission/error feedback remain. Background authorization checks continue, retaining the current view while pending and clearing detail content when access is denied. Quiz feedback behavior is unchanged.

Verification: lint and three focused Chromium checks pass. A held CLI detail request proves that revalidation actually happens without the status message, existing content stays visible, and denial clears it. The matching quiz case retains its existing status; the stale-response case still preserves the newer review and initial loading feedback. Diff whitespace check passes. No new backend/migration, hosted change, commit or push.


## Instructor CLI review section tabs — 2026-11-16

Instructor Student results → CLI practical results attempt review now has Grading criteria (default) and Command log tabs, mirroring the student review’s section navigation. Scores and command total remain visible above the tabs. The independent device dropdowns retain their choices while switching because inactive panels stay mounted/hidden. The new attempt key resets tab/filter state when opening a different review. Tabs support Left/Right, Home/End, roving focus and explicit tab/panel associations.

Verification: lint and the focused populated instructor browser case pass. Coverage includes default selection, hidden command section, keyboard switching, criterion device r2 and command device r1 surviving switches, retained score summary, original command sequence/content, no final-state display, and phone containment. Desktop and phone screenshots inspected. No new API, migration, dependency, grading/permission change, hosted write, commit or push. Previous local work is preserved. Final release checks recorded below.

Final instructor-tab checks: lint, production build and diff whitespace check pass; localhost responds HTTP 200. Nothing committed or pushed.


## Publication — 2026-11-16

The owner explicitly authorized commit and push. Recent CLI review changes and shared F1 workspace improvements are published on main in `28bd9fb5719c2b92f6077fcbb66e46bdbc75daf3`. Final release secret scan, 108 unit tests, lint, production build, dependency audit (zero vulnerabilities), isolated SQL contract checks and staged whitespace checks pass. [Pages deployment](https://github.com/LightYagami2k16/ccna-assessment-system/actions/runs/43792529860) and [production smoke test](https://github.com/LightYagami2k16/ccna-assessment-system/actions/runs/43792611250) succeeded. Prior local-only statements above describe the development sequence and are superseded by this publication. Migrations 072/073 are included in the repository but were not applied to Supabase by this push. Confirm/apply migrations in order for instructor criterion/command device IDs and complete authenticated acceptance separately.
