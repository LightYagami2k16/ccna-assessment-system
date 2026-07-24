# CCNA Assessment System — Phase 1 Starter

React/Vite front end for GitHub Pages with a Supabase backend. This starter includes:

- Email/password authentication
- Automatic student profiles
- Student, instructor, and admin roles
- ITN, SRWE, and ENSA starter courses
- Row Level Security policies
- Responsive dashboard
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
```

Then:

```bash
npm install
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

The publishable key is designed for browser use but must always be paired with RLS. Never place a Supabase secret key or service-role key in this React project.

## 6. Enable GitHub Pages

Open **Settings → Pages** and choose **GitHub Actions** as the source. Pushes to `main` will build and deploy the site.

## Current boundary

This is the Phase 1 foundation. It does not yet include the question editor, timed quiz engine, grading, or Cisco terminal. Those are the next development increments.
