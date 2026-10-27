import type { Contact, Conversation, LinkMeta, Message } from "./types";
import type { StoredIdentity } from "./p2p/crypto";
import { LIFETIME_MS } from "./time";
import { isDirectImageUrl, parseHttpsUrl } from "./links";

/** IndexedDB persistence for Local Mode. Nothing in this file touches the network. */
const NAME = (typeof process !== "undefined" && process.env?.Q7_DB) || "q7-local";
const VERSION = 3;
export const STORES = { conv: "local_conversations", msg: "local_messages", settings: "local_settings", contacts: "p2p_contacts", identity: "p2p_identity", blobs: "local_blobs" } as const;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = (ev) => {
      const db = r.result;
      if (ev.oldVersion < 1) {
        db.createObjectStore(STORES.conv, { keyPath: "id" });
        const m = db.createObjectStore(STORES.msg, { keyPath: "id" });
        m.createIndex("conversationId", "conversationId");
        m.createIndex("expiresAt", "expiresAt");
        db.createObjectStore(STORES.settings, { keyPath: "key" });
      }
      if (ev.oldVersion < 2) {
        db.createObjectStore(STORES.contacts, { keyPath: "id" });
        db.createObjectStore(STORES.identity, { keyPath: "key" });
      }
      if (ev.oldVersion < 3) {
        db.createObjectStore(STORES.blobs, { keyPath: "id" }).createIndex("expiresAt", "expiresAt");
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function run<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T> | T): Promise<T> {
  const db = await open();
  try {
    const tx = db.transaction(stores, mode);
    const done = new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    const out = await fn(tx);
    await done;
    return out;
  } finally { db.close(); }
}

export const putConversation = (c: Conversation) => run([STORES.conv], "readwrite", (tx) => { tx.objectStore(STORES.conv).put(c); });
export const putMessage = (m: Message) => run([STORES.msg], "readwrite", (tx) => { tx.objectStore(STORES.msg).put(m); });
export const deleteMessage = (id: string) => run([STORES.msg, STORES.blobs], "readwrite", (tx) => { tx.objectStore(STORES.msg).delete(id); tx.objectStore(STORES.blobs).delete(id); });

export const deleteConversation = (id: string) => run([STORES.conv, STORES.msg, STORES.blobs], "readwrite", async (tx) => {
  tx.objectStore(STORES.conv).delete(id);
  const keys = await req(tx.objectStore(STORES.msg).index("conversationId").getAllKeys(id));
  keys.forEach((k) => { tx.objectStore(STORES.msg).delete(k); tx.objectStore(STORES.blobs).delete(k); }); // blob id equals message id
});

/** Keeps the conversation, wipes its messages and their blobs. */
export const clearConversation = (id: string) => run([STORES.msg, STORES.blobs], "readwrite", async (tx) => {
  const keys = await req(tx.objectStore(STORES.msg).index("conversationId").getAllKeys(id));
  keys.forEach((k) => { tx.objectStore(STORES.msg).delete(k); tx.objectStore(STORES.blobs).delete(k); });
  return keys.length;
});

/** Deletes the actual records for every message whose expiresAt <= now. */
export const purgeExpired = (now: number) => run([STORES.msg], "readwrite", async (tx) => {
  const store = tx.objectStore(STORES.msg);
  const keys = await req(store.index("expiresAt").getAllKeys(IDBKeyRange.upperBound(now)));
  keys.forEach((k) => store.delete(k));
  return keys.length;
});

export async function loadAll(now: number): Promise<{ conversations: Conversation[]; messages: Message[] }> {
  return run([STORES.conv, STORES.msg], "readonly", async (tx) => {
    const conversations = await req(tx.objectStore(STORES.conv).getAll() as IDBRequest<Conversation[]>);
    const all = await req(tx.objectStore(STORES.msg).getAll() as IDBRequest<Message[]>);
    return { conversations, messages: all.filter((m) => m.expiresAt > now).sort((a, b) => a.createdAt - b.createdAt) };
  });
}

export const getFlag = (key: string) => run([STORES.settings], "readonly", async (tx) => {
  const row = await req(tx.objectStore(STORES.settings).get(key) as IDBRequest<{ key: string; value: unknown } | undefined>);
  return row?.value;
});
export const setFlag = (key: string, value: unknown) => run([STORES.settings], "readwrite", (tx) => { tx.objectStore(STORES.settings).put({ key, value }); });

export interface BlobRec { id: string; blob: Blob; expiresAt: number }
export const putBlob = (b: BlobRec) => run([STORES.blobs], "readwrite", (tx) => { tx.objectStore(STORES.blobs).put(b); });
export const getBlob = (id: string) => run([STORES.blobs], "readonly", (tx) => req(tx.objectStore(STORES.blobs).get(id) as IDBRequest<BlobRec | undefined>));
export const deleteBlob = (id: string) => run([STORES.blobs], "readwrite", (tx) => { tx.objectStore(STORES.blobs).delete(id); });
export const purgeBlobs = (now: number) => run([STORES.blobs], "readwrite", async (tx) => {
  const keys = await req(tx.objectStore(STORES.blobs).index("expiresAt").getAllKeys(IDBKeyRange.upperBound(now)));
  keys.forEach((k) => tx.objectStore(STORES.blobs).delete(k)); return keys.length;
});
export async function storageUsage(): Promise<number> { try { return (await navigator.storage?.estimate?.())?.usage ?? 0; } catch { return 0; } }

export const wipeAll = () => run(Object.values(STORES), "readwrite", (tx) => { Object.values(STORES).forEach((n) => tx.objectStore(n).clear()); });

export const getContacts = () => run([STORES.contacts], "readonly", (tx) => req(tx.objectStore(STORES.contacts).getAll() as IDBRequest<Contact[]>));
export const putContact = (c: Contact) => run([STORES.contacts], "readwrite", (tx) => { tx.objectStore(STORES.contacts).put(c); });
export const deleteContact = (id: string) => run([STORES.contacts], "readwrite", (tx) => { tx.objectStore(STORES.contacts).delete(id); });
export const getIdentity = () => run([STORES.identity], "readonly", (tx) => req(tx.objectStore(STORES.identity).get("identity") as IDBRequest<StoredIdentity | undefined>));
export const putIdentity = (i: StoredIdentity) => run([STORES.identity], "readwrite", (tx) => { tx.objectStore(STORES.identity).put(i); });
export const delIdentity = () => run([STORES.identity], "readwrite", (tx) => { tx.objectStore(STORES.identity).delete("identity"); });
export const delFlag = (key: string) => run([STORES.settings], "readwrite", (tx) => { tx.objectStore(STORES.settings).delete(key); });

/* ---------- export / import ---------- */

export interface ExportFile { app: "q7-message"; format: 1; exportedAt: number; conversations: Conversation[]; messages: Message[] }

export async function exportData(now: number): Promise<ExportFile> {
  const all = await loadAll(now);
  const conversations = all.conversations.filter((c) => c.mode === "local");
  const ids = new Set(conversations.map((c) => c.id));
  return { app: "q7-message", format: 1, exportedAt: now, conversations, messages: all.messages.filter((m) => ids.has(m.conversationId)) };
}

const ID = /^[\w-]{1,64}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates an export file. Lifetime is recomputed, so an import can never extend a message's 72 hours. */
export function parseImport(raw: unknown, now: number) {
  if (!isObj(raw) || raw.app !== "q7-message" || raw.format !== 1 || !Array.isArray(raw.conversations) || !Array.isArray(raw.messages))
    throw new Error("err.import");
  if (raw.conversations.length > 500 || raw.messages.length > 20000) throw new Error("err.import");

  const conversations: Conversation[] = [];
  for (const c of raw.conversations) {
    if (!isObj(c) || typeof c.id !== "string" || !ID.test(c.id) || typeof c.title !== "string") continue;
    conversations.push({ id: c.id, mode: "local", title: c.title.slice(0, 60) || "Untitled", pinned: c.pinned === true, muted: c.muted === true, archived: c.archived === true, unread: 0 });
  }
  const known = new Set(conversations.map((c) => c.id));

  const messages: Message[] = []; let skipped = 0;
  for (const m of raw.messages) {
    if (!isObj(m) || typeof m.id !== "string" || !ID.test(m.id) || typeof m.conversationId !== "string" || !known.has(m.conversationId)
      || typeof m.body !== "string" || m.body.length > 4000 || typeof m.createdAt !== "number" || !Number.isFinite(m.createdAt) || m.createdAt > now + 300_000) { skipped++; continue; }
    const expiresAt = m.createdAt + LIFETIME_MS; if (!m.body && !isObj(m.link)) { skipped++; continue; }
    if (expiresAt <= now) { skipped++; continue; }
    let link: LinkMeta | undefined;
    if (isObj(m.link)) {
      const u = typeof m.link.url === "string" ? parseHttpsUrl(m.link.url) : null;
      if (!u) { skipped++; continue; }
      link = { url: u.href, isImage: isDirectImageUrl(u),
        title: typeof m.link.title === "string" ? m.link.title.slice(0, 80) : undefined,
        description: typeof m.link.description === "string" ? m.link.description.slice(0, 200) : undefined };
    }
    messages.push({ id: m.id, conversationId: m.conversationId, body: m.body, createdAt: m.createdAt, expiresAt, link, replyToId: typeof m.replyToId === "string" && ID.test(m.replyToId) ? m.replyToId : undefined });
  }
  return { conversations, messages, skipped };
}

export async function importData(raw: unknown, now: number) {
  const { conversations, messages, skipped } = parseImport(raw, now);
  await run([STORES.conv, STORES.msg], "readwrite", (tx) => {
    conversations.forEach((c) => tx.objectStore(STORES.conv).put(c));
    messages.forEach((m) => tx.objectStore(STORES.msg).put(m));
  });
  return { conversations: conversations.length, messages: messages.length, skipped };
}
