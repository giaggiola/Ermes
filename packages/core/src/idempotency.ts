import { deterministicEventIdPrefixes } from "./events.js";

export function hasDeterministicEventId(eventId: string): boolean {
  return deterministicEventIdPrefixes.some((prefix) => eventId.startsWith(prefix));
}
