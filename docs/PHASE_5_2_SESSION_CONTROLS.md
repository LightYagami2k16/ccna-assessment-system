# Assessment browser-session controls

## Completed behavior

- A student may have only one active quiz or CLI practical.
- An active attempt may be controlled by only one browser/device lease.
- A duplicated tab is blocked locally with the browser Web Locks API.
- The owning browser renews its server lease every 20 seconds.
- Temporary network failures keep retrying without discarding quiz answers.
- A stale browser lease becomes reclaimable after 60 seconds.
- Refreshing the owning tab keeps the same browser identifier and resumes.
- Quiz and CLI reads, saves, and submissions require the active lease.
- Instructor Live Monitoring shows browser lease health and last contact.

## Acceptance checks

1. Start a quiz and open the same attempt in a duplicated tab. The second tab
   must show that the assessment is already open elsewhere.
2. Open the same attempt in another browser profile. It must remain blocked
   while the first browser heartbeat is current.
3. Exit the assessment normally. The second browser can claim it immediately.
4. Close the owning browser without exiting. The second browser can reclaim it
   after approximately 60 seconds.
5. Disconnect the network briefly. The attempt remains visible, reports that it
   is reconnecting, and renews the lease after connectivity returns.
6. Repeat every check for both a quiz and a CLI practical.
7. Confirm Live Monitoring reports Connected, Connection delayed, or Session
   reclaimable and displays the latest heartbeat time.

Migration `052_complete_assessment_client_sessions.sql` must be applied before
the Live Monitoring status fields are available.
