export const metadata = { title: "Privacy", description: "What the group-chat betting bot stores and why." };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 leading-relaxed">
      <h1 className="text-3xl font-semibold">Privacy</h1>
      <p className="mt-4 text-neutral-600">Last updated September 16, 2026.</p>
      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">What we store</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Your phone number and the name you tell the bot to call you.</li>
          <li>Messages sent in chats the bot is in, so it can act on bets and answer questions.</li>
          <li>Photos and videos sent as proof, so the judge can evaluate them and disputes can be reviewed.</li>
          <li>Bets, points, honor score, and the audit trail of every change.</li>
        </ul>
        <h2 className="text-xl font-semibold">What we don&apos;t do</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Sell or share your data with advertisers.</li>
          <li>Hold money, card details, or bank information.</li>
          <li>Contact people who have not added the bot to a chat.</li>
        </ul>
        <h2 className="text-xl font-semibold">Processors</h2>
        <p>
          Messages are delivered through an iMessage API provider, stored on Supabase, and proof is evaluated by
          Anthropic&apos;s Claude. Each processes data only to provide the service.
        </p>
        <h2 className="text-xl font-semibold">Your choices</h2>
        <p>
          Remove the bot from a chat to stop new messages being stored. Text the bot &quot;delete my data&quot; or
          email us and we will delete your account and media within 30 days, except records we must keep to resolve
          open disputes.
        </p>
      </section>
    </main>
  );
}
