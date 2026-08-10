# Security policy

## Supported version

Security fixes are applied to the current `main` branch and the latest
production deployment. Older local copies are not supported.

## Reporting a vulnerability

Do not disclose a suspected vulnerability, student record, authentication
link, access token, password, database export, or SMTP credential in a public
issue.

Use GitHub private vulnerability reporting when it is enabled for this
repository. Otherwise, contact the repository owner privately and include:

- a concise description of the issue;
- the affected role and workflow;
- safe reproduction steps using test accounts;
- the impact if exploited; and
- a suggested correction when known.

Do not include real student data or working secrets. The owner should
acknowledge the report, restrict access to evidence, assess severity, and
follow `docs/PHASE_10_SECURITY_AND_HANDOFF.md`.

## Security boundaries

- The browser contains a Supabase publishable key only. It must never contain
  a secret or service-role key.
- Row Level Security and server-side functions remain the authority for roles,
  grades, attempts, assignments, integrity events, and administrative actions.
- SMTP credentials, database passwords, and Edge Function secrets belong only
  in their managed server-side secret stores.
- Repository security checks supplement review; they do not replace Supabase
  Security Advisor, RLS review, access review, or production testing.
