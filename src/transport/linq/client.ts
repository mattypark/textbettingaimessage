import LinqAPIV3 from "@linqapp/sdk";
import { env } from "@/src/config/env";

let client: LinqAPIV3 | undefined;

export function isLinqConfigured(): boolean {
  return Boolean(env().LINQ_API_KEY);
}

export function linqClient(): LinqAPIV3 {
  if (client) return client;
  const apiKey = env().LINQ_API_KEY;
  if (!apiKey) {
    throw new Error("Linq is not configured. Set LINQ_API_KEY.");
  }
  client = new LinqAPIV3({ apiKey });
  return client;
}
