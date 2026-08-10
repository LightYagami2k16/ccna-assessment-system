# Authentication and email-delivery test record

Keep completed records in private operational storage. Do not record
passwords, access tokens, SMTP credentials, or full authentication links.

## Release information

- Date and time:
- Tester:
- Build identifier:
- Public application URL:
- Supabase project reference:
- SMTP provider:
- Sender address:
- Mailbox providers tested:

## DNS verification

- [ ] SPF passes
- [ ] DKIM passes
- [ ] DMARC alignment/reporting is active
- [ ] Sender and return-path domains are expected
- [ ] No SMTP credential is present in frontend or repository settings

## Flow results

| Flow | Mailbox | Delivered | Correct return URL | Completed | Notes |
| --- | --- | --- | --- | --- | --- |
| Student sign-up confirmation | | | | | |
| Administrator invitation | | | | | |
| Student password recovery | | | | | |
| Instructor verification before password change | | | | | |
| Administrator verification before password change | | | | | |

Repeat the table for a second mailbox provider.

## Negative tests

- [ ] Expired link is rejected safely
- [ ] Reused link is rejected safely
- [ ] Unapproved redirect URL is rejected
- [ ] Rate-limit message is understandable
- [ ] Missing `PUBLIC_SITE_URL` produces a configuration error
- [ ] No flow redirects to localhost or an obsolete deployment

## Approval

- Result: Pass / Fail
- Open issues:
- Approved by:
- Approval date:
