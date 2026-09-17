import type { InviteView } from "./store";

/** One line, same everywhere the link is handed out. */
export function inviteLine(invite: InviteView, siteUrl: string): string {
  const left = Math.max(0, invite.maxUses - invite.uses);
  const site = siteUrl.replace(/\/$/, "");
  return `your link (${left} use${left === 1 ? "" : "s"} left): ${site}/join?ref=${invite.code} — send it to whoever's in`;
}
