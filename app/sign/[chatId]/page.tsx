import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { tickDeps } from "@/src/inbound";
import { LEGAL_UPDATED, PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/src/onboarding/legal";
import { loadSignPage, signFromWeb } from "@/src/onboarding/sign";
import { TERMS_SUMMARY } from "@/src/onboarding/terms";
import { tryRegisterContact } from "@/src/transport/linq/contacts";

/**
 * The sign sheet Mushy drops in a chat on first contact. Everyone types
 * their name and number, reads both policies right here, and signs.
 * Server-rendered; the chat id in the URL is the only key.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ chatId: string }>; searchParams: Promise<{ done?: string; error?: string }> };

export const metadata: Metadata = { title: "Sign in to Mushy", description: "Everyone in the chat signs once." };

export default async function SignPage({ params, searchParams }: Params) {
  const { chatId } = await params;
  const { done, error } = await searchParams;
  const { store, outbox } = tickDeps();
  const page = await loadSignPage(store, chatId);
  if (!page) notFound();

  async function sign(formData: FormData) {
    "use server";
    const h = await headers();
    const result = await signFromWeb(store, outbox, chatId, {
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      signature: String(formData.get("signature") ?? ""),
      agreeTerms: formData.get("agreeTerms") === "on",
      agreePrivacy: formData.get("agreePrivacy") === "on",
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    }, (phone) => tryRegisterContact(phone, (line) => console.info(`[sign] ${line}`)));
    redirect(result.ok ? `/sign/${chatId}?done=${encodeURIComponent(result.name)}` : `/sign/${chatId}?error=${encodeURIComponent(result.error)}`);
  }

  const signedCount = page.members.filter((m) => m.signed).length;

  return (
    <main className="sheet">
      <style>{css}</style>
      <div className="handle" aria-hidden />
      <p className="eyebrow">before we bet</p>
      <h1 className="title">everyone signs once</h1>
      <p className="sub">{signedCount}/{page.members.length} in this chat have signed</p>
      <ul className="people">
        {page.members.map((m) => (
          <li key={m.name} className={m.signed ? "done" : ""}>
            <span>{m.name}</span>
            <span className="state">{m.signed ? "signed" : "not yet"}</span>
          </li>
        ))}
      </ul>

      {done ? (
        <div className="okbox">
          <p className="okmark" aria-hidden>✍️</p>
          <p className="oktext">{done}, you&apos;re in — head back to the chat</p>
        </div>
      ) : (
        <form action={sign} className="form">
          {error && <p className="error" role="alert">{error}</p>}
          <label className="field">
            <span>your name</span>
            <input name="fullName" autoComplete="name" required minLength={2} maxLength={60} placeholder="Matt Park" />
          </label>
          <label className="field">
            <span>your number</span>
            <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="(713) 555-0100" />
          </label>

          <details className="legal">
            <summary>terms (v{page.termsVersion}) — read these</summary>
            <ol>
              {TERMS_SUMMARY.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
            {TERMS_SECTIONS.map((s) => (
              <section key={s.heading}>
                <h3>{s.heading}</h3>
                {s.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </section>
            ))}
            <p className="updated">updated {LEGAL_UPDATED}</p>
          </details>
          <details className="legal">
            <summary>privacy policy — read this too</summary>
            {PRIVACY_SECTIONS.map((s) => (
              <section key={s.heading}>
                <h3>{s.heading}</h3>
                {s.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </section>
            ))}
            <p className="updated">updated {LEGAL_UPDATED}</p>
          </details>

          <label className="check">
            <input type="checkbox" name="agreeTerms" required />
            <span>i read the terms and i agree — points aren&apos;t money, mushy never holds money, results are best-effort, and i&apos;m 18+</span>
          </label>
          <label className="check">
            <input type="checkbox" name="agreePrivacy" required />
            <span>i read the privacy policy</span>
          </label>

          <label className="field sig">
            <span>sign with your name</span>
            <input name="signature" required minLength={2} maxLength={60} placeholder="Matt Park" autoComplete="off" />
          </label>
          <button type="submit" className="btn primary">Sign</button>
          <p className="fine">Typing your name here is your electronic signature. We record the name, number, time, and address it came from.</p>
        </form>
      )}
    </main>
  );
}

const css = `
  .sheet { max-width: 440px; margin: 0 auto; padding: 14px 22px 48px; font-family: -apple-system, "SF Pro Text", system-ui, sans-serif; color: #111; background: #fff; min-height: 100dvh; }
  @media (prefers-color-scheme: dark) { .sheet { background: #111; color: #f2f2f2; } .people li { border-color: #2a2a2a; } .field input { background: #1c1c1e; color: #f2f2f2; border-color: #2a2a2a; } .legal { background: #1c1c1e; } .okbox { background: #1c1c1e; } }
  .handle { width: 36px; height: 5px; border-radius: 3px; background: #c7c7cc; margin: 0 auto 22px; }
  .eyebrow { font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #8e8e93; margin: 0 0 6px; }
  .title { font-size: 34px; font-weight: 700; letter-spacing: -.02em; margin: 0; }
  .sub { color: #8e8e93; margin: 6px 0 18px; font-size: 17px; }
  .people { list-style: none; padding: 0; margin: 0 0 22px; }
  .people li { display: flex; justify-content: space-between; padding: 12px 0; border-top: 1px solid #e5e5ea; font-size: 17px; }
  .people li:last-child { border-bottom: 1px solid #e5e5ea; }
  .people .state { font-size: 13px; font-weight: 600; text-transform: uppercase; color: #ff9f0a; }
  .people li.done .state { color: #34c759; }
  .form { display: grid; gap: 14px; }
  .field { display: grid; gap: 6px; font-size: 13px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: .04em; }
  .field input { font-size: 17px; padding: 14px; border-radius: 14px; border: 1px solid #e5e5ea; background: #f9f9fb; color: #111; font-family: inherit; }
  .sig input { font-family: "Snell Roundhand", "Apple Chancery", cursive; font-size: 26px; }
  .legal { background: #f2f2f7; border-radius: 14px; padding: 12px 14px; font-size: 15px; line-height: 1.5; }
  .legal summary { font-weight: 600; cursor: pointer; }
  .legal h3 { font-size: 15px; margin: 14px 0 4px; }
  .legal p, .legal li { margin: 0 0 8px; }
  .updated { color: #8e8e93; font-size: 13px; }
  .check { display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.4; }
  .check input { width: 22px; height: 22px; flex: none; margin-top: 1px; }
  .btn { display: block; text-align: center; padding: 15px; border-radius: 14px; font-weight: 600; font-size: 17px; border: 0; font-family: inherit; }
  .btn.primary { background: #0a84ff; color: #fff; }
  .error { background: #ffebe9; color: #a3261a; padding: 10px 12px; border-radius: 10px; font-size: 15px; margin: 0; }
  .okbox { background: #f2f2f7; border-radius: 16px; padding: 28px; text-align: center; }
  .okmark { font-size: 44px; margin: 0 0 8px; }
  .oktext { font-size: 17px; margin: 0; }
  .fine { font-size: 13px; color: #8e8e93; margin: 0; }
`;
