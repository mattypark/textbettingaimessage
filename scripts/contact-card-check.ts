/**
 * Uploads Mushy's vCard to Linq and prints the attachment id — proves the
 * contact-card path without sending a message.
 *   npm run contact-card:check
 */
import { botNames, env } from "@/src/config/env";
import { contactCardAttachmentId } from "@/src/transport/linq/contact-card";

async function main() {
  const name = botNames()[0] ?? "mushy";
  const id = await contactCardAttachmentId(name.charAt(0).toUpperCase() + name.slice(1), env().LINQ_FROM_NUMBER ?? "");
  console.log(`contact card uploaded: attachment ${id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
