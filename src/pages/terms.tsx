"use client"

import { LegalPageShell } from "@/components/legal-page-shell"
import { LegalSection as Section } from "@/components/legal-section"

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" lastUpdated="April 2, 2026">
      <p className="text-muted-foreground">
        These Terms of Service (&quot;Terms&quot;) govern your use of LexaLens (the &quot;Service&quot;), a Spanish
        reading and translation companion operated by us (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By
        accessing or using the Service, you agree to these Terms. If you do not agree, do not use the Service.
      </p>

      <Section title="1. The Service">
        <p>
          LexaLens helps you read and study Spanish text by providing translations, explanations, and related features
          that may use third-party artificial intelligence and language models. Features and availability may change
          over time. We do not guarantee uninterrupted or error-free operation.
        </p>
      </Section>

      <Section title="2. Eligibility and accounts">
        <p>
          You must be able to form a binding contract in your jurisdiction. You may sign in with email (magic link),
          Google, or other methods we support. You are responsible for activity under your account and for keeping
          your credentials secure. Notify us promptly if you suspect unauthorized access, using the contact method we
          publish in the app or on our website.
        </p>
      </Section>

      <Section title="3. Subscriptions and payments">
        <p>
          Paid plans, if offered, are billed through our payment processor (currently Stripe). Prices, taxes, renewal
          terms, and cancellation rules are shown at checkout and in your billing settings. Unless stated otherwise,
          subscriptions renew until you cancel through the Service or billing portal. We may change pricing with
          reasonable notice where required by law.
        </p>
      </Section>

      <Section title="4. Your content">
        <p>
          You may submit text and other content to the Service (&quot;User Content&quot;). You retain ownership of your
          User Content. You grant us a non-exclusive license to host, process, transmit, and display User Content only
          as needed to provide and improve the Service, enforce these Terms, and comply with law. You represent that you
          have the rights needed to submit User Content and that it does not violate third-party rights or applicable
          law.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Use the Service for unlawful, harmful, fraudulent, or abusive purposes.</li>
          <li>Attempt to probe, scan, or test the vulnerability of our systems, or bypass security or usage limits.</li>
          <li>Reverse engineer or scrape the Service in violation of these Terms or applicable law.</li>
          <li>Use the Service to build a competing product using our outputs or infrastructure in bulk without consent.</li>
          <li>Submit content that infringes intellectual property, contains malware, or violates others&apos; privacy.</li>
        </ul>
        <p>We may suspend or terminate access for violations or risk to the Service or other users.</p>
      </Section>

      <Section title="6. AI-generated output">
        <p>
          Outputs may be generated using AI and may be inaccurate, incomplete, or unsuitable for professional,
          medical, legal, or other specialized advice. You are responsible for how you use translations and
          explanations. Do not rely on the Service as a substitute for qualified human judgment where it matters.
        </p>
      </Section>

      <Section title="7. Third-party services">
        <p>
          The Service relies on providers such as hosting, authentication, database, email, payments, and AI
          inference (for example Supabase, Stripe, and model providers). Their terms and privacy practices also apply
          where you interact with them. We are not responsible for third-party services we do not control.
        </p>
      </Section>

      <Section title="8. Intellectual property">
        <p>
          The Service, including its design, branding, and software (excluding your User Content), is owned by us or
          our licensors and is protected by intellectual property laws. Except for the limited rights to use the Service
          under these Terms, no rights are granted to you.
        </p>
      </Section>

      <Section title="9. Disclaimers">
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE,&quot; WITHOUT WARRANTIES OF ANY KIND,
          WHETHER EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          AND NON-INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED BY LAW.
        </p>
      </Section>

      <Section title="10. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE AND OUR AFFILIATES, OFFICERS, AND SUPPLIERS WILL NOT BE LIABLE FOR
          ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, OR FOR LOSS OF PROFITS, DATA, OR
          GOODWILL, ARISING FROM YOUR USE OF THE SERVICE. OUR AGGREGATE LIABILITY FOR CLAIMS RELATING TO THE SERVICE
          WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE
          CLAIM OR (B) ONE HUNDRED U.S. DOLLARS (USD $100), EXCEPT WHERE PROHIBITED BY LAW. SOME JURISDICTIONS DO NOT
          ALLOW CERTAIN LIMITATIONS; IN THOSE CASES, OUR LIABILITY IS LIMITED TO THE FULLEST EXTENT PERMITTED.
        </p>
      </Section>

      <Section title="11. Indemnity">
        <p>
          You will defend and indemnify us against claims, damages, and expenses (including reasonable attorneys&apos;
          fees) arising from your User Content, your misuse of the Service, or your violation of these Terms or law,
          to the extent permitted by law.
        </p>
      </Section>

      <Section title="12. Termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate access if you breach these Terms,
          if we are required to by law, or if we discontinue the Service. Provisions that by their nature should
          survive (including ownership, disclaimers, limitations, and indemnity) will survive termination.
        </p>
      </Section>

      <Section title="13. Changes">
        <p>
          We may update these Terms from time to time. We will post the revised Terms and update the &quot;Last
          updated&quot; date. If changes are material, we will provide notice as required by law or as we deem
          appropriate (for example, in-app notice or email). Continued use after the effective date constitutes
          acceptance of the revised Terms.
        </p>
      </Section>

      <Section title="14. Governing law and disputes">
        <p>
          These Terms are governed by the laws of the United States and the State of Delaware, excluding conflict-of-law
          rules, unless your local law requires otherwise. Courts in Delaware have exclusive jurisdiction for disputes
          arising from these Terms, subject to mandatory consumer protections in your country of residence where
          applicable.
        </p>
      </Section>

      <Section title="15. Contact">
        <p>
          For questions about these Terms, contact us using the support or contact method we provide in the Service or
          on our website.
        </p>
      </Section>
    </LegalPageShell>
  )
}
