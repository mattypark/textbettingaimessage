import { LegalShell } from "../legal-shell";

export const metadata = { title: "Privacy", description: "What the group-chat betting bot stores and why." };

export default function PrivacyPage() {
  return (
    <LegalShell eyebrow="privacy" title="What mushy keeps" updated="September 16, 2026" mood="zen">
      <h2>what we store</h2>
      <ul>
        <li>Your phone number and the name you tell the bot to call you.</li>
        <li>Messages sent in chats the bot is in, so it can act on bets and answer questions.</li>
        <li>Photos and videos sent as proof, so the judge can evaluate them and disputes can be reviewed.</li>
        <li>Bets, points, honor score, and the audit trail of every change.</li>
      </ul>
      <h2>what we don&apos;t do</h2>
      <ul>
        <li>Sell or share your data with advertisers.</li>
        <li>Hold money, card details, or bank information.</li>
        <li>Contact people who have not added the bot to a chat.</li>
      </ul>
      <h2>cookies</h2>
      <p>
        The website sets only the cookies needed to keep you signed in to your account. There are no advertising or analytics cookies, so there is nothing to
        consent to and no banner to dismiss.
      </p>
      <h2>processors</h2>
      <p>
        Messages are delivered through an iMessage API provider, stored on Supabase, and proof is evaluated by Anthropic&apos;s Claude. Each processes data
        only to provide the service.
      </p>
      <h2>your choices</h2>
      <p>
        Remove the bot from a chat to stop new messages being stored. Text the bot &quot;delete my data&quot; or email us and we will delete your account and
        media within 30 days, except records we must keep to resolve open disputes.
      </p>
    </LegalShell>
  );
}
