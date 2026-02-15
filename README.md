# TIVET-IDEA-FORM

A lightweight, static web app for collecting participant consent and details, backed by Supabase for storage, database, and authentication. Includes a public submission form and an admin dashboard with inline editing and CSV/HTML/DOCX export.

## Features
- Public form with photo upload and signature (draw or upload).
- Submissions stored in `public.submissions` and files in a `submissions` storage bucket.
- Admin login (`admin-login.html`) to view, edit, select, and export submissions.

## Setup
1. Supabase
   - Create a bucket named `submissions` and make it public.
   - Create table `public.submissions` with RLS policies:
     - Allow anonymous INSERTs for the public form.
     - Allow authenticated UPDATE/SELECT for your admin account(s).
   - Rotate any previously exposed service role keys. Only use the anon key in this repo.
2. Client config
   - Ensure `js/supabase.js` (and any inline fallback) uses your Supabase URL and anon key.
3. Local preview
   - From this folder: `python -m http.server 3000`
   - Open `http://localhost:3000/index.html` (public form) and `http://localhost:3000/admin.html` (admin).

## Deploy
- This is a static site; you can host on GitHub Pages, Netlify, Vercel, etc.
- Make sure your Supabase URL and anon key are set appropriately for production.

## Security
- Do not commit any service role keys. Only keep the anon public key in client code.
- Use restrictive RLS for reads/updates in the admin dashboard (e.g., restrict by admin email).

## License
- Proprietary by default. Add a license here if desired.