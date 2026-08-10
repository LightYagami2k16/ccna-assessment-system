# Phase 8 — Content management and portability

## Phase 8.1: Question-bank import and export

Status: complete in the application. Migration 060 must be applied before
using Import in a live Supabase project.

The instructor Question Bank can now:

- export the shared question library as a versioned JSON file;
- preserve course and module codes, question type, points, difficulty,
  explanation, source status, and answer options;
- validate the entire file in the browser before upload;
- import up to 500 questions in one database transaction;
- match destination courses and modules by code instead of database IDs;
- skip matching duplicate questions; and
- save imported questions as drafts for instructor review.

Portable files use this top-level structure:

```json
{
  "format": "ccna-assessment-question-bank",
  "version": 1,
  "exportedAt": "2026-08-05T00:00:00.000Z",
  "questions": []
}
```

Database migration:

```text
supabase/migrations/060_phase8_question_bank_portability.sql
```

## Phase 8.2: Quiz duplication and reusable templates

Status: complete in the application. Migration 061 must be applied before
using duplication or templates in a live Supabase project.

Instructors can now duplicate a quiz as a new draft, save quizzes as
instructor-owned templates, create multiple drafts from a template, and
delete templates without affecting quizzes already created from them.

Copies preserve quiz settings and manual or random question selection. They
do not inherit class assignments, schedules, attempts, answers, results,
accommodations, or integrity events.

Database migration:

```text
supabase/migrations/061_phase8_quiz_duplication_and_templates.sql
```

## Phase 8.3: CLI practical duplication and topology templates

Status: complete in the application. Migration 062 must be applied before
using CLI practical duplication or templates in a live Supabase project.

Instructors can duplicate an existing practical as a draft, save its complete
device topology and grading design as an instructor-owned template, and create
multiple draft practicals from that template. Devices, links, instructions,
timing, scoring settings, and criteria are preserved.

Class assignments, student attempts, commands, saved configurations, scores,
and integrity events are deliberately excluded from every copy.

Database migration:

```text
supabase/migrations/062_phase8_cli_practical_templates.sql
```

## Phase 8.4: Bulk question import validation reports

Status: complete in the application. This increment reuses migration 060 and
does not require an additional database migration.

The question-bank importer now:

- validates every question independently instead of stopping at the first
  invalid row;
- summarizes the total, import-ready, and rejected question counts;
- displays the first rejected rows and their validation messages;
- imports the valid subset while excluding invalid rows;
- keeps all imported questions in draft status for instructor review; and
- downloads a spreadsheet-safe CSV validation report for every selected file.

Validation reports include the source row, status, course and module codes,
question type, title, and validation message. Values that could be interpreted
as spreadsheet formulas are escaped before download.

## Phase 8.5: Complete instructional-content backup and restore

Status: complete in the application. Migration 063 must be applied before
backup and restore can be used in a live Supabase project.

The instructor workspace now includes a dedicated Content backup area that:

- exports the shared course, module, and question library;
- exports the signed-in instructor's quizzes, CLI practicals, grading
  criteria, device topologies, and reusable templates;
- validates backup identity, version, required collections, size, and record
  limits before restore;
- rebuilds question references used by quizzes and quiz templates;
- restores assessments as drafts and clears availability and class access;
- skips matching modules and content to make repeated restores safer; and
- performs the restore transactionally so a failure does not leave a partial
  database restore.

The backup deliberately excludes accounts, classes, memberships,
assignments, schedules, attempts, answers, scores, CLI commands, session
leases, and integrity-monitoring events.

Database migration:

```text
supabase/migrations/063_phase8_complete_content_backup_restore.sql
```

## Phase 8 completion

Phase 8 is complete. Question portability, reusable quiz and practical
templates, bulk validation reporting, and complete instructional-content
backup and restore are implemented.
