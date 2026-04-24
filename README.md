# Lector — Spanish Reading Companion

A Vite + React SPA for reading and translating Spanish content, with full subscription billing powered by Stripe and Supabase.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite, React, TypeScript, Tailwind CSS |
| Backend / DB | Supabase (PostgreSQL + Edge Functions) |
| Payments | Stripe (Checkout, Billing Portal, Webhooks) |
| Email | Resend |
| Hosting | Vercel (frontend) |

---

## Local Development

### 1. Install dependencies

`npm run dev` / `build` / `preview` will auto-use the repo-pinned `.nvmrc` version when `nvm` is installed.

You can still switch manually first if you want:

```bash
nvm use
```

If that version is not installed yet:

```bash
nvm install
nvm use
```

Then install dependencies:

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in the values (the example file documents optional toggles and Gemini overrides inline):

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_STRIPE_PRICE_PRO_MONTHLY` | Stripe Price ID for Pro monthly (`price_…`) |
| `VITE_STRIPE_PRICE_PRO_ANNUAL` | Stripe Price ID for Pro annual (`price_…`) |
| `VITE_TRANSLATION_LLM_PROVIDER` | Optional: set to `gemini` to use `gemini-chat` instead of Groq |
| `VITE_GEMINI_MODEL`, `VITE_GEMINI_MODEL_LEARN` | Optional Gemini model overrides (must match `gemini-chat` allowlist) |
| `VITE_ENFORCE_USAGE_IN_DEV` | Optional: `true` to enforce limits during local dev |
| `VITE_SIMULATE_LAPSED` | Optional: `true` to exercise lapsed-subscription UI locally |

Mirror the Stripe price IDs in Supabase Edge secrets as `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_ANNUAL` (see `supabase/functions/_shared/tiers.ts`). Legacy Unlimited price secrets still map to Pro for existing subscribers.

> ⚠️ `VITE_` prefixed variables are bundled into the browser. **Never** put API keys for Groq or other paid APIs there. The Groq key lives only in Supabase Edge Function secrets (`GROQ_API_KEY`).

### 3. Supabase setup

```bash
# CLI: install globally (brew install supabase/tap/supabase) or use npx — no global install required
npx supabase@latest login
npx supabase@latest link --project-ref <your-project-ref>

# Run all migrations
npx supabase@latest db push
```

Optional: enforce plan limits while running `npm run dev` (by default they are **skipped** locally). Set in `.env`:

`VITE_ENFORCE_USAGE_IN_DEV=true`

### 4. Edge Function secrets

Set these in the Supabase dashboard → **Edge Functions → Secrets**, or via CLI:

```bash
npx supabase@latest secrets set STRIPE_SECRET_KEY=sk_test_...
npx supabase@latest secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase@latest secrets set RESEND_API_KEY=re_...
npx supabase@latest secrets set APP_URL=https://your-domain.com
npx supabase@latest secrets set REPLAY_WEBHOOK_SECRET=some-random-secret
npx supabase@latest secrets set PAST_DUE_GRACE_DAYS=3   # optional, defaults to 3
npx supabase@latest secrets set GROQ_API_KEY=gsk_...    # Groq — used only by Edge Functions (translation, Learn, voice, chunk details)
# Optional — only if you set VITE_TRANSLATION_LLM_PROVIDER=gemini and deploy `gemini-chat`:
# npx supabase@latest secrets set GEMINI_API_KEY=...
```

**Auth (required for translation):** In Supabase → **Authentication** → **Providers**, enable **Anonymous** sign-ins. Guests get an anonymous JWT so Edge Functions can authorize requests without exposing `GROQ_API_KEY` in the client bundle.

### 5. Run locally

```bash
npm run dev
```

---

## Database Migrations

All migrations live in `supabase/migrations/`. Run `npx supabase@latest db push` to apply them.

| Migration | Description |
|---|---|
| `0001_subscription_management` | Core tables: `user_subscriptions`, `usage_records`, `billing_invoices` |
| `0002_webhook_events` | Event log for Stripe webhooks (idempotency + audit trail) |
| `0003_usage_rpc` | `increment_usage` and `get_current_usage` RPCs |
| `0004_enforcement_log` | Logs limit enforcement decisions for analytics |
| `0005_free_tier_provisioning` | Auto-provisions free tier on signup; adds daily usage tracking |
| `0006_trial_tracking` | `has_used_trial` flag to prevent repeat trials |
| `0007_error_handling` | `past_due_since` grace period; webhook retry tracking |
| `0008_increment_usage_utc_daily` | Daily `texts_today` reset uses UTC calendar date |
| `0009_fix_extra_counters_null` | Harden `increment_usage` / `extra_counters` null handling |
| `0010_chars_today_daily` | Adds `chars_today` / `chars_today_date` to `usage_records` (legacy; no longer used for tier limits) |
| `0010_fix_trial_trigger_on_insert` | Trial trigger runs on INSERT so `has_used_trial` is set when `trial_start` is present |
| `0011_plan_id_free_pro_only` | DB enum is `free` / `pro` only; legacy `unlimited` rows merged to `pro` |

---

## Edge Functions

Located in `supabase/functions/`. JWT verification and other flags live in `supabase/config.toml` per function.

Deploy from the repo root (after `supabase link` or pass `--project-ref`):

```bash
npx supabase@latest functions deploy <function-name>
```

Npm shortcuts (see `package.json`): `npm run supabase:deploy-checkout`, `npm run supabase:deploy-track-usage`, and `npm run supabase:deploy-groq` (deploys `groq-chat`, `groq-transcribe`, `chunk-details`, and `gemini-chat`).

**Deploy every function your app calls** — missing routes return `NOT_FOUND` from the API gateway (e.g. checkout success must have `confirm-checkout-session` deployed).

If the browser reports **CORS** errors on `functions/v1/groq-chat` (preflight “does not have HTTP ok status”), the usual cause is that **`groq-chat` is not deployed** to that project: the gateway responds with **404** to `OPTIONS`, which is not a successful CORS preflight. Run `npm run supabase:deploy-groq` (or `npx supabase functions deploy groq-chat`) after linking the project.

| Function | Route | Description |
|---|---|---|
| `create-checkout-session` | `POST /create-checkout-session` | Creates a Stripe Checkout session for a given price ID. Handles trials and existing customers. |
| `confirm-checkout-session` | `POST /confirm-checkout-session` | After Checkout return: syncs subscription row so the app is not webhook-only. |
| `create-portal-session` | `POST /create-portal-session` | Creates a Stripe Billing Portal session for the logged-in user. |
| `manage-subscription` | `POST /manage-subscription` | Handles cancel, reactivate, and downgrade without going through Stripe's portal. |
| `stripe-webhook` | `POST /stripe-webhook` | Receives and verifies Stripe events; updates DB via shared processor. |
| `track-usage` | `POST /track-usage` | Increments usage counters; returns `counters`, `limits`, `allowed`, `exceeded`, `tierId`, `period`. |
| `groq-chat` | `POST /groq-chat` | Proxies OpenAI-compatible chat completions to Groq (`GROQ_API_KEY` server-side). |
| `gemini-chat` | `POST /gemini-chat` | Proxies translation/learn chat to Gemini (`GEMINI_API_KEY`); optional alternative to `groq-chat` (see Translation section). |
| `groq-transcribe` | `POST /groq-transcribe` | Proxies Whisper transcription to Groq. |
| `chunk-details` | `POST /chunk-details` | Grammar / chunk detail calls from the reader UI (Groq via server). |
| `replay-failed-webhooks` | `POST /replay-failed-webhooks` | Admin endpoint to replay failed webhook events (dead letter queue). |

---

## Subscription System

### Plans

Plans are defined in `src/lib/tiers.ts` (frontend) and mirrored in `supabase/functions/_shared/tiers.ts` (Edge Functions). **Keep both in sync** and **redeploy `track-usage`** after changing backend caps. The database and app use **Free** and **Pro** only; legacy **Unlimited** IDs from Stripe or old rows normalize to Pro (`normalizeTierId` in `tiers.ts`).

| Plan | Monthly | Annual | Trial |
|---|---|---|---|
| Free | $0 | — | — |
| Pro | $7/mo | $59/yr | 7 days |

Free tier (see `limits` in `TIERS.free` in `tiers.ts`): **daily submission cap** (`textsPerDay`), **per-submission** character cap, and chunk limits. Pro has uncapped submissions/characters for normal use. Article **pages** use **per-request** semantics where applicable (not a separate cumulative page bank on free).

### Limit Enforcement

Authenticated submits call `track-usage`, which increments counters and returns **HTTP 200** with JSON: `allowed`, `exceeded`, `limits`, `counters`, **`tierId`**, and `period`. The frontend can **reconcile `limits` from `tierId`** via `getTier()` in `src/lib/usage.ts` so UI caps match the shipped app even if an old bundle was deployed briefly.

The client also pre-checks limits before translation (`src/lib/enforce.ts` + `App.tsx`). If no subscription row exists, the function provisions free tier when possible.

### Translation (Groq or Gemini)

By default, chunking uses **Groq** through **`groq-chat`** (`src/lib/translate.ts` → `src/lib/groq-edge.ts`). The Groq API key is **not** in the browser. **On-demand** Groq projects enforce a low **tokens-per-minute / request-size** budget (roughly prompt + `max_tokens`). If you see TPM errors on short text, lower `TRANSLATE_MAX_COMPLETION_TOKENS` in `translate.ts`, shorten the prompt, or upgrade Groq.

**Gemini (optional):** Set `VITE_TRANSLATION_LLM_PROVIDER=gemini`, add the Supabase secret **`GEMINI_API_KEY`**, and deploy **`gemini-chat`**. Google’s API uses separate quotas from Groq; errors such as **`limit: 0`** or **free-tier quota exceeded** usually mean billing is not enabled for the Google Cloud / AI Studio project, the key has no usable quota for the chosen model, or you need to adjust usage in [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits). To fall back to Groq, remove or unset `VITE_TRANSLATION_LLM_PROVIDER`.

### Landing plan pill

On the home page, `MainHeader` (with `showPlanBanner`) shows a single link: copy depends on `user_subscriptions` (`plan_id`, `status`, `trial_end`). Paid / trial / past-due states link to **`/settings?tab=billing`**; free / signed-out links to **`/upgrade`**.

### Grace Period (Past Due)

When a payment fails, Stripe marks the subscription `past_due`. Users retain their paid-tier access for `PAST_DUE_GRACE_DAYS` (default: 3) before being downgraded to free-tier limits. The clock starts from `user_subscriptions.past_due_since`.

### Webhook Retry / Dead Letter Queue

Failed webhook events (e.g. from a DB outage) are stored in `webhook_events` with `status = 'failed'`. Call the `replay-failed-webhooks` endpoint to retry them:

```bash
curl -X POST https://<project>.supabase.co/functions/v1/replay-failed-webhooks \
  -H "Authorization: Bearer <REPLAY_WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"limit": 20}'
```

Events that fail 3 consecutive retries are marked `dead_letter`.

---

## Stripe Setup

1. Create products and prices in the Stripe dashboard. Put the Pro monthly/annual **Price IDs** in `.env` as `VITE_STRIPE_PRICE_PRO_MONTHLY` / `VITE_STRIPE_PRICE_PRO_ANNUAL` and set matching `STRIPE_PRICE_*` secrets for Edge Functions (placeholders in `src/lib/tiers.ts` are replaced via env at build time).
2. Create a webhook endpoint pointing to `https://<project>.supabase.co/functions/v1/stripe-webhook`.
3. Subscribe to these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`.

---

## Deployment (Vercel)

1. Push the repo to GitHub.
2. [Vercel](https://vercel.com) → **Add New Project** → import the repo.
3. **Framework preset:** Vite. **Build:** `npm run build`. **Output:** `dist`.
4. Add environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, Pro `VITE_STRIPE_PRICE_*` IDs). Set `GROQ_API_KEY` (and Stripe secrets) in Supabase; deploy LLM/transcription functions, e.g. `npm run supabase:deploy-groq` (`groq-chat`, `groq-transcribe`, `chunk-details`, `gemini-chat` if you use Gemini).
5. The included `vercel.json` handles SPA fallback so deep routes like `/settings` and `/upgrade` work on refresh.

---

## Article next-page prefetch (revisit)

Article mode **does not** start translating the following page in the background while you read the current one. The LLM runs for the next slice only after you tap **Next page**; the app advances to that page once the request finishes (or immediately if that page was already cached or failed).

Previously, a `useEffect` in `App.tsx` called `TranslationCache.loadPage(articlePageIndex + 1, …)` whenever the visible article page changed. To restore that behavior, reintroduce that effect and set `nextPageOpen` / `goArticleNext` back to “allow next when the next page is already loaded, errored, or in flight,” with navigation on Next only incrementing the index.

Read mode uses the same translated slice as the current article page and only requests the next LLM page when you advance past the last read step on that page (same `TranslationCache.loadPage` path as **Next page** in article mode). There is no read-mode-only background preload.

---

## Project Structure

```
src/
  components/        # UI (high level)
    main-header.tsx           # Header + landing plan pill → /upgrade or /settings?tab=billing
    article-content.tsx       # Article body + translation chunks
    text-chunk.tsx            # Per-chunk translation, details, interactions
    subscription-status.tsx   # Usage bars, billing info, payment banner
    subscription-lapsed-modal.tsx
    payment-error-banner.tsx  # Past-due / failed payment warning
    plan-change-dialog.tsx    # Downgrade/cancel confirmation
    auth-sign-in-options.tsx  # Anonymous + other auth entry points
  contexts/
    subscription-context.tsx  # App-wide subscription state (coarse status)
  lib/
    tiers.ts          # Plan definitions (mirror server _shared/tiers.ts)
    checkout.ts       # Stripe checkout + portal + confirm-checkout-session
    subscription.ts   # Cancel / reactivate / downgrade + status check
    usage.ts          # track-usage client + limit reconciliation from tierId
    enforce.ts        # Client-side limit pre-checks
    translate.ts      # Chunking + LLM provider routing (Groq / Gemini)
    errors.ts         # Error classification → user-friendly messages
  pages/
    upgrade.tsx       # Plan selection + Stripe checkout trigger
    settings.tsx      # General / Account / Billing tabs (?tab=billing)

supabase/
  config.toml         # Per-function verify_jwt and other CLI deploy settings
  migrations/         # PostgreSQL schema migrations
  functions/
    _shared/          # Shared Deno modules (tiers, usage, CORS, enforcement, webhooks)
    create-checkout-session/
    confirm-checkout-session/
    create-portal-session/
    manage-subscription/
    stripe-webhook/
    track-usage/
    groq-chat/
    groq-transcribe/
    gemini-chat/
    chunk-details/
    replay-failed-webhooks/
```
