import type { Contact, Conversation, Message } from "./types";
import type { Identity } from "./p2p/crypto";
import { ecdhSecret, seal, unseal, topicFor as cryptoTopic } from "./p2p/crypto";
import { LIFETIME_MS } from "./time";
import { sanitizeContact, sanitizeConversation, sanitizeMessage } from "./backup";

/**
 * Multi-device state sync.
 *
 * Every linked device shares the same identity key pair. Two devices can therefore derive a
 * secret that no contact (and no relay) can compute: a static ECDH of the identity's private
 * key with its own public key. We use that secret to seal a compact state snapshot and publish
 * it as a *retained* MQTT message on a topic derived from that same secret, so contacts cannot
 * discover or overwrite the topic. A device that comes online later receives the last snapshot
 * from the broker.
 *
 * Merging is last-writer-wins per record using `syncAt` (falling back to `createdAt`/`addedAt`).
 * Deletions are carried as 72-hour tombstones so a stale copy on another device cannot resurrect
 * a message. Snapshots are capped: very large histories are synced newest-first and marked
 * `partial`, while the encrypted backup remains the way to move a complete archive.
 */

export const SYNC_INFO = "q7-sync-v1";
export const SYNC_VERSION = 1 as const;
/** Stay below the common 256 KB retained-message limit of public brokers. */
export const MAX_WIRE_BYTES = 200_000;
export const MAX_MESSAGES = 5_000;
export const MAX_TOMBSTONES = 5_000;
export const MAX_CONVERSATIONS = 500;
export const MAX_CONTACTS = 500;

export interface SyncTombstone { kind: "msg" | "conv" | "contact"; id: string; at: number }

export interface SyncSnapshot {
  v: typeof SYNC_VERSION;
  device: string;       // random per-install id, never the identity
  at: number;           // snapshot creation time (also orders concurrent snapshots)
  partial?: boolean;    // messages were trimmed to fit the relay limit
  conversations: Conversation[];
  messages: Message[];
  contacts: Contact[];
  tombstones: SyncTombstone[];
}

export interface SyncState {
  conversations: Conversation[];
  messages: Message[];
  contacts: Contact[];
  tombstones: SyncTombstone[];
}

export interface MergeResult { state: SyncState; changed: boolean }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const DEVICE = /^[0-9a-f]{16}$/;
const TOMB = new Set(["msg", "conv", "contact"]);

export const emptyTombstones = (): SyncTombstone[] => [];

const msgVersion = (m: Message) => m.syncAt ?? m.createdAt;
const convVersion = (c: Conversation) => c.syncAt ?? 0;
const contactVersion = (c: Contact) => c.syncAt ?? c.addedAt;

export function sanitizeTombstones(raw: unknown, now: number): SyncTombstone[] {
  if (!Array.isArray(raw)) return [];
  const out: SyncTombstone[] = [];
  for (const t of raw) {
    if (!isObj(t) || typeof t.id !== "string" || !TOMB.has(t.kind as string)) continue;
    if (typeof t.at !== "number" || !Number.isFinite(t.at) || t.at < now - LIFETIME_MS || t.at > now + 300_000) continue;
    if (!/^[\w-]{1,64}$/.test(t.id)) continue;
    out.push({ kind: t.kind as SyncTombstone["kind"], id: t.id, at: t.at });
  }
  return out.sort((a, b) => a.at - b.at).slice(-MAX_TOMBSTONES);
}

/** Validates an incoming decrypted snapshot. Returns null for anything malformed or stale. */
export function sanitizeSnapshot(raw: unknown, now: number): SyncSnapshot | null {
  if (!isObj(raw) || raw.v !== SYNC_VERSION || typeof raw.device !== "string" || !DEVICE.test(raw.device)) return null;
  if (typeof raw.at !== "number" || !Number.isFinite(raw.at) || raw.at < now - 7 * 24 * 3600_000 || raw.at > now + 300_000) return null;
  if (!Array.isArray(raw.conversations) || !Array.isArray(raw.messages) || !Array.isArray(raw.contacts)) return null;
  if (raw.conversations.length > MAX_CONVERSATIONS || raw.messages.length > MAX_MESSAGES || raw.contacts.length > MAX_CONTACTS) return null;

  const conversations: Conversation[] = [];
  for (const c of raw.conversations) {
    if (isObj(c) && c.mode === "local") continue; // Local Mode is documented as this-browser-only; never sync it.
    const x = sanitizeConversation(c); if (x) conversations.push(x);
  }
  const ids = new Set(conversations.map((c) => c.id));
  const messages: Message[] = [];
  for (const m of raw.messages) { const x = sanitizeMessage(m, now, ids); if (x) messages.push(x); }
  const contacts: Contact[] = [];
  for (const c of raw.contacts) { const x = sanitizeContact(c); if (x) contacts.push(x); }

  return {
    v: SYNC_VERSION, device: raw.device, at: raw.at, partial: raw.partial === true,
    conversations, messages, contacts, tombstones: sanitizeTombstones(raw.tombstones, now),
  };
}

/**
 * Merges an incoming snapshot into the local state. Pure: the caller writes the result.
 * Local and remote tombstones are both applied, so a delete seen on either device wins.
 */
export function mergeSync(local: SyncState, incoming: SyncSnapshot, now: number): MergeResult {
  let changed = false;

  const convs = new Map(local.conversations.map((c) => [c.id, c] as const));
  for (const c of incoming.conversations) {
    const cur = convs.get(c.id);
    if (!cur || convVersion(c) > convVersion(cur)) { convs.set(c.id, c); changed = true; }
  }

  const msgs = new Map(local.messages.map((m) => [m.id, m] as const));
  for (const m of incoming.messages) {
    if (m.expiresAt <= now) continue;
    const cur = msgs.get(m.id);
    if (!cur || msgVersion(m) > msgVersion(cur)) { msgs.set(m.id, m); changed = true; }
  }

  const contacts = new Map(local.contacts.map((c) => [c.id, c] as const));
  for (const c of incoming.contacts) {
    const cur = contacts.get(c.id);
    if (!cur || contactVersion(c) > contactVersion(cur)) { contacts.set(c.id, c); changed = true; }
  }

  const tombs = new Map<string, SyncTombstone>();
  for (const t of [...local.tombstones, ...incoming.tombstones]) {
    if (t.at < now - LIFETIME_MS) continue;
    const key = `${t.kind}:${t.id}`;
    const cur = tombs.get(key);
    if (!cur || t.at > cur.at) { tombs.set(key, t); if (!local.tombstones.some((x) => x.kind === t.kind && x.id === t.id && x.at === t.at)) changed = true; }
  }

  for (const t of tombs.values()) {
    if (t.kind === "msg") {
      const cur = msgs.get(t.id);
      if (cur && t.at >= msgVersion(cur)) { msgs.delete(t.id); changed = true; }
    } else if (t.kind === "conv") {
      const cur = convs.get(t.id);
      if (cur && t.at >= convVersion(cur)) {
        convs.delete(t.id); changed = true;
        for (const [id, m] of msgs) if (m.conversationId === t.id) msgs.delete(id);
      }
    } else {
      const cur = contacts.get(t.id);
      if (cur && t.at >= contactVersion(cur)) { contacts.delete(t.id); changed = true; }
    }
  }

  const state: SyncState = {
    conversations: [...convs.values()].sort((a, b) => a.id.localeCompare(b.id)),
    messages: [...msgs.values()].filter((m) => m.expiresAt > now).sort((a, b) => a.createdAt - b.createdAt),
    contacts: [...contacts.values()].sort((a, b) => a.id.localeCompare(b.id)),
    tombstones: [...tombs.values()].sort((a, b) => a.at - b.at).slice(-MAX_TOMBSTONES),
  };
  return { state, changed };
}

/** Topic derived from the self-ECDH secret, not the public identity. Contacts cannot compute it. */
export function syncTopicFromKey(key: string): Promise<string> {
  return cryptoTopic("s", key);
}

/** Self-ECDH: only devices holding this identity's private ECDH key can derive it. */
export async function syncKey(id: Identity): Promise<string | null> {
  if (!id.ecdh || !id.spk) return null;
  return ecdhSecret(id, id.spk);
}

export async function syncTopic(id: Identity): Promise<string | null> {
  const key = await syncKey(id);
  return key ? syncTopicFromKey(key) : null;
}

export async function encodeSnapshot(key: string, snapshot: SyncSnapshot): Promise<Uint8Array> {
  return seal(key, snapshot, SYNC_INFO);
}

export async function decodeSnapshot(key: string, bytes: Uint8Array): Promise<unknown | null> {
  return unseal(key, bytes, SYNC_INFO);
}

/**
 * Seals a snapshot and trims the oldest messages until it fits the relay budget.
 * The returned `partial` flag is stored inside the snapshot so other devices know
 * that an older tail may still exist locally.
 */
export async function buildWireSnapshot(key: string, device: string, state: SyncState, now: number): Promise<{ bytes: Uint8Array; snapshot: SyncSnapshot; partial: boolean }> {
  let keep = Math.min(state.messages.length, MAX_MESSAGES);
  let tombs = state.tombstones.slice(-MAX_TOMBSTONES);
  let conversations = [...state.conversations].sort((a, b) => (b.syncAt ?? 0) - (a.syncAt ?? 0)).slice(0, MAX_CONVERSATIONS);
  let contacts = state.contacts.slice(0, MAX_CONTACTS);
  let photosDropped = false;
  let partial = state.conversations.length > conversations.length || state.contacts.length > contacts.length || state.messages.length > keep;
  for (;;) {
    const convIds = new Set(conversations.map((c) => c.id));
    const sorted = state.messages.filter((m) => m.expiresAt > now && convIds.has(m.conversationId)).sort((a, b) => b.createdAt - a.createdAt);
    const chosen = sorted.slice(0, Math.min(keep, MAX_MESSAGES));
    if (chosen.length < sorted.length) partial = true;
    const snapshot: SyncSnapshot = {
      v: SYNC_VERSION, device, at: now, ...(partial ? { partial: true } : {}),
      conversations,
      messages: [...chosen].sort((a, b) => a.createdAt - b.createdAt),
      contacts,
      tombstones: tombs,
    };
    const bytes = await encodeSnapshot(key, snapshot);
    if (bytes.length <= MAX_WIRE_BYTES) return { bytes, snapshot, partial };

    // Over budget: shed the least important data first, keeping the snapshot small enough
    // for public brokers. Every reduction is reflected in `partial`.
    partial = true;
    if (keep > 0) { keep = Math.floor(keep / 2); continue; }
    if (tombs.length > 0) { tombs = tombs.slice(0, Math.floor(tombs.length / 2)); continue; }
    if (!photosDropped && contacts.some((c) => !!c.photo)) {
      contacts = contacts.map((c) => (c.photo ? { ...c, photo: undefined } : c));
      photosDropped = true; continue;
    }
    if (contacts.length > 0) { contacts = contacts.slice(0, Math.floor(contacts.length / 2)); continue; }
    if (conversations.length > 0) { conversations = conversations.slice(0, Math.floor(conversations.length / 2)); continue; }
    return { bytes, snapshot, partial: true };
  }
}

export function addTombstone(list: SyncTombstone[], kind: SyncTombstone["kind"], id: string, at = Date.now()): SyncTombstone[] {
  const next = list.filter((t) => !(t.kind === kind && t.id === id));
  next.push({ kind, id, at });
  return next.sort((a, b) => a.at - b.at).slice(-MAX_TOMBSTONES);
}
