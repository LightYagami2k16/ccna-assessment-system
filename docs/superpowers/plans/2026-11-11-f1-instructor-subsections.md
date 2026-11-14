# F1.3B instructor subsections implementation plan

**Goal** — Make Classes, Exam Controls, and Student Results focused pages with addressable subsections for local review.

**Architecture** — Reuse the existing hash route hook and existing feature components. Keep inactive panels mounted and hidden to retain drafts, selections, and filters while switching subsections. Use the approved subsection structure in docs/UI_INFORMATION_ARCHITECTURE.md.

**Tech stack** — React, Vite, existing CSS, Supabase services, Playwright.

**Spec** — docs/UI_INFORMATION_ARCHITECTURE.md, instructor Classes, Exam controls, and Student results sections.

## Constraints and decisions

- Work in the existing localhost workspace so the owner can inspect the changes.
- Leave all changes uncommitted and unpublished as requested.
- Preserve existing local branding and dependency changes.
- Reuse existing business actions and services.
- Use the base page address for its first subsection and nested hash addresses for the others.
- Keep instructor and administrator assessment-tool addresses separate.
- Link practical access to the existing CLI builder rather than duplicating its assignment form.
- Preserve the default combined behavior of InstructorOverallResults for existing callers; the new results area opts out of embedded analytics.
- Keep the existing monitoring refresh interval and failure messages.
- Track implementation and verification here and in the project roadmap.

## Review focus

- Browser refresh and Back/Forward restore the correct subsection and role context.
- Switching subsections preserves unsaved class and accommodation fields and result filters.
- Inactive controls and headings remain hidden from keyboard and accessibility navigation.
- A narrow phone viewport contains the navigation and content.
- Test requests are intercepted so automated checks do not write to hosted Supabase.

## Tasks

- [x] Add failing browser coverage for instructor subsections, administrator context, route persistence, draft/filter retention, and narrow layouts.
- [x] Add shared subsection route definitions, a hook using useWorkspaceRoute, and accessible subsection navigation with responsive styling.
- [x] Split Classes into Your classes, Enrollment approvals, and Quiz and practical access, preserving all existing controls.
- [x] Split Exam Controls into Assignment schedules, Integrity enforcement, Student accommodations, and Live monitoring.
- [x] Compose five independent Student Results panels, retaining filter and detail state while switching.
- [x] Run focused browser checks, existing workspace navigation checks, lint, unit tests, and the production build.
- [x] Review the final diff, update F1 status and the progress log, and leave localhost running for owner review.

## Verification record

- Watched the new class navigation check fail before adding subsection navigation.
- Six subsection browser checks pass, including role context, routing, drafts, filters, keyboard use, and compact layouts.
- Added a populated CLI policy regression. It failed with incident limit 3 instead of the unsaved 7 after a polling refresh, then passed after separating initial selection from saved-field synchronization.
- Ruling — synchronize policy form state on selection or saved primitive values, rather than refreshed object identity, because unchanged polling responses must preserve a local draft. Real server field changes still update the form.
- Twenty-three existing workspace/responsive tests passed initially. The remaining test exposed loading and input-modality assumptions. It passes after waiting for Overview and sending keyboard input before checking keyboard focus styling.
- All 89 unit tests pass. Final lint and production build pass.
- Independent read-only review and incremental policy review found no actionable issues.
- Visually inspected desktop Classes and phone CLI integrity controls with isolated sample responses.
- Real authenticated workflows, populated assignment/attempt operations, and owner acceptance remain manual checks.
- All changes remain local and uncommitted. The development server remains on port 5173.

## Question Bank follow-up

The owner requested the same subsection pattern for Question Bank. Reuse the
shared route definitions, hook, navigation, and mounted hidden panels. Keep the
library as the base address to preserve existing links and access to the module
filter. Give the editor, modules, and import/export their own nested addresses
in both instructor and administrator contexts.

- [x] Add a failing browser regression for missing subsection navigation.
- [x] Add Question library, Create / edit question, Course modules, and Import / export routes.
- [x] Compose the four panels using existing components and preserve their state while switching.
- [x] Open the editor on activation and library Edit actions; return to the filtered library after saving or cancelling an edit.
- [x] Verify navigation, draft/import retention, refresh/history, save flow, module filters, full question loading, and narrow layouts.
- [x] Review the change and update the local roadmap for owner acceptance.

All nine focused Chromium checks pass. Lint and the production build pass.
Desktop library and phone editor screenshots were visually reviewed. Independent
review found no actionable correctness issues; its requested successful-creation
test was added and passes, including a blank form after reopening the editor.
Actual authenticated acceptance remains for the owner at localhost:5173.

The existing module-version refresh behavior remains in place. Form drafts are
retained across subsection navigation; a successful save resets the completed
editor session. No commit or publication is authorized for this follow-up.
