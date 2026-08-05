# Phase 9 — Quality assurance and accessibility

## Completion status

Engineering QA is complete as of August 3, 2026:

- 62 unit and simulator regression tests pass;
- 12 Chromium end-to-end checks pass;
- the same 12 checks pass in Firefox;
- the same 12 checks pass in WebKit after verifying dialog focus restoration;
- all student, instructor, and administrator previews have no serious or
  critical axe WCAG 2.1 A/AA violations;
- phone, tablet, and desktop overflow checks pass;
- the production build and ESLint pass; and
- the production dependency audit reports zero known vulnerabilities.

The manual screen-reader and classroom acceptance checklists below remain the
release sign-off procedure whenever a production candidate is prepared. They
do not require code changes unless a reviewer reports a defect.

## Automated coverage

Run the complete quality suite with:

```powershell
npm run test:qa
```

The suite verifies:

- student, instructor, and administrator workspace startup;
- Chromium, Firefox, and WebKit compatibility;
- phone, tablet, and desktop horizontal-overflow behavior;
- keyboard access to the skip link and Account Settings dialog;
- serious and critical WCAG 2.1 A/AA violations using axe-core;
- a lightweight burst of 20 concurrent application-shell requests;
- existing Cisco simulator and session-lock regression tests;
- ESLint and production compilation.

## Manual screen-reader review

Complete before a production release using NVDA with Firefox or Chrome and
VoiceOver with Safari:

1. Navigate landmarks and confirm the banner, main region, navigation, and
   dialog are announced.
2. Open Account Settings and confirm focus stays inside until it is closed.
3. Start a quiz and confirm the timer, save status, question number, selected
   answer, and submission result are announced without repeating excessively.
4. Start a CLI practical and confirm device tabs, active device, timer,
   integrity warning, and submission result have meaningful names.
5. Confirm validation errors are announced and focus moves to the relevant
   control.

## Instructor UAT

- Create, publish, edit, and bulk-manage questions.
- Create a randomized quiz and assign it to one owned class.
- Create a multi-device CLI practical and verify hidden grading criteria.
- Approve enrollment and verify another instructor cannot see the class.
- Monitor quiz and CLI attempts, review events, reset an attempt, and export
  results.
- Review overall, question, trend, and learning-area analytics.

## Student UAT

- Join a class by code and wait for approval.
- Start, resume, auto-save, submit, archive, and restore eligible assessments.
- Recover gracefully after a connection interruption.
- Complete quiz question types and a multi-device CLI practical.
- Verify completed quiz and CLI results appear in History.
- Confirm expired assessments submit automatically.

## Release browsers and devices

- Latest two versions of Chrome, Edge, Firefox, and Safari.
- Windows desktop at 1366×768 and 1920×1080.
- Tablet portrait and landscape around 768–1024 CSS pixels.
- Mobile widths at 360, 390, and 430 CSS pixels.
