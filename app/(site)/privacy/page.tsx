import { LEGAL_UPDATED, PRIVACY_SECTIONS } from "@/src/onboarding/legal";
import { LegalShell } from "../legal-shell";

export const metadata = { title: "Privacy", description: "What the group-chat betting bot stores and why." };

export default function PrivacyPage() {
  return (
    <LegalShell eyebrow="privacy" title="What mushy keeps" updated={LEGAL_UPDATED} mood="zen">
      {PRIVACY_SECTIONS.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
    </LegalShell>
  );
}
