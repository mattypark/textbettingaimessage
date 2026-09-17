import { describe, expect, it } from "vitest";
import { buildVCard } from "@/src/transport/linq/contact-card";

describe("buildVCard", () => {
  it("names the line, folds the photo at 75 octets, and ends cleanly", () => {
    const card = buildVCard({ name: "Mushy", phone: "+12053968556", avatarPng: Buffer.alloc(200, 1) });
    expect(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(card).toContain("FN:Mushy\r\n");
    expect(card).toContain("TEL;TYPE=CELL,VOICE:+12053968556\r\n");
    expect(card).toContain("PHOTO;ENCODING=b;TYPE=PNG:");
    for (const line of card.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(card.endsWith("END:VCARD\r\n")).toBe(true);
  });

  it("skips the photo when the avatar is missing", () => {
    expect(buildVCard({ name: "Mushy", phone: "+1", avatarPng: null })).not.toContain("PHOTO");
  });
});
