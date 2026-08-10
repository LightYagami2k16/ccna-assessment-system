# Phase 10.3 — Database backup and recovery

Status: complete as an operational runbook and local integrity-checking tool.

This document defines how the CCNA Assessment System database is backed up,
verified, restored, and tested. Backup and restore operations are performed by
an authorized platform administrator, never by the React application.

## Recovery objectives

The production owner should approve these targets before launch:

| Item | Recommended target | Meaning |
|---|---:|---|
| Recovery point objective (RPO) | 24 hours with daily backups | At most one day of changes may need reconstruction. |
| Enhanced RPO | PITR restore point | Use when graded exams require a shorter loss window. |
| Recovery time objective (RTO) | 4 hours for a small classroom deployment | Target time to restore, validate, and reopen the platform. |
| Recovery drill | Monthly | Restore into a disposable project and record evidence. |

These are operating targets, not guarantees. Actual restore time depends on
database size, Supabase plan, network speed, and the selected restore method.

## Backup layers

### 1. Supabase-managed backup — primary

Use the Supabase Dashboard under **Database → Backups**. Supabase currently
documents automatic daily backups for Pro, Team, and Enterprise projects, with
retention determined by plan. For a production classroom deployment, Pro or
higher is the recommended minimum.

Enable Point-in-Time Recovery (PITR) when losing up to one day of live exam
records would be unacceptable. Supabase documents PITR as a paid add-on that
replaces daily backups and requires eligible compute.

Official guidance:

- <https://supabase.com/docs/guides/platform/backups>

### 2. Logical database export — supplementary off-site copy

Create a logical export weekly, before major migrations, and before a release
that changes grading or attempt data. This protects the custom application
schema and data and provides an independently verifiable copy.

Logical exports are not a replacement for managed backups. Supabase CLI dumps
exclude Supabase-managed schemas such as Auth and Storage. Storage database
backups also contain object metadata rather than the stored files themselves.

Official guidance:

- <https://supabase.com/docs/reference/cli/supabase-db-dump>
- <https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>

### 3. Instructional-content export — instructor recovery

Before a release, an instructor should also download the application-level
instructional content backup. It protects courses, modules, questions,
quizzes, CLI practicals, criteria, and class assignments independently of a
full database restore.

## Required schedule

| Frequency | Operation | Owner | Retention |
|---|---|---|---|
| Daily | Confirm the managed backup or PITR window is current | Platform administrator | Plan retention |
| Weekly | Create roles, schema, and data logical exports | Platform administrator | 8 weekly sets |
| Before database migration | Create and verify a logical export | Release operator | Until release is verified plus 30 days |
| Before major content release | Download instructional-content backup | Lead instructor | Current plus previous two releases |
| Monthly | Complete a recovery drill in a disposable project | Administrator and instructor | Keep drill report for one academic year |
| Quarterly | Review access, retention, RPO, RTO, and storage-object coverage | System owner | Keep signed review record |

Keep at least two encrypted copies in separate locations. Restrict access to
the system owner and designated recovery operator. Do not place backups in the
Git repository, GitHub Pages artifacts, shared class drives, or the website's
public folder.

## Create a logical export

Prerequisites:

1. Install the Supabase CLI and Docker Desktop.
2. Sign in with the Supabase CLI.
3. Link this repository to the production project.
4. Obtain the database password through the approved secret manager.
5. Use a private administrator workstation with encrypted storage.

Create a dated directory outside any synchronized public folder. If you use
the repository's ignored `backups` directory for a temporary copy:

```powershell
$backupDate = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$backupDirectory = Join-Path (Get-Location) "backups\$backupDate"
New-Item -ItemType Directory -Path $backupDirectory
```

Run the official three-part export. Enter the database password only when the
CLI requests it; do not save it in `.env.local`, scripts, command files, or
GitHub secrets used by the frontend build.

```powershell
npx supabase db dump --linked -f "$backupDirectory\roles.sql" --role-only
npx supabase db dump --linked -f "$backupDirectory\schema.sql"
npx supabase db dump --linked -f "$backupDirectory\data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

Create an integrity manifest:

```powershell
$env:SUPABASE_PROJECT_REF = 'YOUR_PROJECT_REF'
npm run backup:manifest -- "$backupDirectory"
Remove-Item Env:\SUPABASE_PROJECT_REF
```

The generated `backup-manifest.json` contains only file names, sizes, hashes,
the project reference, and generation time. It does not contain database
credentials or SQL contents.

Copy all four files to encrypted off-site storage, then remove the temporary
working copy according to your organization's secure deletion policy.

## Verify a stored backup

Copy one backup set to a private temporary directory and run:

```powershell
npm run backup:verify -- "D:\PrivateBackups\ccna\2026-08-10"
```

Verification must report all three SQL files. A checksum mismatch means the
set is not trustworthy and must not be used for recovery without investigation.

Record verification date, operator, storage location identifier, and result in
the backup register. Never record the database password or SQL contents.

## Monthly recovery drill

Never perform a drill against the production project.

1. Declare a maintenance drill and select the newest verified backup.
2. Record the start time and target RPO/RTO.
3. Create a disposable Supabase project in the same region and plan family.
4. Prefer Supabase **Restore to a new project** or an approved clone for the
   most complete managed-backup test.
5. For a logical-export drill, follow Supabase's official CLI restore process:
   configure required extensions, restore roles, schema, then data using
   `psql --single-transaction --variable ON_ERROR_STOP=1`.
6. Re-enable required Realtime publications and redeploy Edge Functions.
7. Apply any migrations created after the selected recovery point.
8. Configure test-only authentication redirects and create dedicated test
   accounts. Never send real student email from the drill project.
9. Verify the acceptance checklist below.
10. Record end time, actual RPO/RTO, failures, and corrective actions.
11. Delete the disposable project only after the drill record and evidence are
    safely stored and the system owner approves cleanup.

## Recovery acceptance checklist

- [ ] All migrations expected at the recovery point are present.
- [ ] RLS is enabled on exposed tables.
- [ ] Student, instructor, and administrator roles are enforced.
- [ ] Class ownership isolates instructors from one another.
- [ ] Course, module, question, quiz, and practical totals match the source.
- [ ] A test student can join a class and see only assigned assessments.
- [ ] One quiz can be started, saved, submitted, graded, and reviewed.
- [ ] One CLI practical can be started, saved, submitted, graded, and reviewed.
- [ ] Live monitoring and integrity-event recording work.
- [ ] Password reset and invitation email use only test recipients.
- [ ] System health shows all backend checks as available.
- [ ] Backup and restore logs contain no credentials.
- [ ] Actual RPO and RTO are recorded.

Use `docs/templates/RECOVERY_DRILL_RECORD.md` for every drill.

## Production incident recovery

1. Stop new assessment starts and inform instructors of the incident.
2. Preserve logs and establish the last known good time.
3. Select the closest backup made before the incident.
4. Obtain system-owner approval for the restore point and expected data loss.
5. Use the Supabase Dashboard restore workflow or PITR. A restore causes
   downtime; do not begin while active exams are still running unless the
   system owner declares an emergency.
6. Run the recovery acceptance checklist before reopening access.
7. Reconcile attempts submitted after the selected recovery point from
   instructor records where possible.
8. Record the incident, root cause, actual data loss, and preventive actions.

## Important limitations

- Deleting a Supabase project also permanently removes its associated managed
  backups. Keep independent encrypted exports.
- Daily backups do not preserve passwords for custom Postgres login roles;
  reset those passwords after restoration.
- Database backups do not restore deleted Storage objects. If topology images
  or other files are moved to Supabase Storage, add a separate object-backup
  procedure before production use.
- Never test a backup by restoring over the active production project.
