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

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_GROQ_API_KEY` | Groq API key ([console.groq.com](https://console.groq.com)) |

> ⚠️ `VITE_` prefixed variables are bundled into the browser. Never put secret keys here.

### 3. Supabase setup

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Link to your project
supabase link --project-ref <your-project-ref>

# Run all migrations
supabase db push
```

### 4. Edge Function secrets

Set these in the Supabase dashboard → **Edge Functions → Secrets**, or via CLI:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set APP_URL=https://your-domain.com
supabase secrets set REPLAY_WEBHOOK_SECRET=some-random-secret
supabase secrets set PAST_DUE_GRACE_DAYS=3   # optional, defaults to 3
```

### 5. Run locally

```bash
npm run dev
```

---

## Database Migrations

All migrations live in `supabase/migrations/`. Run `supabase db push` to apply them.

| Migration | Description |
|---|---|
| `0001_subscription_management` | Core tables: `user_subscriptions`, `usage_records`, `billing_invoices` |
| `0002_webhook_events` | Event log for Stripe webhooks (idempotency + audit trail) |
| `0003_usage_rpc` | `increment_usage` and `get_current_usage` RPCs |
| `0004_enforcement_log` | Logs limit enforcement decisions for analytics |
| `0005_free_tier_provisioning` | Auto-provisions free tier on signup; adds daily usage tracking |
| `0006_trial_tracking` | `has_used_trial` flag to prevent repeat trials |
| `0007_error_handling` | `past_due_since` grace period; webhook retry tracking |

---

## Edge Functions

Located in `supabase/functions/`. Deploy with `supabase functions deploy`.

| Function | Route | Description |
|---|---|---|
| `create-checkout-session` | `POST /create-checkout-session` | Creates a Stripe Checkout session for a given price ID. Handles trials and existing customers. |
| `create-portal-session` | `POST /create-portal-session` | Creates a Stripe Billing Portal session for the logged-in user. |
| `manage-subscription` | `POST /manage-subscription` | Handles cancel, reactivate, and downgrade without going through Stripe's portal. |
| `stripe-webhook` | `POST /stripe-webhook` | Receives and verifies Stripe events; updates DB via shared processor. |
| `track-usage` | `POST /track-usage` | Increments usage counters and enforces limits before an action proceeds. |
| `replay-failed-webhooks` | `POST /replay-failed-webhooks` | Admin endpoint to replay failed webhook events (dead letter queue). |

---

## Subscription System

### Plans

Plans are defined in `src/lib/tiers.ts` (frontend) and mirrored in `supabase/functions/_shared/tiers.ts` (backend). To add or change a plan, edit those two files.

| Plan | Monthly | Annual | Trial |
|---|---|---|---|
| Free | $0 | — | — |
| Pro | $12/mo | $99/yr | 7 days |
| Unlimited | $29/mo | $239/yr | 7 days |

### Limit Enforcement

Every user action goes through `track-usage`, which:
1. Checks the user's current plan and usage
2. Blocks at 100% of the limit (returns `402`)
3. Warns at 80% (still allows, returns a warning flag)
4. Defaults to free-tier limits if no subscription record exists

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

1. Create products and prices in the Stripe dashboard. Copy the price IDs into `src/lib/tiers.ts`.
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
4. Add environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GROQ_API_KEY`).
5. The included `vercel.json` handles SPA fallback so deep routes like `/settings` and `/upgrade` work on refresh.

---

## Project Structure

```
src/
  components/        # UI components
    subscription-status.tsx   # Usage bars, billing info, payment banner
    payment-error-banner.tsx  # Past-due / failed payment warning
    plan-change-dialog.tsx    # Downgrade/cancel confirmation
  contexts/
    subscription-context.tsx  # App-wide subscription state
  lib/
    tiers.ts          # Plan definitions (single source of truth)
    checkout.ts       # Stripe checkout + portal helpers
    subscription.ts   # Cancel / reactivate / downgrade + status check
    usage.ts          # Client-side usage tracking
    enforce.ts        # Client-side limit pre-checks
    errors.ts         # Error classification → user-friendly messages
  pages/
    upgrade.tsx       # Plan selection + Stripe checkout trigger
    settings.tsx      # Account settings with subscription status

supabase/
  migrations/         # PostgreSQL schema migrations
  functions/
    _shared/          # Shared Deno modules (tiers, usage, email, grace period, webhook processor)
    create-checkout-session/
    create-portal-session/
    manage-subscription/
    stripe-webhook/
    track-usage/
    replay-failed-webhooks/
```
