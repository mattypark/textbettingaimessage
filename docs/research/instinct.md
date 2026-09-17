# Instinct — how it works, what Mushy borrows (research, 2026-09-17)

Compiled by a research agent from public sources; each claim links its source. "Inferred" is marked.

## TL;DR

1. **Instinct** = Spear Street Technology (SF), founder Noah Shinn (23, ex-Sierra, Reflexion author); $350M total, $2.5B Series B (Aug 2026, Index + Benchmark), reportedly seeking $1B at $10B; 100K+ users; free, invite-only "while we scale compute".
2. **iMessage path:** Instinct runs its **own line** you text; provider not disclosed. Separately it reads *your* messages via an **Apple ID relay** (Apple ID + password + 2FA) or a **Mac desktop app** (beta). No Messages for Business.
3. **Proactive by design** ("calling or texting you first"): triggers are inbox/calendar cross-references, geofenced arrivals, delivery cutoffs; restraint is a scored dimension; the one hard rule seen is "escalate rather than act".
4. **Group chats are not a shipped feature**; multi-person = agent-to-agent "Trusted Person network" plus per-user email at mail.instinct.com.
5. Memory is persistent per user on a "persistent computer"; onboarding is phone + OTP + invite token + timezone; each member gets a reusable invite link they request *by texting Instinct*.

## 1. Company facts

- Founder/company: Noah Shinn, Spear Street Technology Inc. d/b/a Instinct, San Francisco ([TechCrunch](https://techcrunch.com/2026/08/26/viral-ai-startup-instinct-has-raised-350-million-at-a-2-5-billion-valuation/), [terms](https://instinct.com/terms)). Shinn: first author of Reflexion (NeurIPS 2023), ex-Sierra ([KuCoin](https://www.kucoin.com/news/flash/23-year-old-noah-shinn-instinct-founder-previously-worked-on-reflexion-and-bench)).
- Funding: $100M seed/A → $250M Series B at $2.5B, Aug 26 2026 ([Forbes](https://www.forbes.com/sites/iainmartin/2026/08/26/vcs-are-so-obsessed-with-this-ai-assistant-that-its-valuation-jumped-fivefold-in-weeks/)); talks for $1B at $10B ([PYMNTS](https://www.pymnts.com/startups/2026/instinct-ai-assistant-targets-10-billion-dollar-valuation/)).
- Launch: founder thread Aug 2026 ([X](https://x.com/noahrshinn/status/2092691344456351744)); "four months old" at Series B ([WOWTALE](https://en.wowtale.net/2026/08/29/234921/)).
- Users: "passed 100,000" (Sep 15) ([CellCog](https://cellcog.ai/blog/what-is-instinct-ai/)). Pricing: free; third-party "$200–500/mo" figures are speculation ([Spinnable](https://www.spinnable.ai/blog/what-is-instinct-ai-guide)).

## 2. How it gets onto iMessage

Stated (app bundle strings at `app.instinct.com/assets/app-*.js`):
- "choose your Instinct contact — the number you text Instinct on" → one Instinct-owned line per contact; nothing suggests per-user numbers. Provider unnamed; not in Linq's public customer list ([Linq](https://linqapp.com/blog/best-imessage-api)).
- Their line can address Apple-ID email handles → a real iMessage identity, not SMS/Messages for Business (**inferred**). Poke is the only MfB-approved agent ([TechCrunch](https://techcrunch.com/2026/06/04/apple-approves-poke-as-the-first-ai-agent-on-its-messages-for-business-platform/)).
- Reading *your* texts: `/imessage-relay/connect` takes Apple ID, password, trusted-device code → server-side Apple ID relay. Alternative: Mac app, "Read recent chats and send iMessages through your Mac" (beta).
- Also present: `/dev/imessage-mock/*`, WhatsApp linked-number OTP, Cloudflare Turnstile, Stripe Link, 1Password.
- DNS: instinct.com on Vercel; app.instinct.com behind Cloudflare; `mail.instinct.com` MX → AWS SES; TXT carries `anthropic-domain-verification` (**inferred:** an Anthropic org relationship).
- In-thread: read receipts, emoji reactions, threaded replies, `/new`, confetti, GamePigeon ([mager.co](https://www.mager.co/blog/2026-09-12-instinct/), [Stork](https://www.stork.ai/blog/instinct-ai-your-life-on-autopilot)).

## 3. Proactive texting

- Intent: "following up on threads you dropped, calling or texting you first" ([instinct.com](https://instinct.com/)).
- Observed triggers: inbox+calendar cross-references, "checked in unprompted when the window opened", unprompted completion reports ([Assistant Benchmark](https://assistantbenchmark.com/agents/instinct)); night-before schedule, day-2 trip inference ([usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/)); geofenced arrivals/departures ([X](https://x.com/noahrshinn/status/2096307855372734963)); delivery-cutoff reminders ([Stork](https://www.stork.ai/blog/instinct-ai-your-life-on-autopilot)).
- Restraint: scored 8/10; "left it unsent and escalated instead of acting". Failure mode: kept texting about tax emails after Google was disconnected ([usecarly](https://www.usecarly.com/blog/instinct-ai/)). Timezone captured at sign-up.
- Group chats: unverified by reviewers ([mager.co](https://www.mager.co/blog/2026-09-12-instinct/)); no mention gate or attention window documented. Contact shows as "Instinct".

## 4. Memory, onboarding, invites

- Memory 9/10; cross-references past emails; data "indexed and stored rather than fetched on the fly" ([artificiallyintimidating](https://artificiallyintimidating.com/p/instinct-ai-wrote-this-deep-dive)).
- Onboarding: invite link → phone OTP (`phoneNumber, code, bindingToken, timezone, inviteToken`) → straight into iMessage; accounts connected later via links Instinct texts you.
- Invites: "Ask Instinct at any time for your private invite link"; reusable; "Invites count when someone joins"; pausable; "Welcome, {name} invited you to Instinct" ([Whatfinger](https://startup.whatfinger.com/2026/09/15/inside-instinct-ai-the-10b-invite-only-agent/)).

## 5. Backend hints

- "Persistent machine… browser access and cached credentials" ([Vellum](https://www.vellum.ai/blog/official-instinct-breakdown)); a top-level agent that monitors and dispatches ([usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/)); off-the-shelf models plus fine-tuning ([sources.news](https://sources.news/p/two-new-ai-assistants-have-silicon)).
- Latency: median 20 s, p90 4 m 42 s ([Assistant Benchmark](https://assistantbenchmark.com/agents/instinct)). Open-source clone OpenInstinct uses Linq + Vercel + Neon ([GitHub](https://github.com/Merit-Systems/OpenInstinct)).

## What Mushy borrows

| # | Instinct | Mushy | Module | Risk | Status |
|---|---|---|---|---|---|
| 1 | "Ask Instinct for your invite link" in-thread | "hey mushy invite" / `!invite` → your link | agent tool + access store | link leaks; 3 uses each | **built 2026-09-17** |
| 2 | Checks in "when the window opened" | one "proof due in ~2h" nudge per locked bet | cron tick | spam; once per bet | **built 2026-09-17** |
| 3 | Escalate, don't act | judge under threshold → "need a cleaner shot" | judge (already) | nag loops | already |
| 4 | Night-before summary | nightly open-bets digest per group | cron tick + tz | muted groups; opt-out | later |
| 5 | Reactions + threaded replies | tapback on accepts, reply-in-thread on proofs | transport | shared tier may lack | later |
| 6 | `/new`, STOP/START | "mushy quiet" / "mushy back" per chat | inbound gate + chats column | must persist | later |
| 7 | Dev iMessage mock | `WEB_DEMO=1` + cassettes | existing | — | already |
| 8 | "X invited you" welcome | first message names the inviter | onboarding | — | later |

**Does not fit Mushy:** Apple ID relay / Mac agent reading users' messages (privacy, TOS); per-user numbers (shared Linq line); persistent browser per user; agent-to-agent network.
