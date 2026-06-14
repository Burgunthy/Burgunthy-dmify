export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated: June 14, 2026</p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          1. Information We Collect
        </h2>
        <p>
          DMify collects the following information to provide our Instagram
          comment auto-reply service:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Account Information:</strong> Email address (via Google OAuth),
            display name.
          </li>
          <li>
            <strong>Instagram Data:</strong> Instagram username, follower count,
            and media count (via Meta Graph API). We do not store your
            Instagram password.
          </li>
          <li>
            <strong>Access Tokens:</strong> Long-lived Instagram access tokens
            are stored securely to send automated DMs on your behalf. Tokens
            are encrypted at rest.
          </li>
          <li>
            <strong>Usage Data:</strong> Comment notifications, DM delivery
            status, and click counts on affiliate links.
          </li>
        </ul>

        <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          2. How We Use Your Information
        </h2>
        <ul className="ml-4 list-disc space-y-1">
          <li>Send automated DM replies to Instagram commenters on your behalf.</li>
          <li>
            Check follower status to determine which message template to use.
          </li>
          <li>Track affiliate link clicks and conversion statistics.</li>
          <li>Provide customer support and improve our service.</li>
        </ul>

        <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          3. Data Storage & Security
        </h2>
        <p>
          Data is stored on Supabase (hosted on AWS) with encryption at rest.
          Access tokens are stored in the database and are only used for
          Instagram API calls. We never share your data with third parties
          except as necessary to operate the service (e.g., Meta/Instagram
          API).
        </p>

        <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          4. Data Retention
        </h2>
        <p>
          You can delete your account and all associated data at any time from
          the dashboard settings. Upon account deletion, all personal data,
          Instagram tokens, and conversation records are permanently removed
          within 30 days.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          5. Third-Party Services
        </h2>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Google:</strong> OAuth for user authentication.
          </li>
          <li>
            <strong>Meta/Instagram:</strong> Graph API for Instagram account
            linking, comment monitoring, and DM sending.
          </li>
          <li>
            <strong>Supabase:</strong> Database and authentication
            infrastructure.
          </li>
          <li>
            <strong>Vercel:</strong> Application hosting.
          </li>
        </ul>

        <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          6. Your Rights
        </h2>
        <p>You have the right to:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Access, update, or delete your personal data.</li>
          <li>Revoke Instagram access at any time from the dashboard.</li>
          <li>Request a copy of all data we hold about you.</li>
        </ul>

        <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          7. Contact
        </h2>
        <p>
          For privacy-related inquiries, contact us at{" "}
          <a
            href="mailto:support@dmify.io"
            className="text-purple-600 underline hover:text-purple-700"
          >
            support@dmify.io
          </a>
          .
        </p>
      </section>
    </main>
  )
}
