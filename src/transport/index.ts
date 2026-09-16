import { env } from "@/src/config/env";
import { FakeTransport } from "./fake/fake-transport";
import { LinqTransport } from "./linq/linq-transport";
import { SendblueTransport } from "./sendblue/sendblue-transport";
import type { MessageTransport, TransportName } from "./types";

export type { InboundEvent, MessageTransport, OutboundMessage } from "./types";

const instances = new Map<TransportName, MessageTransport>();

/** Adapter for `TRANSPORT` (or an explicit name). One instance per provider. */
export function createTransport(name: TransportName = env().TRANSPORT): MessageTransport {
  const existing = instances.get(name);
  if (existing) return existing;
  const transport: MessageTransport =
    name === "linq" ? new LinqTransport() : name === "sendblue" ? new SendblueTransport() : new FakeTransport();
  instances.set(name, transport);
  return transport;
}

/** Test hook. */
export function resetTransports(): void {
  instances.clear();
}
