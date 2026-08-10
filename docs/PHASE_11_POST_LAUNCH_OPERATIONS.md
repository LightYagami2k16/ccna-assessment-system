# Phase 11 — Production launch validation and post-launch operations

Phase 11 begins after the Phase 10 production configuration and security
acceptance checklist have been completed. Its purpose is to detect production
regressions after deployment and during normal operation.

## Phase 11.1: Automated production smoke validation

The production smoke suite verifies the public authentication entry point
without creating accounts or modifying production data. It checks:

- the deployed URL returns a successful document response;
- the application title and sign-in controls render;
- the registration panel can be opened and closed;
- the production Content Security Policy and referrer policy are present;
- the page produces no browser console or uncaught runtime errors.

Run it locally against the deployed application:

```powershell
$env:PRODUCTION_APP_URL = 'https://LightYagami2k16.github.io/ccna-assessment-system/'
npm run test:production
```

The `Production smoke test` GitHub Actions workflow runs after a successful
Pages deployment, once daily, and on demand. Failure evidence is retained for
14 days.

## Remaining Phase 11 increments

### Phase 11.2: Authenticated production acceptance

- maintain dedicated student, instructor, and administrator test accounts;
- verify login and role routing without modifying instructional records;
- test password recovery and invitation delivery with controlled addresses;
- record results in the production release record.

### Phase 11.3: Operational review cadence

- review application health, security events, and email delivery weekly;
- review Supabase database growth and backup completion monthly;
- complete a recovery drill at least quarterly;
- triage failed production smoke runs as release incidents.

### Phase 11.4: Post-launch feedback and release governance

- collect structured instructor and student feedback;
- classify defects by severity and affected role;
- maintain release notes and rollback references for every production release;
- approve feature work separately from production incident fixes.

## Phase 11.1 acceptance

Phase 11.1 is complete when the public live-site check passes locally and the
scheduled GitHub workflow is present. The workflow becomes active after these
changes are committed and pushed.

### Current status

- The smoke suite passes against the local production build.
- The public GitHub Pages entry point loads without browser errors.
- The currently deployed HTML predates the Phase 10 Content Security Policy,
  so the strict live smoke test will remain blocked until the accumulated
  Phase 8–11 frontend changes are committed, pushed, and deployed.
