import type { ProofView } from "@/src/web/data/types";
import { when } from "@/src/web/format";
import { LocalTime } from "../../_ui/local-time";

/** Every proof on the bet as a tile. Two across at 375, three from sm. */
export function ProofGrid({ proofs }: { proofs: ProofView[] }) {
  if (proofs.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-[20px] font-bold">proof</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {proofs.map((p) => (
          <li key={p.id} className="card-soft overflow-hidden p-2 text-[12.5px]">
            <a href={p.mediaUrl} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden rounded-[16px] bg-sky-ink/5" aria-label={`open proof from ${p.submitterName}`}>
              {p.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.mediaUrl} alt={`proof from ${p.submitterName}`} width={400} height={400} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full items-center justify-center">
                  <span className="chip bg-sky-ink text-white">▶ video</span>
                </span>
              )}
            </a>
            <p className="mt-2 px-1 text-sky-ink/70">
              <span className="font-semibold text-sky-ink">{p.submitterName}</span> · <LocalTime iso={p.receivedAt} initial={when(p.receivedAt)} /> · {p.status.replace("_", " ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
