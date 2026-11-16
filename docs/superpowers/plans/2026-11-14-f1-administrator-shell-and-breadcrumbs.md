# F1 administrator shell and breadcrumbs Implementation Plan

**Goal:** Continue F1 with a single administrator shell for assessment tools and useful role-aware breadcrumbs.

**Architecture:** Extract the already-shared assessment feature renderer/navigation definitions from InstructorWorkspace. Instructors retain their sidebar and page title. Administrators select assessment tools through one labelled compact selector within the existing administrator shell; no nested instructor sidebar or duplicate workspace page heading. Existing hash routes and subsection components remain unchanged. Shared breadcrumb navigation uses explicit role paths and subsection definitions, safe native hash links and aria-current. Student assessment focus mode returns before workspace breadcrumbs are rendered.

**Tech Stack:** React, Vite, existing CSS/hash routing, Playwright.

**Spec:** docs/UI_INFORMATION_ARCHITECTURE.md, approved shared shell and administrator reuse requirements; docs/PROJECT_ROADMAP.md F1.

## Constraints and scope
- The preceding update is pushed as 199da61. This next F1 increment stays local for review; the user authorized pushing the latest accumulated update, not automatic publication of all future F1 changes.
- Preserve permissions, RPCs, migration requirements, role guards, subsection drafts and legacy addresses.
- Continue in the existing localhost workspace as requested throughout this task. Do not introduce a router dependency or change the database.
- The full F1 phase is not complete until remaining administrator class oversight, authenticated owner acceptance and responsive/accessibility sign-off are resolved.

## Tasks
- [x] Add a failing browser check for administrator single-shell tool selection and breadcrumb return links.
- [x] Extract shared assessment feature content/navigation; reuse directly in administrator shell with a compact labelled tool selector.
- [x] Add shared breadcrumbs for student/instructor/admin workspaces, including subsection links; omit in active assessment focus.
- [x] Verify refresh, Back/Forward, role guards, focus movement, narrow layouts and existing builder/subsection workflows with intercepted data.
- [x] Run release checks, review diff and screenshots; update roadmap and acceptance record. Leave the next F1 increment local.

Verification: watched missing administrator selector fail, then 29 focused Chromium cases pass. Independent review found a parent-link route/content mismatch; the added check failed before the canonical parent fix, then all three breadcrumb cases passed. Root visually inspected desktop/phone screenshots; all 103 unit checks pass. Final release checks recorded in F1_WORKSPACE_ACCEPTANCE.md. No database changes or new dependencies.
