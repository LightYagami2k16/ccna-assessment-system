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

## Remaining Phase 8 increments

- Phase 8.4 — Bulk content import with downloadable validation reports
- Phase 8.5 — Complete instructional-content backup and restore
