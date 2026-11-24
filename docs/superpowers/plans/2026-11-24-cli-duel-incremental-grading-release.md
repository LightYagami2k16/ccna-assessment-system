# Incremental CLI Duel grading release

The owner approved implementing the validated lookup/cache approach and committing/pushing it. Hosted Supabase application is separate; no hosted writes are part of this task.

1. Promote the guarded prototype into migration 084 with private helpers/cache, explicit supported dependencies and conservative reevaluation for complex/unknown requirements. Preserve the existing verified commit, auth, revision, HP and final full-grading paths.
2. Add evaluator/algorithm fingerprint invalidation with full-grading fallback, participant and match completion cleanup, bounded stale-cache cleanup, private permissions, and idempotent installation. Restore/remove the local experimental installer before installing 084 on the disposable stack.
3. Extend isolated SQL contracts: full-score parity, NULL/existence, cache hits, stale state/definitions, changed evaluator fallback, ended-attempt cleanup, privacy, idempotency and original gameplay regressions. Run the suite with audit mode enabled and verify normal audit-off operation separately.
4. Run unit/lint/security/build checks, real local requests/browser measurement against the promoted migration, and independent read-only review. Update release/application instructions and publish only reviewed source/test/docs files to main. No credentials, fixture data or generated reports are committed.
