Continue the textbettingaimessage backend lane. Read CLAUDE.md, docs/SESSION-backend.md, docs/DEPLOY.md, docs/legal-status.md first.

State: stages 1–11 are code-complete with 256 passing unit tests and 8 Postgres integration tests. Nothing has run against the live Linq line yet.

Do, in order:
1. Stage 0 spike (needs Matthew): `linq login`, `npm run dev` + `npm run webhooks:dev`, add +1 (205) 396-8556 to a real 3-person group from a phone, send text / 👍 / photo / 5s video. Save each raw payload (phones redacted) into tests/fixtures/linq/ and fill docs/providers.md.
2. Fix whatever the real payloads disagree with in src/transport/linq/parse.ts (chat.created participants shape is a guess).
3. With ANTHROPIC_API_KEY in .env.local: `npm run agent:smoke "bookie 20 says I make this shot by friday, jake you in?"` and iterate the system prompt / tool descriptions until the card is right on 5 varied phrasings.
4. Record an e2e cassette (FakeModel) for create-and-lock and proof-and-verdict scenarios in tests/e2e.

Never wire a cash rail. Commit as Matthew Park after each real unit; do not push.
