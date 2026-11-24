# Local grading lookup experiment

User authorized a localhost:5174 comparison, not commit, push or hosted deployment. XLOOKUP-style indexing is the criterion selection mechanism; incremental grading additionally caches verified results and safely updates the aggregate score. These ideas are complementary.

1. Build a local-only SQL experiment outside the migration directory. Keep the full grader unchanged. Put server-only cache/backup/audit data in a private schema; patch only the verified commit's grading call, preserving auth, locks, revisions, damage and transactionality. Require an explicit local experiment flag when applying the SQL and retain an exact rollback definition.
2. Cache by participant, immutable definition and confirmed previous state. Derive input fingerprints from explicitly mapped device/field/port dependencies. Unknown or complex criteria always use the original evaluator. Missing/stale caches perform a full grade. Preserve null/false semantics and criterion order. Full final grading remains unchanged.
3. Run the full isolated SQL contract suite with audit mode comparing every cached result against the full grader inside the transaction. Verify privacy, case sensitivity, updates/undo, port and device isolation, stale-state invalidation and safe fallback.
4. Run baseline and candidate measurements with the same local benchmark and matched sample sizes, including a real localhost browser. During candidate samples, perform full-result parity checks outside the timed request. Restore the baseline between runs; leave only the validated candidate enabled locally for owner testing. Retain a documented rollback command and original function definition.
5. Report measured timings and limits, the conceptual comparison, and the local prototype's scope. No application publishing or hosted changes.

Production source implementation and Git publication were subsequently approved. The release plan supersedes the experiment's local-only implementation scope; hosted database application remains separate.
