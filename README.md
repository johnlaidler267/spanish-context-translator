# Lector — Spanish reading companion

Vite + React app with client-side routing.

## Deploy on Vercel (cheap / free tier)

The repo already includes `vercel.json` so routes like `/settings` and `/upgrade` work on refresh (SPA fallback).

1. Push the repo to GitHub/GitLab/Bitbucket.
2. [Vercel](https://vercel.com) → **Add New Project** → import the repo.
3. **Framework preset:** Vite (auto). **Build:** `npm run build` → **Output:** `dist`.
4. **Environment variables** (Project → Settings → Environment Variables), same as local `.env`:
   - `VITE_GROQ_API_KEY` — your Groq API key ([console.groq.com](https://console.groq.com)).
5. Deploy. Optional: add your own domain under **Domains**.

### API key note (customer-facing later)

Anything prefixed with `VITE_` is **bundled into the browser** — fine for a private prototype; for a public product you’ll usually move calls to **Vercel Serverless Functions** or another backend so the key stays server-side.

## Supabase (when you need it)

This app doesn’t use Supabase yet. When you add auth, saved reads, or billing metadata:

1. Create a project on [Supabase](https://supabase.com) (free tier is generous).
2. Add `@supabase/supabase-js` and use **anon key** + **RLS** in the client, or call Supabase from serverless routes for sensitive work.

---

## React + Vite (template notes)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
