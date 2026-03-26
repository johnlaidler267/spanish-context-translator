/**
 * Thin email helper — wraps the Resend API.
 *
 * All functions degrade gracefully when RESEND_API_KEY is absent:
 * they log a warning and return without throwing, so webhook processing
 * never fails just because email is not yet configured.
 *
 * Setup:
 *   1. Create an account at https://resend.com (free tier is generous).
 *   2. Verify your sending domain.
 *   3. Add RESEND_API_KEY and FROM_EMAIL to your Supabase Edge Function secrets:
 *        supabase secrets set RESEND_API_KEY=re_...
 *        supabase secrets set FROM_EMAIL=noreply@yourdomain.com
 *
 * Usage:
 *   import { sendTrialReminderEmail, sendTrialExpiredEmail } from "../_shared/email.ts"
 *
 *   await sendTrialReminderEmail({
 *     to:           "user@example.com",
 *     planName:     "Pro",
 *     daysLeft:     3,
 *     trialEndDate: new Date("2026-04-01"),
 *     portalUrl:    "https://billing.stripe.com/...",
 *     appUrl:       "https://yourapp.com",
 *   })
 */

// ─── Core send ────────────────────────────────────────────────────────────────

interface SendEmailOpts {
  to:      string
  subject: string
  html:    string
  text?:   string  // plain-text fallback (optional but improves deliverability)
}

/**
 * Send a transactional email via Resend.
 * Returns silently if RESEND_API_KEY is not configured.
 */
export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  const apiKey  = Deno.env.get("RESEND_API_KEY")
  const from    = Deno.env.get("FROM_EMAIL") ?? "noreply@example.com"

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — email not sent:", opts.subject)
    return
  }

  const body = {
    from,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
    ...(opts.text ? { text: opts.text } : {}),
  }

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "(no body)")
    console.error(`[email] Resend API error ${res.status}: ${detail}`)
    // Don't throw — email failure should never break webhook processing
  } else {
    const { id } = await res.json().catch(() => ({ id: "?" }))
    console.log(`[email] Sent "${opts.subject}" to ${opts.to} (id=${id})`)
  }
}

// ─── Trial emails ─────────────────────────────────────────────────────────────

interface TrialReminderOpts {
  to:           string
  planName:     string
  daysLeft:     number
  trialEndDate: Date
  /** Stripe Billing Portal URL for the user to add a payment method. */
  portalUrl:    string
  appUrl:       string
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "long", day: "numeric", year: "numeric",
})

/** Sent by the stripe-webhook handler when customer.subscription.trial_will_end fires (~3 days out). */
export async function sendTrialReminderEmail(opts: TrialReminderOpts): Promise<void> {
  const { to, planName, daysLeft, trialEndDate, portalUrl, appUrl } = opts

  const dayWord  = daysLeft === 1 ? "day" : "days"
  const endStr   = dateFormat.format(trialEndDate)

  const subject = `Your ${planName} trial ends in ${daysLeft} ${dayWord}`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9f9f9; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; border: 1px solid #e5e7eb;">

    <h1 style="margin: 0 0 8px; font-size: 22px; color: #111;">
      Your ${planName} trial ends in ${daysLeft} ${dayWord}
    </h1>
    <p style="margin: 0 0 24px; color: #6b7280; font-size: 15px;">
      Your free trial expires on <strong>${endStr}</strong>.
      Add a payment method now to keep uninterrupted access — you won't be charged until then.
    </p>

    <a href="${portalUrl}"
       style="display: inline-block; background: #111; color: #fff; text-decoration: none;
              padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600;">
      Add payment method →
    </a>

    <p style="margin: 24px 0 0; font-size: 13px; color: #9ca3af;">
      If you prefer not to continue, your account will automatically revert to the
      free plan on ${endStr}. No action needed.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
      <a href="${appUrl}" style="color: #6b7280;">Open the app</a>
      &nbsp;·&nbsp;
      Questions? Reply to this email.
    </p>
  </div>
</body>
</html>
  `.trim()

  const text = [
    `Your ${planName} trial ends in ${daysLeft} ${dayWord} (${endStr}).`,
    ``,
    `Add a payment method to keep access: ${portalUrl}`,
    ``,
    `If you'd rather not continue, your account automatically reverts to the free plan on ${endStr}.`,
    ``,
    `Open the app: ${appUrl}`,
  ].join("\n")

  await sendEmail({ to, subject, html, text })
}

interface TrialExpiredOpts {
  to:        string
  planName:  string
  upgradeUrl: string
  appUrl:    string
}

/** Sent when the trial subscription is deleted without a payment method being added. */
export async function sendTrialExpiredEmail(opts: TrialExpiredOpts): Promise<void> {
  const { to, planName, upgradeUrl, appUrl } = opts

  const subject = `Your ${planName} trial has ended`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9f9f9; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; border: 1px solid #e5e7eb;">

    <h1 style="margin: 0 0 8px; font-size: 22px; color: #111;">
      Your ${planName} trial has ended
    </h1>
    <p style="margin: 0 0 24px; color: #6b7280; font-size: 15px;">
      Your account has reverted to the <strong>Free plan</strong>.
      Subscribe any time to restore your ${planName} access.
    </p>

    <a href="${upgradeUrl}"
       style="display: inline-block; background: #111; color: #fff; text-decoration: none;
              padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600;">
      Resubscribe to ${planName} →
    </a>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
      <a href="${appUrl}" style="color: #6b7280;">Open the app</a>
      &nbsp;·&nbsp;
      Questions? Reply to this email.
    </p>
  </div>
</body>
</html>
  `.trim()

  const text = [
    `Your ${planName} trial has ended.`,
    `Your account has reverted to the Free plan.`,
    ``,
    `Resubscribe any time: ${upgradeUrl}`,
    ``,
    `Open the app: ${appUrl}`,
  ].join("\n")

  await sendEmail({ to, subject, html, text })
}
