import { LEGAL_UPDATED, TERMS_SECTIONS } from "@/src/onboarding/legal";
import { TERMS_SUMMARY, TERMS_VERSION } from "@/src/onboarding/terms";
import { LegalShell } from "../legal-shell";

export const metadata = { title: "Terms", description: "The rules of the group-chat betting bot." };

/** Same source as the iMessage intro, the explain_terms tool, and the sign sheet. */
export default function TermsPage() {
  return (
    <LegalShell eyebrow="the rules" title={`Terms (v${TERMS_VERSION})`} updated={LEGAL_UPDATED} mood="ref">
      <h2>the short version</h2>
      <ol>
        {TERMS_SUMMARY.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      {TERMS_SECTIONS.map((section) => (
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
