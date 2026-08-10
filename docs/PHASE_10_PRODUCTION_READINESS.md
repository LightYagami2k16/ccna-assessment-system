# Phase 10 — Production readiness

## Phase 10.1: Release pipeline and configuration hardening

Status: complete in the application and GitHub Actions workflow.

Every push to `main` must now pass these gates before GitHub Pages deploys:

1. deterministic installation with `npm ci`;
2. dependency audit with no high or critical vulnerabilities;
3. unit and simulator regression tests;
4. ESLint;
5. production Supabase environment validation; and
6. the optimized Vite production build.

Pull requests run the same code-quality gates but do not deploy or require
production repository secrets.

### Required GitHub repository secrets

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### Production URL repository variable

- `VITE_PUBLIC_APP_URL`

The workflow derives the standard GitHub Pages project URL when this variable
is absent. Set it explicitly before using a custom frontend domain.

The validation command rejects missing values, placeholders, non-HTTPS remote
URLs, `sb_secret_` keys, service-role text, and legacy JWTs whose role is
`service_role`.

Run the same configuration check locally in PowerShell:

```powershell
$env:VITE_SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co'
$env:VITE_SUPABASE_PUBLISHABLE_KEY = 'YOUR_BROWSER_SAFE_KEY'
$env:VITE_PUBLIC_APP_URL = 'https://YOUR_USERNAME.github.io/ccna-assessment-system/'
npm run validate:production-env
```

Never place database passwords, Supabase secret keys, service-role keys, SMTP
passwords, or third-party server secrets in a `VITE_` variable. Vite variables
are included in the public browser bundle.

## Phase 10.2: Runtime monitoring and operational health

Status: complete in the application. Apply migration
`064_phase10_runtime_monitoring.sql` before enabling production monitoring.

The production application now includes:

- a recovery screen for unexpected React rendering failures;
- production-only handling for global errors and unhandled promises;
- authenticated, rate-limited, and deduplicated error reporting;
- an administrator-only System health workspace;
- readiness checks for the database, quiz engine, CLI engine, content backup,
  and error-reporting function; and
- resolve and reopen controls for administrator review.

Monitoring is intentionally privacy-safe. It does not send raw exception
messages, stack traces, URLs, query strings, hashes, form values, commands,
answers, names, or email addresses. Reports contain only a generic error
category, a safe built-in error type, a fixed component category, the build
identifier, online status, language, and viewport dimensions.

After applying migration 064, sign in as an administrator and open
`Administrator workspace → System health`. Confirm all five readiness checks
show Available. The dashboard refreshes automatically once per minute and can
also be refreshed manually.

## Phase 10.3: Backup schedule and recovery drills

Status: complete as an operational runbook and integrity-checking tool.

The backup and recovery plan is documented in
`docs/PHASE_10_BACKUP_AND_RECOVERY.md`. It defines the managed-backup and PITR
strategy, supplementary logical exports, retention, secure storage, proposed
RPO/RTO, monthly recovery drills, acceptance checks, and incident recovery.

Use `npm run backup:manifest -- <directory>` after creating a three-part
logical export. Use `npm run backup:verify -- <directory>` before relying on a
stored export. The tools compare SHA-256 hashes and file sizes without
displaying SQL contents.

Every recovery drill must use a disposable project and the template at
`docs/templates/RECOVERY_DRILL_RECORD.md`. Never restore a drill over the
active production project.

## Phase 10.4: Authentication, email delivery, and domains

Status: complete in the application, deployment validation, Edge Function,
and operational runbook.

Student sign-up confirmation and self-service recovery links now use the
validated `VITE_PUBLIC_APP_URL`. Administrator invitations and reset messages
continue to be generated server-side and now fail clearly when
`PUBLIC_SITE_URL` is absent or unsafe. The GitHub Pages workflow validates and
builds with the same canonical public URL.

Configure custom SMTP, SPF, DKIM, DMARC, Supabase Site URL, exact redirect
URLs, and any frontend or Supabase custom domain by following
`docs/PHASE_10_AUTH_AND_DELIVERABILITY.md`. Complete
`docs/templates/AUTH_DELIVERABILITY_TEST_RECORD.md` before production release.

## Phase 10.5: Security hardening and production handoff

Status: complete in the repository, production browser build, CI workflow,
and operational runbooks. Final acceptance still requires the named platform
owners to complete the production checks and records.

The release pipeline now scans repository content for representative secret
formats without displaying matched values. Dependabot covers npm and GitHub
Actions, pull requests review dependency changes, and production builds inject
a Supabase-scoped browser Content Security Policy. Vulnerability reporting is
defined in `SECURITY.md`.

Follow `docs/PHASE_10_SECURITY_AND_HANDOFF.md` for Supabase Security Advisor,
RLS, MFA, SSL, network restriction, access handoff, release, rollback, and
incident-response procedures. Use the production release and security incident
templates under `docs/templates/`.

## Production release checklist

Before a release:

- Apply all pending Supabase migrations in numerical order.
- Confirm the Authentication Site URL and allowed redirects use the final
  HTTPS site address.
- Confirm custom SMTP can deliver invitation, confirmation, and password-reset
  messages.
- Run `npm run test:qa` and complete the manual UAT checklist in
  `docs/PHASE_9_QA_AND_UAT.md`.
- Download an instructional-content backup from the instructor workspace.
- Confirm GitHub Actions completed the build and deploy jobs successfully.
- Test student, instructor, and administrator sign-in on the deployed site.
- Start and submit one quiz and one CLI practical using test accounts.

## Phase 10 completion

All planned Phase 10 implementation increments are complete locally. The
project is ready for the documented production configuration, migration,
deployment, UAT, release approval, and operational handoff activities.
