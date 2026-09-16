/** One wallet number in a soft card. Wraps in a flex row so three fit at 375 without crushing. */
export function StatPill({ label, value, unit, accent = false }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div className={`flex min-w-[9.5rem] flex-1 flex-col rounded-[22px] px-5 py-4 ${accent ? "bg-sky-ink text-white" : "card-soft text-sky-ink"}`}>
      <p className={`font-round text-[12px] font-semibold uppercase tracking-[0.14em] ${accent ? "text-white/60" : "text-sky-ink/55"}`}>{label}</p>
      <p className="tnum mt-1 font-round text-[34px] font-bold leading-none">
        {value}
        {unit && <span className={`ml-1 text-[14px] font-semibold ${accent ? "text-white/60" : "text-sky-ink/50"}`}>{unit}</span>}
      </p>
    </div>
  );
}
