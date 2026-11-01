export type Mode = "local" | "p2p" | "group";
export type View = "chats" | "contacts" | "connect" | "settings" | "mentions" | "starred" | "spaces" | "devices";
export type PreviewPolicy = "ask" | "block" | "allow";
export type Presence = "online" | "dnd" | "away";
export type SettingsSection = "general" | "notifications" | "media" | "look" | "a11y" | "restrict" | "privacy" | "lock";

export interface LinkedDevice {
  id: string;
  name: string;
  addedAt: number;
  isCurrent?: boolean;
}


/** A user-made group of contacts ("Alan") — local organisation, no network. */
export interface Space { id: string; name: string; hue: number; members: string[] }

export interface LinkMeta { url: string; title?: string; description?: string; isImage?: boolean }

export interface Conversation {
  id: string; mode: Mode; title: string;
  pinned: boolean; muted: boolean; archived: boolean; unread: number;
  starred?: boolean; // collected under the "Yıldızlı" rail shortcut
  contactId?: string; // set for p2p conversations
  wall?: string; // chat wallpaper (gradient id)
  members?: string[]; // group: member fingerprints, mine included
  hue?: number; // group avatar hue
  names?: Record<string, string>; // group: roster names for members who are not my contacts
  left?: boolean; // group: I left — kept only until the next purge
  /** Last local or synced mutation; used by multi-device last-writer-wins merging. */
  syncAt?: number;
}
export type Attachment =
  | { t: "file"; kind: "image" | "document" | "voice"; name: string; mime: string; size: number; dur?: number }
  | { t: "gif"; url: string; w: number; h: number }
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
  from?: string; // group: sender member id (my sends carry my fingerprint)
  status?: "queued" | "sent" | "delivered" | "seen"; // p2p/group outgoing only
  reactions?: Record<string, string[]>; // emoji -> member ids
  editedAt?: number; // last edit time, shown as a marker
  /** Last local or synced mutation; used by multi-device last-writer-wins merging. */
  syncAt?: number;
}
export interface Contact { id: string; pub: string; name: string; code: string; addedAt: number; verified: boolean; photo?: string; renamed?: boolean; ek?: string; blocked?: boolean; syncAt?: number }
export interface Settings {
  theme: "dark" | "light"; previews: PreviewPolicy; accent: string;
  presence: Presence; // capsule status: online / do-not-disturb / away
  notify?: boolean; notifySound?: boolean; notifyPreview?: boolean;
  reduceMotion?: boolean; textScale?: "s" | "m" | "l";
}
