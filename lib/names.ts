import type { Conversation } from "./types";

/** Member display name inside a space: contact name first, roster name second, else "unknown". */
export function memberName(conv: Conversation, fp: string | undefined, contacts: { id: string; name: string }[], unknownLabel: string): string {
  if (!fp) return unknownLabel;
  return contacts.find((x) => x.id === fp)?.name ?? conv.names?.[fp] ?? unknownLabel;
}
