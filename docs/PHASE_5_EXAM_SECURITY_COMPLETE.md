# Phase 5 - exam security and session controls

## Completed controls

- Only one quiz or CLI practical may remain active for a student.
- One browser/device lease controls an active attempt at a time.
- Duplicate tabs are blocked with a same-browser lock.
- Browser leases heartbeat, reconnect after temporary network failures, and can
  be reclaimed after the stale timeout.
- Quiz answers and CLI device state are restored from the most recent saved
  state after reconnection.
- Expired quiz and CLI attempts are submitted from their last server-saved
  state and removed from Live Monitoring.
- Page visibility, focus, fullscreen, and connection events are recorded for
  instructor review.
- Instructors can choose Monitor only, Record and warn, or Automatically submit
  for every quiz and CLI practical.
- Automatic submission can use an incident-count threshold, a maximum time-away
  threshold, or whichever threshold is reached first.
- Live Monitoring displays active quiz and CLI attempts, event totals, and
  browser lease health.

## Required database migration

Apply `057_phase5_integrity_enforcement.sql` after migration 056. Until it is
applied, the Exam Controls page keeps existing monitoring behavior and displays
a migration notice instead of the policy editor.

## Acceptance checks

1. Verify a second tab and a second browser cannot control a current attempt.
2. Verify the original browser resumes after refresh and short disconnections.
3. Verify a stale session can be reclaimed after approximately 60 seconds.
4. Verify Monitor only records events without displaying integrity warnings.
5. Verify Record and warn records events and displays student warnings.
6. Verify Automatically submit closes the attempt when the incident count is
   reached.
7. Verify Automatically submit closes the attempt when the time-away limit is
   reached, even if the incident-count limit is higher.
8. Repeat policy checks for both quiz and CLI attempts.
9. Confirm auto-submitted attempts appear in student History and instructor
   Student results and disappear from Live Monitoring.
