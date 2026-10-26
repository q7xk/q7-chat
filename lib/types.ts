export type Mode = "local" | "p2p";
export type View = "chats" | "contacts" | "connect" | "calls" | "settings";
export type PreviewPolicy = "ask" | "block" | "allow";

export interface LinkMeta { url: string; title?: string; description?: string; isImage?: boolean }

export interface Conversation {
  id: string; mode: Mode; title: string;
  pinned: boolean; muted: boolean; archived: boolean; unread: number;
  contactId?: string; // set for p2p conversations
}
export type Attachment =
  | { t: "file"; kind: "image" | "document"; name: string; mime: string; size: number }
  | { t: "location"; lat: number; lon: number }
  | { t: "contact"; name: string; code: string; pub: string }
  | { t: "poll"; q: string; opts: string[]; multi: boolean; votes: Record<string, number[]> }
  | { t: "event"; title: string; start: number; place?: string; note?: string };

export interface Message {
  id: string; conversationId: string; body: string;
  createdAt: number; expiresAt: number; // epoch ms (UTC); expiresAt = createdAt + 72h
  link?: LinkMeta; replyToId?: string;
  att?: Attachment; // file bytes live in the local_blobs store under the message id
  direction?: "in" | "out"; // missing means out
  status?: "queued" | "sent" | "delivered"; // p2p outgoing only
}
export interface Contact { id: string; pub: string; name: string; code: string; addedAt: number; verified: boolean; photo?: string; renamed?: boolean; ek?: string }
export interface Settings { theme: "dark" | "light"; previews: PreviewPolicy }
