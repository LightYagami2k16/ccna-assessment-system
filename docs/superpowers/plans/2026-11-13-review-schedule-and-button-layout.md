# Review scheduling and student action layout Implementation Plan

Goal: presentable student Review actions and instructor review choice during quiz/CLI creation/editing, with disabled, after-submission and scheduled-window modes.

Scope: keep changes local, no commit/push. Prepare migration 071 after 070; do not apply to Supabase. Existing grade visibility and detailed-review ownership/finalization rules stay in place. Schedules use an inclusive opening and exclusive optional closing; browser-local date input is saved as an ISO timestamp. Dates may be past when editing; closing must follow opening. Scheduled review requires an opening. Disabled/immediate modes clear schedule bounds.

Contracts:
- Policy object: {allowReview:boolean, availableFrom:ISO|null, availableUntil:ISO|null}.
- get_assessment_review_policy keeps name/arguments, returns extended object.
- set_assessment_review_schedule(p_assessment_type,p_assessment_id,p_allow_review,p_available_from,p_available_until) returns object. Existing set_assessment_review_policy remains compatible and represents immediate/disabled access.
- save_instructor_quiz_with_review(p_payload jsonb), save_cli_lab_with_review(p_payload jsonb) return UUID. reviewPolicy is nested in p_payload. Saves and policy are atomic; CLI new wrapper also saves topology atomically. Legacy payloads missing reviewPolicy preserve current policy. Permissions validated before any existing-record mutation.
- Form value: {mode:'disabled'|'immediate'|'scheduled', opensAt:local datetime string, closesAt:local datetime string}.
- Shared pure helpers in src/services/reviewSchedule.js: emptyReviewSchedule(), reviewScheduleFromPolicy(policy), reviewScheduleToPolicy(value), validateReviewSchedule(value). Dates validated before serialization.
- Shared controlled src/components/ReviewScheduleFields.jsx: props value,onChange,disabled=false. Checkbox accessible name Allow students to review completed attempts. When enabled: Review availability selector (After submission / Scheduled window), scheduled Review opens and Review closes (optional) datetime-local inputs. No save/API side effects.

Work:
- Backend: 071 columns, policy get/set, scheduled student access/review guards, atomic content+policy wrappers, isolated PostgreSQL harness. Preserve disabled defaults, immediate 070 behavior, expired/finalized/ownership/ban/legacy reader protections. Test boundaries, invalid windows, policy revocation and rollback on invalid data/topology, create/edit and prior APIs.
- Form UI: shared fields/helpers/editor load hook; quiz and practical creation/edit forms load existing policies, preserve pending/error drafts and block submit until existing policy known; include reviewPolicy in save payload and route new RPC, keep legacy service paths for callers without reviewPolicy. Do not reset unknown existing policy.
- Main UI: update existing detail-popup policy control to the same schedule fields/getter/setter; student table column allocations include Review and an aligned readable icon button, preserve mobile result-card layout.
- Verify exact create/edit payloads, schedule persistence, student action geometry and existing review flows; isolated SQL, unit/lint/build, screenshots, logs. No documentation/source writes during browser runs to avoid development reloads.

Execution: backend, shared create/edit fields, detail-popup policy scheduling and student action layout are implemented locally. SQL harness, 103 unit checks and 19 distinct focused Chromium cases pass across integration runs; responsive and scheduled-form screenshots inspected. Visual review corrected a CLI checkbox style collision and the Commands header width. Final lint/build recorded in the acceptance log. Migrations 070/071 and authenticated owner acceptance remain deployment steps. No commit or push.
