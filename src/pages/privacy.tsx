"use client"

import { LegalPageShell } from "@/components/legal-page-shell"
import { LegalSection as Section } from "@/components/legal-section"

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="April 2, 2026">
      <p className="text-muted-foreground">
        This Privacy Policy describes how LexaLens (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects, uses,
        and shares information when you use our Spanish reading and translation companion (the &quot;Service&quot;).
      </p>

      <Section title="1. Information we collect">
        <p>
          <strong>Account information.</strong> When you create an account, we collect identifiers such as email
          address and authentication provider data (for example from Google OAuth or magic-link sign-in).
        </p>
        <p>
          <strong>Usage and technical data.</strong> We collect information about how you use the Service, such as
          request timestamps, feature usage, plan tier, and diagnostics needed to operate limits and billing. We also
          collect standard technical data such as device type, browser, approximate region from IP, and cookies or
          similar technologies as described below.
        </p>
        <p>
          <strong>Content you submit.</strong> Text and related input you provide for translation, reading, voice input,
          or learning features is processed to deliver the Service. Some processing occurs on our servers and through
          third-party subprocessors, including AI inference providers.
        </p>
        <p>
          <strong>Payment information.</strong> Payments are handled by our payment processor (Stripe). We receive
          billing status, subscription identifiers, and limited payment metadata—not your full card number, which Stripe
          stores according to its policies.
        </p>
      </Section>

      <Section title="2. How we use information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Provide, maintain, and improve the Service, including translations and AI-assisted features.</li>
          <li>Authenticate users, prevent fraud and abuse, and enforce our Terms of Service.</li>
          <li>Manage subscriptions, usage limits, invoices, and customer support.</li>
          <li>Send transactional messages (for example magic links, receipts, or service notices).</li>
          <li>Comply with legal obligations and protect rights and safety.</li>
          <li>Analyze aggregated or de-identified usage to improve the product.</li>
        </ul>
      </Section>

      <Section title="3. Legal bases (EEA, UK, and similar regions)">
        <p>
          Where GDPR or similar laws apply, we rely on: performance of a contract (providing the Service); legitimate
          interests (security, analytics, product improvement) balanced against your rights; consent where required
          (for example certain cookies or marketing, if offered); and legal obligations.
        </p>
      </Section>

      <Section title="4. How we share information">
        <p>We share information with service providers who process it on our behalf, including:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Supabase</strong> — authentication, database, and related backend infrastructure.
          </li>
          <li>
            <strong>Stripe</strong> — payment processing and subscription management.
          </li>
          <li>
            <strong>AI and infrastructure providers</strong> — for example model inference and hosting (such as Groq
            or other providers we configure) to generate translations and explanations.
          </li>
          <li>
            <strong>Email providers</strong> — for example to send magic links or transactional email.
          </li>
          <li>
            <strong>Hosting and analytics</strong> — for operating the web application and understanding reliability.
          </li>
        </ul>
        <p>
          We may also disclose information if required by law, to respond to lawful requests, or to protect our users
          and the Service. If we are involved in a merger or acquisition, information may be transferred subject to this
          Policy or equivalent protections.
        </p>
      </Section>

      <Section title="5. Retention">
        <p>
          We retain information for as long as your account is active and as needed to provide the Service, comply with
          legal obligations, resolve disputes, and enforce agreements. Usage and log data may be retained for shorter
          periods in aggregated or de-identified form. You may request deletion as described below, subject to legal
          exceptions.
        </p>
      </Section>

      <Section title="6. Security">
        <p>
          We use administrative, technical, and organizational measures designed to protect information. No method of
          transmission or storage is completely secure; we cannot guarantee absolute security.
        </p>
      </Section>

      <Section title="7. Your choices and rights">
        <p>
          Depending on your location, you may have rights to access, correct, delete, or export personal data, to object
          to or restrict certain processing, and to withdraw consent where processing is consent-based. You may also
          have the right to lodge a complaint with a supervisory authority. To exercise these rights, contact us using
          the method we provide in the Service or on our website. You can manage cookies through your browser settings
          where applicable.
        </p>
      </Section>

      <Section title="8. Children">
        <p>
          The Service is not directed to children under 13 (or the minimum age required in your jurisdiction). We do not
          knowingly collect personal information from children. If you believe we have collected such information,
          contact us and we will take appropriate steps to delete it.
        </p>
      </Section>

      <Section title="9. International transfers">
        <p>
          We may process information in the United States and other countries where we or our providers operate. Where
          required, we use appropriate safeguards (such as standard contractual clauses) for transfers from the EEA, UK,
          or Switzerland.
        </p>
      </Section>

      <Section title="10. Cookies and local storage">
        <p>
          We use cookies and similar technologies for session management, preferences (such as theme), and security.
          Third-party providers we use may set their own cookies as described in their policies.
        </p>
      </Section>

      <Section title="11. Changes to this Policy">
        <p>
          We may update this Privacy Policy from time to time. We will post the updated Policy and revise the
          &quot;Last updated&quot; date. For material changes, we will provide additional notice where appropriate.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          For privacy questions or requests, contact us using the support or contact method we provide in the Service
          or on our website.
        </p>
      </Section>
    </LegalPageShell>
  )
}
