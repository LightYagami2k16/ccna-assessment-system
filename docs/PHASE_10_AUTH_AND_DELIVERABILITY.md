# Phase 10.4 — Authentication, email delivery, and domains

## Outcome

Production authentication email must use one canonical application URL, a
verified sender domain, and custom SMTP. The application now uses
`VITE_PUBLIC_APP_URL` for student confirmation and self-service password-reset
links. Administrator invitations and administrator-triggered reset messages
use the `PUBLIC_SITE_URL` Edge Function secret.

Both values must point to the same deployed application address and include
the GitHub Pages repository path when the application is hosted as a project
site.

Example:

```text
https://YOUR_USERNAME.github.io/ccna-assessment-system/
```

## 1. Configure the application URL

1. In GitHub, open **Settings → Secrets and variables → Actions → Variables**.
2. Add `VITE_PUBLIC_APP_URL` with the exact deployed HTTPS address.
3. In Supabase, set the Edge Function secret `PUBLIC_SITE_URL` to that same
   address.
4. Redeploy `admin-user-security` after changing its code or secrets.
5. In Supabase **Authentication → URL Configuration**, set **Site URL** to the
   same production address.
6. Add the exact production address to **Redirect URLs**.
7. Keep `http://localhost:5173/` only for local development. Do not use a
   production wildcard when an exact address is available.

The deployment workflow provides the normal GitHub Pages project URL as a
fallback. Set the repository variable explicitly before moving to a custom
frontend domain.

## 2. Configure custom SMTP

Supabase's built-in SMTP service is for initial testing, has no production
delivery guarantee, only sends to pre-authorized team addresses, and is rate
limited. Production invitations, confirmations, and password resets require a
custom SMTP provider.

For Brevo or another SMTP provider:

1. Verify a dedicated authentication sender domain, for example
   `auth.example.edu`.
2. Create a sender such as `no-reply@auth.example.edu`.
3. In Supabase **Authentication → SMTP Settings**, enable custom SMTP.
4. Enter the provider's SMTP host, TLS port, username, password/API credential,
   sender address, and sender name.
5. Keep the SMTP credential only in Supabase. Never store it in GitHub, a
   `VITE_` variable, SQL migration, screenshot, or browser code.
6. Send a test invitation, confirmation, and password reset to at least two
   mailbox providers.
7. Review **Authentication → Rate Limits** after SMTP is enabled. Increase
   limits only to the measured classroom requirement.

Use the authentication subdomain only for transactional account messages. Do
not mix classroom marketing or bulk email with the same sender reputation.

## 3. Publish email-authentication DNS records

Add the exact records provided by the SMTP vendor to the DNS provider:

- SPF authorizes the selected mail provider;
- DKIM signs outbound messages;
- DMARC begins in monitoring mode and reports alignment failures; and
- the provider's return-path or tracking records are added when required.

Do not create multiple SPF records for one hostname. Merge authorized senders
into one SPF policy. After DNS propagation, confirm SPF and DKIM pass in the
received message headers before strengthening DMARC enforcement.

## 4. Review authentication templates and flows

Complete every row in
`docs/templates/AUTH_DELIVERABILITY_TEST_RECORD.md` using test accounts.

Verify that:

- student registration requires email confirmation when enabled;
- an administrator invitation opens the password-creation flow;
- student, instructor, and administrator password recovery returns to the
  deployed application;
- instructor and administrator password changes still require email
  verification;
- an instructor-issued temporary student password requires replacement before
  entering the workspace;
- links contain the expected public application domain and path;
- expired and reused links fail safely; and
- users never land on localhost or a stale GitHub Pages path.

Do not disable email confirmation to work around delivery problems. Fix SMTP,
DNS, rate limits, or templates instead. Enable CAPTCHA on public registration
before general release.

## 5. Optional custom domains

The frontend custom domain and the Supabase API/Auth custom domain are separate
settings.

- A frontend domain such as `ccna.example.edu` is configured through the
  GitHub Pages custom-domain workflow and becomes `VITE_PUBLIC_APP_URL`,
  `PUBLIC_SITE_URL`, the Supabase Site URL, and an exact allowed redirect.
- A Supabase API/Auth domain such as `api.example.edu` is a paid Supabase
  add-on. It uses a CNAME to the project domain plus the required ACME TXT
  verification record.

Before activating a Supabase custom domain, update and test all OAuth, SAML,
and callback configurations. Supabase Auth begins using the custom API domain
immediately after activation. Keep the original project URL available during
the transition and retain a rollback record.

## 6. Release acceptance

Phase 10.4 is accepted when:

- `npm run validate:production-env` passes with the production public URL;
- all three Supabase URL settings agree;
- custom SMTP is enabled and its credentials are not exposed to the frontend;
- SPF and DKIM pass and DMARC reporting is active;
- the authentication test record is complete for two mailbox providers;
- no message link returns to localhost or an obsolete deployment path; and
- invitation and reset failures show a clear configuration error rather than
  sending a broken link.

## Rollback

If authentication email fails after a domain change, stop invitations and
password-reset operations, restore the previous `VITE_PUBLIC_APP_URL`,
`PUBLIC_SITE_URL`, Site URL, and redirect allowlist, redeploy the frontend and
Edge Function, and repeat the test record. Do not rotate SMTP or DNS settings
without recording the previous working values in the private operations log.
