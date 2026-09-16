/** A person on a bet: initial in a sticker-coloured dot plus their first name. */
const DOT = ["bg-sticker-blue", "bg-sticker-green", "bg-sticker-orange", "bg-sticker-red", "bg-sky-blue"];

function tone(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DOT[h % DOT.length];
}

export function Person({ name, muted = false }: { name: string; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[14px] font-semibold ${muted ? "text-sky-ink/50" : "text-sky-ink"}`}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white ${tone(name)}`} aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      {name}
    </span>
  );
}
