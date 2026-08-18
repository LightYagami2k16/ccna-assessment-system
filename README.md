# CCNA Assessment System

Student exam onboarding, recovery behavior, and offline-continuation limits are documented in [docs/student-exam-and-offline-guide.md](docs/student-exam-and-offline-guide.md).

React/Vite assessment platform for GitHub Pages with a Supabase backend. The
current application includes:

- Email/password authentication
- Automatic student profiles
- Student, instructor, and admin roles
- ITN, SRWE, and ENSA starter courses
- Row Level Security policies
- Responsive student, instructor, and administrator workspaces
- Question banks and timed quizzes
- Multi-device Cisco CLI practicals
- Class enrollment, assignment scheduling, monitoring, and results
- Instructional-content import, templates, backup, and restore
- Administrator system health and privacy-safe runtime monitoring
- GitHub Pages deployment workflow

## 1. Create the Supabase project

1. Create a new Supabase project.
2. Open **SQL Editor**.
3. Copy and run `supabase/migrations/001_phase1_foundation.sql`.
4. Open **Project Settings → API** and copy:
   - Project URL
   - Publishable key (or legacy anon key)
5. In **Authentication → URL Configuration**, set the Site URL to your eventual GitHub Pages URL. During local development, also add `http://localhost:5173` as a redirect URL.

## 2. Run locally

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_PUBLIC_APP_URL=http://localhost:5173/
```

Then:

```bash
npm ci
npm run dev
```

## 3. Make your account an instructor

Create your account through the app, then run this in Supabase SQL Editor, replacing the email:

```sql
update public.profiles
set role = 'instructor'
where id = (select id from auth.users where email = 'teacher@example.com');
```

Do not let normal users choose their own instructor role.

## 4. Push to GitHub

```bash
git init
git add .
git commit -m "Phase 1 CCNA assessment foundation"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

## 5. Configure repository secrets

In GitHub, open **Settings → Secrets and variables → Actions** and add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Add this repository variable under the **Variables** tab:

- `VITE_PUBLIC_APP_URL` — the exact deployed HTTPS application URL

The publishable key is designed for browser use but must always be paired with RLS. Never place a Supabase secret key or service-role key in this React project.

## 6. Enable GitHub Pages

Open **Settings → Pages** and choose **GitHub Actions** as the source. Pushes to `main` will build and deploy the site.

## Production verification

Run the full local quality suite before a release:

```bash
npm run test:qa
```

Run the repository secret scan independently with:

```bash
npm run security:scan
```

Run the read-only smoke test against the deployed application with:

```powershell
$env:PRODUCTION_APP_URL = 'https://LightYagami2k16.github.io/ccna-assessment-system/'
npm run test:production
```

Deployment requirements and the production release checklist are documented
in `docs/PHASE_10_PRODUCTION_READINESS.md`.

Database backup schedules, integrity checks, and recovery drills are
documented in `docs/PHASE_10_BACKUP_AND_RECOVERY.md`.

Authentication email, SMTP, DNS, and redirect configuration are documented in
`docs/PHASE_10_AUTH_AND_DELIVERABILITY.md`.

Final security review, release handoff, rollback, and incident response are
documented in `docs/PHASE_10_SECURITY_AND_HANDOFF.md`.

Automated live-site validation and the post-launch operating cadence are
documented in `docs/PHASE_11_POST_LAUNCH_OPERATIONS.md`.
