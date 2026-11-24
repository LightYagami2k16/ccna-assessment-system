# CLI Duel lookup-grading benchmark

The owner requested a localhost:5174 prototype and comparison on November 24, 2026, then approved production source implementation and Git publication. Migration 084 promotes the validated approach with evaluator-version guards and cache cleanup. Hosted database application remains separate.

## How the ideas compare

| Idea | Responsibility |
|---|---|
| XLOOKUP-style lookup | Identify the device, field or port that supplies a criterion's input. |
| Targeted/incremental grading | Reevaluate changed inputs and retain other verified criterion results. |
| This prototype | Combine input lookup and a private result cache, then use the existing evaluator for correctness and original commit/damage logic for the result. |

These are complementary ideas, not competing solutions. A raw command-to-points lookup would be insufficient: equivalent commands can produce the same state, incorrect values must lose points, and routing/connectivity can have broader dependencies.

This implementation still visits the criterion dependency records and assembles the complete grading result. It skips expensive evaluator calls when a supported criterion's authoritative inputs are unchanged; it is not a literal Excel formula or a constant-time lookup for the entire scoring operation. It also evaluates each needed criterion once rather than allowing repeated SQL expression evaluation while building totals.

## Prototype safety and scope

- Private cache keyed by participant, immutable definition, and matching confirmed previous state; no client-supplied scores or cached results.
- Direct field/port dependencies cover hostname, secrets/encryption, banner/domain, users/lines, VLANs, common interface fields, default gateway, DNS and saved state. Unrecognized, PC IP, routing, connectivity, NAT, DHCP, EtherChannel and STP requirements retain the existing evaluator path every time.
- Auth, class scope, browser leases, locks, revisions, duplicates, deadlines, once-only damage and final full grading are unchanged.
- Cache writes commit/roll back with the original command transaction. Definition or confirmed-state mismatch invalidates the cache. Missing caches reevaluate every criterion.
- Expected values and configuration data remain in a private schema unavailable to API roles. No response payload or frontend interface changes.
- Audit mode compares results against full grading and rejects a mismatch atomically. The normal prototype mode disables that extra full evaluation; test tooling independently checks parity outside timed requests.

An existence/null fingerprint edge was caught in review and reproduced as a failing regression, then fixed. An SQL `AND` audit guard was found to evaluate the full grader despite a false flag; nested PL/pgSQL statements prevent that unnecessary work. Intermediate measurements before those corrections are not the final comparison.

## Final matched local measurements

| Median measurement | Original | Lookup/cache prototype |
|---|---:|---:|
| Verified API result, 2 criteria (12 samples each) | 101 ms | 101 ms |
| Verified API result, 128 criteria (12 samples each) | 317 ms | 139 ms |
| Browser submit to visible score, 128 criteria (6 samples each) | 561 ms | 233 ms |
| Final result in one eight-command burst, 128 criteria | 2,891 ms | 1,676 ms |

Large-fixture API latency was approximately 56% lower and visible-score latency approximately 58% lower. Small fixtures had no meaningful median improvement. These are warmed exploratory local measurements, not production or classroom-concurrency guarantees. The fixture alternates hostname correctness while many interface criteria remain unchanged. A changed port or complex network requirement may need more work and will have different timings. Full parity checks ran outside timed API intervals and after the burst, rather than blocking its serial queue. Pregame timestamps were advanced only for fixture setup; commands, grading, requests and browser rendering were real. Diagnostic matches were cancelled and academic quiz/CLI attempt counts remained unchanged.

Final reports: `test-results/cli-duel-lookup-ab/baseline-final/report.json` and `test-results/cli-duel-lookup-ab/lookup-verified/report.json`. Earlier `lookup` and `lookup-final` directories are diagnostic runs with audit/measurement overhead and should not be used as the final comparison. The cache recorded one criterion reevaluated and 127 reused for a hostname change. A separate rolled-back `track_functions` probe confirmed the audit-off cached path did not invoke the full grader.

Correctness: full isolated duel SQL suite with audit mode passed, including auth/class restrictions, scoring/undo, duplicates, damage/KO, pause/resume, deadlines, review privacy, case sensitivity and later migrations. Explicit local contracts cover devices, ports, VLAN absent/null/object/removal, unknown types, stale state, changed definitions, dependency reuse, private permissions and preservation of final full grading. Independent read-only review approved the corrections. Diagnostic scripts pass ESLint and the repository secret scan.

## Production implementation

Use `supabase/migrations/084_cli_duel_incremental_grading.sql` after migrations 074-083. The local experimental installer was retired after restoring its original commit function. Do not use an old experimental rollback script after installing 084.

Production adds evaluator fingerprints, a 30-minute cache freshness limit, participant/match completion cleanup and bounded opportunistic stale-cache cleanup. Evaluator changes fall back to full grading until a reviewed migration updates the dependencies and cache generation. Future grading changes must review these dependencies rather than merely refreshing the fingerprint. Final attempt sealing still uses full grading.

`tests/sql/cli-duel-incremental-grading.sql` and `tests/sql/cli-duel-incremental-matrix.sql` are rolled-back contracts. Run the isolated suite with `DUEL_INCREMENTAL_TEST=1` (plus the full duel feature flags recorded in the acceptance log).

The diagnostic `scripts/measure-cli-duel-latency-local.mjs` rejects any API URL other than the disposable loopback backend. It reads private temporary settings, never prints credentials, and supports `DUEL_LOOKUP_VERIFY=1` to compare production cache results to the full grader outside timed requests. Generated reports remain ignored. This script creates fictional local accounts and cancels its diagnostic matches; it is not intended for hosted use.

The promoted migration was separately checked on the actual local API/browser: 12 samples per API fixture measured 166 ms (2 criteria) and 221 ms (128 criteria) medians; six 128-criterion browser samples measured 505 ms submit-to-score DOM. The production version adds evaluator fingerprint checks. These release measurements were taken separately and do not establish the historical prototype's percentage improvement for the promoted migration. All cache/full-grader comparisons passed. See the acceptance log for current validation and deployment instructions.
