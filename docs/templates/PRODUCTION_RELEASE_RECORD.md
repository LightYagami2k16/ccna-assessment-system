# Production release record

Store the completed record privately. Do not include passwords, private keys,
tokens, SMTP credentials, database connection strings, or student answers.

## Release

- Version/build identifier:
- Commit:
- Release date and window:
- Release owner:
- Reviewer/approver:
- Production application URL:
- Supabase project reference:

## Change summary

- Features/fixes:
- Database migrations:
- Edge Functions deployed:
- Configuration changes:
- Known limitations:

## Automated evidence

- [ ] Repository secret scan passed
- [ ] Unit and simulator tests passed
- [ ] ESLint passed
- [ ] Production build passed
- [ ] Dependency audit passed
- [ ] Production environment validation passed
- [ ] GitHub Actions deployment passed

## Platform security review

- [ ] Supabase Security Advisor reviewed
- [ ] RLS reviewed for exposed tables and Storage
- [ ] Realtime publications reviewed
- [ ] Edge Function secrets and role checks reviewed
- [ ] Supabase/GitHub owners use MFA
- [ ] SMTP, SPF, DKIM, and DMARC verified
- [ ] Site URL and redirect allowlist verified
- [ ] SSL enforcement reviewed
- [ ] Database network restrictions reviewed

## Backup and recovery

- Backup timestamp:
- Manifest verification result:
- Storage location reference (not credentials):
- Latest successful recovery drill date:

## UAT

- [ ] Student authentication and enrollment
- [ ] Quiz start, autosave, submit, score, and history
- [ ] CLI practical start, resume, submit, score, and history
- [ ] Instructor content, class, assignment, monitoring, and results
- [ ] Administrator accounts, audit history, and system health
- [ ] Authentication emails tested

## Deployment observation

- Monitoring window:
- Runtime errors:
- Auth/SMTP errors:
- Edge Function errors:
- Corrective actions:

## Decision

- Result: Approved / Rejected / Rolled back
- Approved by:
- Approval time:
- Follow-up owners and deadlines:
