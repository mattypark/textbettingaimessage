"use client";

import { useSyncExternalStore } from "react";

const OPTS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
const noop = () => () => {};

/**
 * Server renders the Central-time string (the bot's zone); on the client the
 * visitor's own zone takes over. useSyncExternalStore keeps hydration honest.
 */
export function LocalTime({ iso, initial }: { iso: string; initial: string }) {
  const text = useSyncExternalStore(
    noop,
    () => new Date(iso).toLocaleString("en-US", OPTS),
    () => initial,
  );
  return <time dateTime={iso}>{text}</time>;
}
