# Provider spike — Stage 0

Goal: prove a user can add the bot line to an **existing** group and we get
usable webhooks. Fill each cell from a real run, not from docs.

| Check | Linq (+1 205 396 8556) | Sendblue |
|---|---|---|
| Group message received via webhook | | |
| `chat id` stable across messages | | |
| Sender identified per message | | |
| Tapback arrives as an event with target message id | | |
| Text-form tapback (`Liked "…"`) seen instead | | |
| Photo URL downloadable within 15 min | | |
| Video (MOV) delivered | | |
| Bot reply lands in the group (not a DM) | | |
| Bubble stays blue for everyone | | |
| `participant.added` / `chat.created` fired on add | | |

## How to run (Linq)

1. `linq login` → `linq doctor` all green.
2. `npm run dev` in one pane, `npm run webhooks:dev` in another.
3. From a personal iPhone: create a group with two friends, then add
   +1 (205) 396-8556 to it. Send "hey mushy", 👍 the reply, a photo, a
   5-second video.
4. Save each raw payload the CLI prints into `tests/fixtures/linq/` (redact
   phone numbers to the fixture set already in use) and fill the table.
