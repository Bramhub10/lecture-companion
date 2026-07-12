import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — StudyBuddy",
};

// Update these when the domain + entity are finalized.
const CONTACT_EMAIL = "support@yourdomain.com";
const EFFECTIVE = "July 12, 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-slate-800">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-slate-500">Effective {EFFECTIVE}</p>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
        >
          ← Back
        </Link>
      </header>

      <div className="space-y-6 text-sm leading-relaxed text-slate-600 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900">
        <p>
          This policy explains what StudyBuddy collects, how we use it, and who we share it with. We
          collect only what we need to run the Service.
        </p>

        <h2>What we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Account info</strong> — your name and email, handled by our authentication
            provider (Clerk).
          </li>
          <li>
            <strong>Lecture data</strong> — the audio you record, its transcript, and the AI-generated
            notes, deadlines, and study aids derived from it.
          </li>
          <li>
            <strong>Usage &amp; billing</strong> — your plan, lecture count, and subscription status.
            Card details are handled entirely by Stripe; we never see or store them.
          </li>
        </ul>

        <h2>How your audio is handled</h2>
        <p>
          When you record, the audio is uploaded to secure storage (Vercel Blob) and sent to our
          transcription provider (Deepgram) to produce a transcript.{" "}
          <strong>The audio file is deleted right after it is transcribed.</strong> The transcript is
          then analyzed by a large language model (Anthropic&rsquo;s Claude, via the Vercel AI
          Gateway) to generate your notes. Your transcripts and notes are stored in our database
          (Neon Postgres), scoped to your account, so you can access them across devices.
        </p>

        <h2>Service providers we share with</h2>
        <p>
          We use trusted processors to run the Service, each handling only what their function
          requires: Clerk (accounts), Stripe (payments), Deepgram (transcription), Anthropic via
          Vercel AI Gateway (AI analysis), and Vercel/Neon (hosting &amp; database). We do not sell
          your personal information.
        </p>

        <h2>Retention &amp; deletion</h2>
        <p>
          Your lectures stay in your account until you delete them or close your account. You can
          delete any saved lecture from within the app. To delete your account and associated data,
          contact us at the address below and we will remove your data within a reasonable period.
        </p>

        <h2>Students &amp; schools</h2>
        <p>
          StudyBuddy is a personal tool you choose to use; we are not acting on behalf of your
          school. If you are subject to FERPA or your institution&rsquo;s policies, you are
          responsible for using the Service consistently with them. See also the recording
          responsibilities in our{" "}
          <Link href="/terms" className="font-medium text-slate-900 underline">
            Terms of Service
          </Link>
          .
        </p>

        <h2>Your choices</h2>
        <p>
          You can access and delete your lectures at any time in the app, and you can request full
          account deletion. Depending on where you live, you may have additional rights over your
          personal data; contact us to exercise them.
        </p>

        <h2>Contact</h2>
        <p>
          Privacy questions? Reach us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-slate-900 underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>

        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          This is a starting template, not legal advice. Have it reviewed by a qualified attorney and
          make sure it accurately reflects your actual data practices and any laws that apply to you
          (e.g. GDPR/CCPA) before publishing.
        </p>
      </div>
    </main>
  );
}
