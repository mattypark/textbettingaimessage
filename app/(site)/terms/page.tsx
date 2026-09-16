import { TERMS_SUMMARY, TERMS_VERSION } from "@/src/onboarding/terms";

export const metadata = { title: "Terms", description: "The rules of the group-chat betting bot." };

/** Same source as the iMessage intro and the explain_terms tool. */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 leading-relaxed">
      <h1 className="text-3xl font-semibold">Terms (v{TERMS_VERSION})</h1>
      <p className="mt-4 text-neutral-600">Last updated September 16, 2026.</p>
      <ol className="mt-8 list-decimal space-y-4 pl-6">
        {TERMS_SUMMARY.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold">The longer version</h2>
        <p>
          This service keeps score of friendly bets between people who already know each other. Points are a game
          mechanic: they are not money, not a currency, not redeemable for anything, and cannot be purchased. Social
          stakes are promises between friends that we do not enforce.
        </p>
        <p>
          Verdicts are produced by an automated judge from the proof you send and the criteria locked when the bet
          was created. Disputes are resolved by a second automated pass or by the referee you named. The service may
          void any bet and return all points at its discretion.
        </p>
        <p>
          You must be 18 or older. Do not use the service for anything illegal where you live, and do not bet on
          people who are not in the conversation. We may remove the bot from a chat at any time.
        </p>
        <p>The service is provided as-is, without warranty, and our liability to you is limited to the fullest extent the law allows.</p>
      </section>
    </main>
  );
}
