import type { Attachment, Contact, Conversation, LinkedDevice, Message, Space } from "./types";
import type { StoredIdentity } from "./p2p/crypto";
import { fromB64, hex, seal, toB64, unseal, utf8 } from "./p2p/crypto";
import type { Vault } from "./vault";
import { LIFETIME_MS } from "./time";
import { isDirectImageUrl, parseHttpsUrl } from "./links";
import * as db from "./db";

/**
 * Encrypted, password-protected backup.
 *
 * The whole payload — identity (or the sealed vault copy), conversations, contacts,
 * settings and local metadata — is compressed, then sealed with AES-256-GCM under a
 * key derived with PBKDF2-SHA256. No plaintext ever reaches the file, and the KDF
 * parameters are stored in the header so old backups stay readable if the cost is raised.
 *
 * Attachments (image/document/voice blobs) are intentionally NOT included: they can be
 * large and are still subject to the 72-hour lifetime. Message metadata that references
 * an attachment is kept, so the UI can show that an attachment existed.
 */

export const BACKUP_APP = "q7-message" as const;
export const BACKUP_FORMAT = 2 as const;
export const BACKUP_KIND = "backup" as const;
export const BACKUP_EXT = "q7b";
/** OWASP 2023+ guidance for PBKDF2-HMAC-SHA256. Stored in the header, so it can be raised later. */
export const DEFAULT_ITERATIONS = 600_000;
export const MIN_PASSWORD = 8;
const MAX_FILE = 25_000_000;

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: typeof BACKUP_FORMAT;
  kind: typeof BACKUP_KIND;
  kdf: { alg: "PBKDF2-SHA256"; iterations: number; salt: string };
  data: string; // base64url(iv || AES-GCM ciphertext)
}

export interface BackupPayload {
  v: 1;
  exportedAt: number;
  identity?: StoredIdentity;
  vault?: { v: Vault; sealedId: string };
  conversations: Conversation[];
  messages: Message[];
  contacts: Contact[];
  settings?: unknown;
  spaces?: Space[];
  linkedDevices?: LinkedDevice[];
  /** Attachments are not in the file; the UI tells the user. */
  blobsIncluded: false;
  skipped?: number;
}

export interface BackupSummary { conversations: number; messages: number; contacts: number; skipped: number; hasIdentity: boolean }

const ITER_MIN = 100_000;
const ITER_MAX = 2_000_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ID = /^[\w-]{1,64}$/;

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const base = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, base, 256);
  return hex(new Uint8Array(bits));
}

async function gzip(text: string): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return utf8(text);
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === "undefined") return new TextDecoder().decode(data);
  try {
    const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  } catch { throw new Error("err.backup.corrupt"); }
}

/* ---------- export ---------- */

export interface ExportOptions { now?: number; includeIdentity?: boolean }

export async function exportBackup(password: string, opts: ExportOptions = {}): Promise<string> {
  if (password.length < MIN_PASSWORD) throw new Error("err.backup.short");
  const now = opts.now ?? Date.now();
  const data = await db.loadAll(now);
  const contacts = await db.getContacts();
  const settings = await db.getFlag("p2p-settings");
  const spacesRaw = await db.getFlag("spaces");
  const devicesRaw = await db.getFlag("linked-devices");

  const payload: BackupPayload = {
    v: 1,
    exportedAt: now,
    conversations: data.conversations,
    messages: data.messages,
    contacts,
    ...(isObj(settings) ? { settings } : {}),
    ...(Array.isArray(spacesRaw) ? { spaces: spacesRaw.filter(isSpace).slice(0, 50) } : {}),
    ...(Array.isArray(devicesRaw) ? { linkedDevices: devicesRaw.filter(isLinkedDevice).slice(0, 50) } : {}),
    blobsIncluded: false,
  };

  if (opts.includeIdentity !== false) {
    const plain = await db.getIdentity();
    const vault = (await db.getFlag("q7.vault")) as Vault | undefined;
    const sealedId = (await db.getFlag("q7.vault.id")) as string | undefined;
    if (plain) payload.identity = plain;
    else if (vault && sealedId) payload.vault = { v: vault, sealedId };
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = DEFAULT_ITERATIONS;
  const key = await deriveKey(password, salt, iterations);
  const compressed = await gzip(JSON.stringify(payload));
  const sealed = await seal(key, toB64(compressed), "q7-backup-v1");
  const file: BackupFile = {
    app: BACKUP_APP, format: BACKUP_FORMAT, kind: BACKUP_KIND,
    kdf: { alg: "PBKDF2-SHA256", iterations, salt: toB64(salt) },
    data: toB64(sealed),
  };
  return JSON.stringify(file, null, 2);
}

/* ---------- import / validation ---------- */

/** Decrypts and validates a backup. Throws a translation key on every failure. */
export async function readBackup(text: string, password: string, now = Date.now()): Promise<{ payload: BackupPayload; summary: BackupSummary }> {
  if (text.length > MAX_FILE) throw new Error("err.backup.big");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("err.backup.file"); }
  if (!isObj(raw) || raw.app !== BACKUP_APP || raw.format !== BACKUP_FORMAT || raw.kind !== BACKUP_KIND) throw new Error("err.backup.file");
  const kdf = raw.kdf, data = raw.data;
  if (!isObj(kdf) || kdf.alg !== "PBKDF2-SHA256" || typeof kdf.iterations !== "number" || !Number.isInteger(kdf.iterations)
    || kdf.iterations < ITER_MIN || kdf.iterations > ITER_MAX || typeof kdf.salt !== "string" || typeof data !== "string")
    throw new Error("err.backup.file");

  let salt: Uint8Array, sealed: Uint8Array;
  try { salt = fromB64(kdf.salt); sealed = fromB64(data); } catch { throw new Error("err.backup.file"); }
  if (salt.length !== 16 || sealed.length < 29) throw new Error("err.backup.file");

  const key = await deriveKey(password, salt, kdf.iterations);
  const opened = await unseal(key, sealed, "q7-backup-v1");
  if (typeof opened !== "string") throw new Error("err.backup.password");
  let payloadRaw: unknown;
  try { payloadRaw = JSON.parse(await gunzip(fromB64(opened))); } catch { throw new Error("err.backup.corrupt"); }

  const payload = sanitizePayload(payloadRaw, now);
  const summary: BackupSummary = {
    conversations: payload.conversations.length,
    messages: payload.messages.length,
    contacts: payload.contacts.length,
    skipped: payload.skipped,
    hasIdentity: !!payload.identity || !!payload.vault,
  };
  return { payload, summary };
}

type Sanitized = BackupPayload & { skipped: number };

function sanitizePayload(raw: unknown, now: number): Sanitized {
  if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.conversations) || !Array.isArray(raw.messages) || !Array.isArray(raw.contacts))
    throw new Error("err.backup.file");
  if (raw.conversations.length > 500 || raw.messages.length > 20_000 || raw.contacts.length > 500) throw new Error("err.backup.big");

  const conversations: Conversation[] = [];
  for (const c of raw.conversations) {
    const x = sanitizeConversation(c);
    if (x) conversations.push(x);
  }
  const convIds = new Set(conversations.map((c) => c.id));
  let skipped = raw.conversations.length - conversations.length;

  const messages: Message[] = [];
  for (const m of raw.messages) {
    const x = sanitizeMessage(m, now, convIds);
    if (x) messages.push(x); else skipped++;
  }

  const contacts: Contact[] = [];
  for (const c of raw.contacts) {
    const x = sanitizeContact(c);
    if (x) contacts.push(x);
  }

  const spaces = Array.isArray(raw.spaces) ? raw.spaces.filter(isSpace).slice(0, 50) : undefined;
  const linkedDevices = Array.isArray(raw.linkedDevices) ? raw.linkedDevices.filter(isLinkedDevice).slice(0, 50) : undefined;
  const identity = sanitizeIdentity(raw.identity);
  const vault = sanitizeVault(raw.vault);

  return {
    v: 1,
    exportedAt: typeof raw.exportedAt === "number" && Number.isFinite(raw.exportedAt) ? raw.exportedAt : now,
    conversations, messages, contacts,
    ...(identity ? { identity } : {}),
    ...(vault ? { vault } : {}),
    ...(isObj(raw.settings) ? { settings: sanitizeSettings(raw.settings) } : {}),
    ...(spaces ? { spaces } : {}),
    ...(linkedDevices ? { linkedDevices } : {}),
    blobsIncluded: false,
    skipped,
  };
}

export function sanitizeConversation(c: unknown): Conversation | null {
  if (!isObj(c) || typeof c.id !== "string" || !ID.test(c.id) || typeof c.title !== "string") return null;
  const mode = c.mode === "p2p" || c.mode === "group" ? c.mode : "local";
  const out: Conversation = {
    id: c.id, mode, title: c.title.slice(0, 60) || "Untitled",
    pinned: c.pinned === true, muted: c.muted === true, archived: c.archived === true,
    unread: typeof c.unread === "number" && Number.isFinite(c.unread) ? Math.max(0, Math.min(9999, Math.floor(c.unread))) : 0,
  };
  if (mode === "p2p" && typeof c.contactId === "string" && ID.test(c.contactId)) out.contactId = c.contactId;
  if (mode === "group") {
    if (Array.isArray(c.members)) out.members = c.members.filter((m): m is string => typeof m === "string" && ID.test(m)).slice(0, 50);
    if (typeof c.hue === "number" && Number.isFinite(c.hue)) out.hue = Math.max(0, Math.min(360, c.hue));
    if (isObj(c.names)) {
      const names: Record<string, string> = {};
      for (const [k, v] of Object.entries(c.names)) if (ID.test(k) && typeof v === "string") names[k] = v.slice(0, 40);
      if (Object.keys(names).length) out.names = names;
    }
    if (c.left === true) out.left = true;
  }
  if (c.starred === true) out.starred = true;
  if (typeof c.wall === "string") out.wall = c.wall.slice(0, 40);
  if (typeof c.syncAt === "number" && Number.isFinite(c.syncAt)) out.syncAt = c.syncAt;
  return out;
}

export function sanitizeContact(c: unknown): Contact | null {
  if (!isObj(c) || typeof c.id !== "string" || !ID.test(c.id) || typeof c.pub !== "string" || typeof c.name !== "string"
    || typeof c.code !== "string" || typeof c.addedAt !== "number" || typeof c.verified !== "boolean") return null;
  return {
    id: c.id, pub: c.pub.slice(0, 200), name: c.name.slice(0, 40), code: c.code.replace(/\D/g, "").slice(0, 12),
    addedAt: c.addedAt, verified: c.verified === true,
    ...(typeof c.photo === "string" && c.photo.startsWith("data:image/") && c.photo.length < 400_000 ? { photo: c.photo } : {}),
    ...(c.renamed === true ? { renamed: true } : {}),
    ...(typeof c.ek === "string" ? { ek: c.ek.slice(0, 200) } : {}),
    ...(c.blocked === true ? { blocked: true } : {}),
  };
}

export function sanitizeMessage(m: unknown, now: number, convIds: Set<string>): Message | null {
  if (!isObj(m) || typeof m.id !== "string" || !ID.test(m.id) || typeof m.conversationId !== "string" || !convIds.has(m.conversationId)
    || typeof m.body !== "string" || m.body.length > 4000 || typeof m.createdAt !== "number" || !Number.isFinite(m.createdAt)
    || m.createdAt > now + 300_000) return null;
  const expiresAt = m.createdAt + LIFETIME_MS;
  if (expiresAt <= now) return null;
  if (!m.body && !isObj(m.link) && !isObj(m.att)) return null;
  const out: Message = { id: m.id, conversationId: m.conversationId, body: m.body, createdAt: m.createdAt, expiresAt };
  if (typeof m.replyToId === "string" && ID.test(m.replyToId)) out.replyToId = m.replyToId;
  if (m.direction === "in" || m.direction === "out") out.direction = m.direction;
  if (typeof m.from === "string" && ID.test(m.from)) out.from = m.from;
  if (m.status === "queued" || m.status === "sent" || m.status === "delivered" || m.status === "seen") out.status = m.status;
  if (typeof m.editedAt === "number" && Number.isFinite(m.editedAt)) out.editedAt = m.editedAt;
  if (typeof m.syncAt === "number" && Number.isFinite(m.syncAt)) out.syncAt = m.syncAt;
  const link = sanitizeLink(m.link);
  if (link) out.link = link;
  const att = sanitizeAttachment(m.att);
  if (att) out.att = att;
  const reactions = sanitizeReactions(m.reactions);
  if (reactions) out.reactions = reactions;
  return out;
}

function sanitizeLink(v: unknown) {
  if (!isObj(v) || typeof v.url !== "string") return undefined;
  const u = parseHttpsUrl(v.url); if (!u) return undefined;
  return {
    url: u.href, isImage: isDirectImageUrl(u),
    ...(typeof v.title === "string" ? { title: v.title.slice(0, 80) } : {}),
    ...(typeof v.description === "string" ? { description: v.description.slice(0, 200) } : {}),
  };
}

function sanitizeReactions(v: unknown): Record<string, string[]> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [emoji, who] of Object.entries(v)) {
    if (!emoji || emoji.length > 16 || !Array.isArray(who)) continue;
    const ids = who.filter((x): x is string => typeof x === "string" && ID.test(x)).slice(0, 100);
    if (ids.length) out[emoji] = ids;
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeAttachment(v: unknown): Attachment | undefined {
  if (!isObj(v)) return undefined;
  if (v.t === "file" && (v.kind === "image" || v.kind === "document" || v.kind === "voice")
    && typeof v.name === "string" && typeof v.mime === "string" && typeof v.size === "number") {
    return { t: "file", kind: v.kind, name: v.name.slice(0, 120), mime: v.mime.slice(0, 100), size: Math.max(0, Math.min(10 * 1024 * 1024, v.size)), ...(typeof v.dur === "number" ? { dur: v.dur } : {}) };
  }
  if (v.t === "gif" && typeof v.url === "string" && typeof v.w === "number" && typeof v.h === "number") {
    const u = parseHttpsUrl(v.url); if (!u) return undefined;
    return { t: "gif", url: u.href, w: Math.max(1, Math.min(4000, v.w)), h: Math.max(1, Math.min(4000, v.h)) };
  }
  if (v.t === "location" && typeof v.lat === "number" && typeof v.lon === "number" && Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180)
    return { t: "location", lat: v.lat, lon: v.lon };
  if (v.t === "contact" && typeof v.name === "string" && typeof v.code === "string" && typeof v.pub === "string")
    return { t: "contact", name: v.name.slice(0, 40), code: v.code.replace(/\D/g, "").slice(0, 12), pub: v.pub.slice(0, 200) };
  if (v.t === "poll" && typeof v.q === "string" && Array.isArray(v.opts)) {
    const opts = v.opts.filter((o): o is string => typeof o === "string").map((o) => o.slice(0, 80)).slice(0, 10);
    if (opts.length >= 2) {
      const votes: Record<string, number[]> = {};
      if (isObj(v.votes)) for (const [who, ballot] of Object.entries(v.votes)) {
        if (!who || who.length > 64 || !Array.isArray(ballot)) continue;
        const picks = ballot.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < opts.length).slice(0, opts.length);
        if (picks.length) votes[who] = picks;
      }
      return { t: "poll", q: v.q.slice(0, 200), opts, multi: v.multi === true, votes };
    }
  }
  if (v.t === "event" && typeof v.title === "string" && typeof v.start === "number")
    return { t: "event", title: v.title.slice(0, 120), start: v.start, ...(typeof v.place === "string" ? { place: v.place.slice(0, 120) } : {}), ...(typeof v.note === "string" ? { note: v.note.slice(0, 300) } : {}) };
  return undefined;
}

function sanitizeIdentity(v: unknown): StoredIdentity | undefined {
  if (!isObj(v) || v.key !== "identity" || typeof v.pub !== "string" || !isObj(v.privJwk) || typeof v.ecdhPub !== "string" || !isObj(v.ecdhJwk)) return undefined;
  if (v.pub.length > 200 || v.ecdhPub.length > 200) return undefined;
  return { key: "identity", privJwk: v.privJwk as JsonWebKey, pub: v.pub, ecdhPub: v.ecdhPub, ecdhJwk: v.ecdhJwk as JsonWebKey };
}

function sanitizeVault(v: unknown): { v: Vault; sealedId: string } | undefined {
  if (!isObj(v) || !isObj(v.v) || typeof v.sealedId !== "string" || v.sealedId.length > 400_000) return undefined;
  const x = v.v;
  if (x.v !== 1 || typeof x.salt !== "string" || typeof x.wrap !== "string" || typeof x.check !== "string" || typeof x.idleMin !== "number"
    || (x.totp !== undefined && typeof x.totp !== "string")) return undefined;
  return { v: x as unknown as Vault, sealedId: v.sealedId };
}

function sanitizeSettings(v: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof v.name === "string") out.name = v.name.slice(0, 40);
  if (typeof v.photo === "string" && v.photo.startsWith("data:image/") && v.photo.length < 400_000) out.photo = v.photo;
  if (typeof v.relayEnabled === "boolean") out.relayEnabled = v.relayEnabled;
  if (Array.isArray(v.customRelays)) out.customRelays = v.customRelays.filter((u): u is string => typeof u === "string" && /^wss:\/\/\S+$/.test(u)).slice(0, 8);
  if (isObj(v.turn) && typeof v.turn.urls === "string") out.turn = { urls: v.turn.urls.slice(0, 300), ...(typeof v.turn.username === "string" ? { username: v.turn.username.slice(0, 100) } : {}), ...(typeof v.turn.credential === "string" ? { credential: v.turn.credential.slice(0, 100) } : {}) };
  if (typeof v.giphy === "string") out.giphy = v.giphy.slice(0, 100);
  if (v.onlyContacts === true) out.onlyContacts = true;
  return out;
}

function isSpace(v: unknown): v is Space {
  return isObj(v) && typeof v.id === "string" && typeof v.name === "string" && typeof v.hue === "number" && Array.isArray(v.members)
    && v.members.every((m) => typeof m === "string");
}

function isLinkedDevice(v: unknown): v is LinkedDevice {
  return isObj(v) && typeof v.id === "string" && typeof v.name === "string" && typeof v.addedAt === "number";
}

/* ---------- restore ---------- */

export interface RestoreOptions { replaceIdentity?: boolean; now?: number }

/** Writes a validated backup into IndexedDB. Existing rows are only overwritten by newer rows. */
export async function restoreBackup(payload: BackupPayload, opts: RestoreOptions = {}): Promise<{ conversations: number; messages: number; contacts: number; skipped: number; identity: boolean }> {
  const now = opts.now ?? Date.now();
  const current = await db.loadAll(now);
  const oldConvs = new Map(current.conversations.map((c) => [c.id, c] as const));
  const oldMsgs = new Map(current.messages.map((m) => [m.id, m] as const));
  const oldContacts = new Map((await db.getContacts()).map((c) => [c.id, c] as const));

  // Never let an old backup roll back a newer local row. Restoring into a fresh device behaves
  // like a full import; restoring over existing data keeps the newest version of each record.
  const convs = payload.conversations.filter((c) => {
    const old = oldConvs.get(c.id); return !old || (c.syncAt ?? 0) > (old.syncAt ?? 0);
  });
  const msgs = payload.messages.filter((m) => {
    const old = oldMsgs.get(m.id); return !old || (m.syncAt ?? m.createdAt) > (old.syncAt ?? old.createdAt);
  });
  const contacts = payload.contacts.filter((c) => {
    const old = oldContacts.get(c.id); return !old || (c.syncAt ?? c.addedAt) > (old.syncAt ?? old.addedAt);
  });

  await db.putMany(convs, msgs, contacts);

  if (payload.settings) await db.setFlag("p2p-settings", payload.settings);
  if (payload.spaces) await db.setFlag("spaces", payload.spaces);
  if (payload.linkedDevices) await db.setFlag("linked-devices", payload.linkedDevices);

  let identity = false;
  if (opts.replaceIdentity) {
    if (payload.vault) {
      await db.setFlag("q7.vault", payload.vault.v);
      await db.setFlag("q7.vault.id", payload.vault.sealedId);
      await db.delIdentity();
      identity = true;
    } else if (payload.identity) {
      await db.putIdentity(payload.identity);
      await db.delFlag("q7.vault"); await db.delFlag("q7.vault.id");
      identity = true;
    }
  }
  return { conversations: convs.length, messages: msgs.length, contacts: contacts.length, skipped: payload.skipped ?? 0, identity };
}

/** True when the JSON is an encrypted v2 backup rather than the legacy plaintext export. */
export function isBackupFile(raw: unknown): raw is BackupFile {
  return isObj(raw) && raw.app === BACKUP_APP && raw.format === BACKUP_FORMAT && raw.kind === BACKUP_KIND;
}
