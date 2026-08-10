# Phase 10.5 — Security hardening and production handoff

## Outcome

The repository now has repeatable secret detection, dependency auditing,
Dependabot updates, pull-request dependency review, a production browser
content policy, privacy-safe runtime monitoring, backup verification, and a
documented production handoff process.

These controls reduce risk but do not replace the Supabase dashboard security
review or the operational actions below.

## 1. Enforced repository and browser controls

The release workflow runs:

1. `npm run security:scan` before dependency installation;
2. deterministic installation using `npm ci`;
3. `npm audit --audit-level=high`;
4. automated tests and ESLint;
5. dependency review for pull requests;
6. production environment validation; and
7. the optimized build before deployment.

Dependabot checks npm packages and GitHub Actions weekly. Every update still
requires the normal tests and review; do not automatically merge major
dependency changes.

Production builds inject a Content Security Policy that limits scripts and
network access to the application and configured Supabase project. It permits
inline styles because the current React interface uses style attributes, and
permits data/blob images for QR codes, downloads, and topology assets.

GitHub Pages does not provide project-controlled response headers. The CSP is
therefore delivered with a document meta element. A future reverse proxy or
hosting change is required to enforce response-only policies such as
`frame-ancestors`, HSTS, `X-Content-Type-Options`, and a complete
Permissions-Policy. Test those headers before changing the production domain.

## 2. Supabase production security review

Before release, an owner must review the production project:

- **Security Advisor:** resolve or explicitly document every finding.
- **Row Level Security:** confirm RLS is enabled on every exposed `public` and
  Storage table and that policies use the intended student, instructor, and
  administrator ownership boundaries.
- **Functions:** deploy the repository versions and confirm privileged
  operations require authenticated roles. Keep secret/service-role keys only
  in Edge Functions.
- **Replication:** do not publish tables containing student answers, grades,
  command logs, or account-security events unless a tested Realtime policy
  requires them.
- **Authentication:** enable email confirmation, CAPTCHA, suitable rate
  limits, and the custom SMTP/redirect configuration from Phase 10.4.
- **Platform access:** require MFA for Supabase and GitHub owners. Keep at least
  two authorized owners with separate accounts.
- **Database connections:** enable SSL enforcement. Apply database network
  restrictions only after identifying every legitimate administration,
  migration, and recovery source; an incorrect allowlist can block recovery.
- **API keys:** rotate any credential that was copied into chat, screenshots,
  logs, public commits, or an untrusted device.

Record the review date, reviewer, findings, and corrective actions in the
production release record. Never copy secret values into the record.

## 3. Access handoff

Assign named people—not shared accounts—to these responsibilities:

| Responsibility | Primary | Backup |
| --- | --- | --- |
| GitHub repository and Pages | | |
| Supabase organization/project | | |
| DNS and custom domain | | |
| SMTP provider and sender domain | | |
| Release approval | | |
| Backup and recovery | | |
| Security incident coordination | | |

For each system, verify MFA, recovery methods, least-privilege access, and a
backup owner. Remove former staff promptly. Review administrator and instructor
accounts at least once per academic term and after staffing changes.

## 4. Production release sequence

1. Freeze instructional-content edits for the release window.
2. Create and verify an instructional-content export and database backup.
3. Confirm all migrations through `064_phase10_runtime_monitoring.sql` have
   been applied in numerical order. Include later migrations if present.
4. Deploy every changed Edge Function from the reviewed repository source.
5. Run `npm run test:qa`, `npm audit --audit-level=high`, and
   `npm run validate:production-env`.
6. Complete the Phase 9 instructor, student, and administrator UAT record.
7. Merge through a reviewed pull request or approved release commit.
8. Confirm GitHub Actions build and deploy jobs pass.
9. Verify the deployed build identifier and System health workspace.
10. Test sign-in, invitation, recovery, one quiz, one CLI practical, live
    monitoring, result review, CSV export, and content backup with test data.
11. Observe Auth logs, Edge Function logs, runtime monitoring, and SMTP
    delivery during the release window.
12. Complete and approve the production release record.

## 5. Rollback decision

Rollback when a release causes authentication failure, exposes data across
roles or classes, prevents submission/grading, corrupts instructional content,
or produces an unrecoverable operational failure.

1. Stop new assessments or temporarily unassign affected content.
2. Preserve logs and timestamps without copying student answers into public
   systems.
3. Redeploy the last known-good frontend commit and matching Edge Functions.
4. Restore configuration values only from the private release record.
5. Do not reverse an applied database migration blindly. Use a reviewed
   forward correction or the recovery runbook.
6. Verify authentication, RLS, attempts, grading, and monitoring before
   reopening access.
7. Record the incident and corrective action.

## 6. Security incident response

### Triage

- Restrict evidence to authorized responders.
- Record when the issue began, affected systems and roles, and the reporting
  channel.
- Classify the issue: exposed secret, unauthorized access, data disclosure,
  availability failure, grade integrity, email compromise, or dependency risk.

### Containment

- Revoke exposed sessions and rotate affected credentials.
- Suspend compromised accounts without deleting audit evidence.
- Disable affected functions, assignments, or email flows when necessary.
- Preserve Auth, database, Edge Function, GitHub Actions, SMTP, and runtime
  monitoring logs according to institutional policy.

### Recovery

- Correct the root cause in a reviewed branch.
- Run the full QA and security gates.
- Restore only verified backups in accordance with the recovery runbook.
- Notify affected stakeholders according to school policy and applicable law.
- Complete a post-incident review with owners and deadlines.

Use `docs/templates/SECURITY_INCIDENT_RECORD.md`. Never store raw credentials,
tokens, or unnecessary student personal data in the record.

## 7. Operational cadence

- **Every release:** automated gates, UAT, backup verification, health checks,
  and release record.
- **Weekly:** review Dependabot and monitoring alerts.
- **Monthly:** verify backups and perform or schedule the recovery drill.
- **Each academic term:** review accounts, roles, classes, retention, SMTP,
  DNS, rate limits, and expected capacity.
- **Annually or after major change:** threat review, browser compatibility,
  accessibility review, load testing, recovery exercise, and handoff update.

## 8. Final acceptance

Phase 10 is operationally complete when:

- migrations 063 and 064 are confirmed in production;
- Phase 10.4 SMTP, DNS, Site URL, redirects, and `PUBLIC_SITE_URL` are tested;
- Supabase Security Advisor and RLS findings are resolved or accepted by the
  owner;
- repository and platform owners use MFA and have a backup owner;
- the production release record is approved;
- a verified backup and successful recovery drill record exist;
- `npm run test:qa` passes on the release commit; and
- a test student can complete a quiz and CLI practical without seeing another
  class's or student's data.
