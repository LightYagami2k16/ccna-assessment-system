# CLI review device groups

Goal: group student expected configuration and instructor grading criteria by saved device name and recorded device ID. Keep criteria/outcomes/points and their relative ordering unchanged, and keep identical names with different IDs separate. Use saved attempt state rather than current lab topology. Missing IDs remain explicitly unrecorded, without guessing a device mapping; unknown IDs stay visible. Reuse a shared grouping helper and presentation wrapper. Keep command chronology and final state unchanged.

Instructor RPC currently drops deviceId from criteria_snapshot; prepare migration 072 preserving creator/admin authorization, scoring and order, with existing review role/ban checks. No hosted migration, commit or push. Preserve local F1 changes. Verify helper edge cases, student/instructor browser views, isolated SQL permissions/IDs and release checks; update roadmap.

Implemented locally. Three grouping edge-case unit tests pass (106 total), eight distinct browser cases pass across runs after correcting incomplete student test identity data, isolated SQL contract/authorization probe passes, and independent review found no actionable issues. Screenshots inspected; final lint/build/diff recorded in the acceptance log. Migration 072 remains unapplied.
