"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Attachment, Conversation, LinkMeta, Message, Settings, Space } from "./types";
import { LIFETIME_MS } from "./time";
import { applyAccent } from "./theme";
import * as db from "./db";
import * as backup from "./backup";
import { addTombstone, mergeSync, sanitizeTombstones, type SyncSnapshot, type SyncState, type SyncTombstone } from "./sync";
import { randomHex } from "./p2p/crypto";
import { useI18n } from "./i18n";

interface Store {
  ready: boolean; now: number; storageError: boolean; blobTick: number; bumpBlobs: () => void;
  conversations: Conversation[]; messages: Message[]; settings: Settings;
  createLocal: (title: string) => string;
  update: (id: string, patch: Partial<Conversation>) => void;
  send: (conversationId: string, body: string, link?: LinkMeta, replyToId?: string, att?: Attachment, blob?: Blob) => void;
  remove: (messageId: string) => void;
  createP2P: (contactId: string, title: string) => string;
  /** Group conversation ("space"): id is fixed by the inviter so every member shares it. */
  createGroup: (opts: { id?: string; title: string; members: string[]; hue?: number; names?: Record<string, string> }) => string;
  addMessage: (m: Message, blob?: Blob) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  /** Toggles one member's emoji reaction on a message. */
  reactMessage: (id: string, emoji: string, who: string, on: boolean) => void;
  removeConversation: (id: string) => void;
  clearConversation: (id: string) => void;
  wipeLocal: () => Promise<void>;
  exportBackup: (password: string) => Promise<string>;
  importBackup: (text: string, password: string, replaceIdentity: boolean) => Promise<{ conversations: number; messages: number; contacts: number; skipped: number; identity: boolean; legacy: boolean }>;
  /* Multi-device sync: the P2P manager reads state and hands back merged snapshots. */
  getSyncState: () => Promise<SyncState>;
  getDeviceId: () => Promise<string>;
  mergeSyncSnapshot: (snap: SyncSnapshot) => Promise<boolean>;
  setSyncNotifier: (fn: (() => void) | null) => void;
  tombstoneSync: (kind: "msg" | "conv" | "contact", id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  /** Synchronous reads for non-React consumers (P2P): reflect the very latest mutations, not the last render. */
  peekConversations: () => Conversation[];
  peekMessages: () => Message[];
  spaces: Space[];
  createSpace: (name: string) => string;
  deleteSpace: (id: string) => void;
  renameSpace: (id: string, name: string) => void;
  spaceAdd: (id: string, contactId: string) => void;
  spaceRemove: (id: string, contactId: string) => void;
}
const Ctx = createContext<Store | null>(null);
const SPACE_HUES = [4, 26, 45, 90, 145, 172, 200, 255, 285, 320];
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error("StoreProvider missing"); return s; };

// crypto.randomUUID needs a secure context; fall back so http://<lan-ip> still works on a phone.
const uid = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};
const mk = (conversationId: string, body: string, link?: LinkMeta, replyToId?: string, att?: Attachment): Message => {
  const createdAt = Date.now();
  return { id: uid(), conversationId, body, createdAt, expiresAt: createdAt + LIFETIME_MS, link, replyToId, att, syncAt: createdAt };
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const { t } = useI18n(); const tRef = useRef(t); tRef.current = t;
  const [storageError, setStorageError] = useState(false);
  const [blobTick, setBlobTick] = useState(0);
  const bumpBlobs = useCallback(() => setBlobTick((x) => x + 1), []);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [settings, setSettingsState] = useState<Settings>({ theme: "dark", previews: "ask", accent: "blue", presence: "online", textScale: "m" });
  const [spaces, setSpaces] = useState<Space[]>([]);
  const convRef = useRef(conversations); convRef.current = conversations;
  const msgRef = useRef(messages); msgRef.current = messages;
  const started = useRef(false);
  const syncNotify = useRef<(() => void) | null>(null);
  const deviceRef = useRef("");
  const tombRef = useRef<SyncTombstone[]>([]);
  const notifySync = useCallback(() => { syncNotify.current?.(); }, []);
  const setSyncNotifier = useCallback((fn: (() => void) | null) => { syncNotify.current = fn; }, []);
  const addTomb = useCallback((kind: SyncTombstone["kind"], id: string) => {
    tombRef.current = addTombstone(tombRef.current, kind, id);
    void db.setFlag("sync-tombstones", tombRef.current).catch(() => {});
  }, []);
  const tombstoneSync = useCallback((kind: SyncTombstone["kind"], id: string) => { addTomb(kind, id); notifySync(); }, [addTomb, notifySync]);
  const getDeviceId = useCallback(async () => {
    if (deviceRef.current) return deviceRef.current;
    const saved = await db.getFlag("sync-device-id");
    if (typeof saved === "string" && /^[0-9a-f]{16}$/.test(saved)) { deviceRef.current = saved; return saved; }
    const id = randomHex(8); deviceRef.current = id;
    await db.setFlag("sync-device-id", id);
    return id;
  }, []);

  const persist = useCallback((p: Promise<unknown>) => { p.catch(() => setStorageError(true)); }, []);

  const reload = useCallback(async () => {
    const t = Date.now();
    await db.purgeExpired(t);
    const data = await db.loadAll(t);
    setConversations(data.conversations); setMessages(data.messages); setNow(t);
  }, []);

  useEffect(() => {
    if (started.current) return; started.current = true;
    (async () => {
      try {
        const t = Date.now();
        await db.purgeExpired(t); await db.purgeBlobs(t); // startup cleanup, also covers a browser closed for days
        if (!(await db.getFlag("seeded"))) {
          const c: Conversation = { id: uid(), mode: "local", title: tRef.current("welcome.title"), pinned: false, muted: false, archived: false, unread: 0 };
          await db.putConversation(c); await db.putMessage(mk(c.id, tRef.current("welcome.text"))); await db.setFlag("seeded", true);
        }
        await reload();
        const raw = await db.getFlag("spaces");
        if (Array.isArray(raw)) {
          const list = raw.filter((s): s is Space => !!s && typeof s === "object" && typeof (s as Space).id === "string" && typeof (s as Space).name === "string" && Array.isArray((s as Space).members));
          setSpaces(list.slice(0, 50));
        }
        const tombs = await db.getFlag("sync-tombstones");
        if (Array.isArray(tombs)) tombRef.current = sanitizeTombstones(tombs, t);
        void getDeviceId();
      } catch {
        setStorageError(true);
        const c: Conversation = { id: uid(), mode: "local", title: tRef.current("welcome.title"), pinned: false, muted: false, archived: false, unread: 0 };
        setConversations([c]); setMessages([mk(c.id, tRef.current("welcome.text"))]);
      }
      try {
        const raw = localStorage.getItem("q7.settings");
        if (raw) setSettingsState((s) => ({ ...s, ...JSON.parse(raw) as Partial<Settings> }));
        else { const th = localStorage.getItem("q7.theme"); if (th === "light" || th === "dark") setSettingsState((s) => ({ ...s, theme: th })); const ac = localStorage.getItem("q7.accent"); if (ac) setSettingsState((s) => ({ ...s, accent: ac })); }
      } catch {}
      setNow(Date.now()); setReady(true);
    })();
  }, [getDeviceId, reload]);

  useEffect(() => { document.documentElement.dataset.theme = settings.theme; applyAccent(settings.accent, settings.theme); }, [settings.theme, settings.accent]);
  useEffect(() => { document.documentElement.style.fontSize = settings.textScale === "s" ? "14px" : settings.textScale === "l" ? "18px" : ""; }, [settings.textScale]);
  useEffect(() => { if (settings.reduceMotion) document.documentElement.dataset.motion = "calm"; else delete document.documentElement.dataset.motion; }, [settings.reduceMotion]);

  useEffect(() => {
    const tick = () => {
      const t = Date.now(); setNow(t);
      setMessages((m) => (m.some((x) => x.expiresAt <= t) ? m.filter((x) => x.expiresAt > t) : m));
      db.purgeExpired(t).catch(() => {}); db.purgeBlobs(t).catch(() => {});
    };
    const h = setInterval(tick, 30_000);
    const vis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(h); document.removeEventListener("visibilitychange", vis); };
  }, []);

  const createLocal = useCallback((title: string) => {
    const c: Conversation = { id: uid(), mode: "local", title: title.trim() || "Untitled", pinned: false, muted: false, archived: false, unread: 0, syncAt: Date.now() };
    setConversations((x) => [...x, c]); persist(db.putConversation(c));
    notifySync();
    return c.id;
  }, [persist, notifySync]);
  const update = useCallback((id: string, patch: Partial<Conversation>) => {
    const cur = convRef.current.find((x) => x.id === id); if (!cur) return;
    const next = { ...cur, ...patch, syncAt: Date.now() };
    setConversations((c) => c.map((x) => (x.id === id ? next : x))); persist(db.putConversation(next));
    notifySync();
  }, [persist, notifySync]);
  const send = useCallback((cid: string, body: string, link?: LinkMeta, replyToId?: string, att?: Attachment, blob?: Blob) => {
    const m = mk(cid, body, link, replyToId, att);
    setNow(Date.now()); msgRef.current = [...msgRef.current, m]; setMessages(msgRef.current);
    persist((async () => { if (blob) await db.putBlob({ id: m.id, blob, expiresAt: m.expiresAt }); await db.putMessage(m); setBlobTick((x) => x + 1); })());
    notifySync();
  }, [persist, notifySync]);
  const remove = useCallback((id: string) => {
    const msg = msgRef.current.find((x) => x.id === id);
    const conv = msg && convRef.current.find((c) => c.id === msg.conversationId);
    msgRef.current = msgRef.current.filter((x) => x.id !== id); setMessages(msgRef.current); persist(db.deleteMessage(id));
    if (conv?.mode !== "local") addTomb("msg", id);
    notifySync();
  }, [persist, addTomb, notifySync]);
  const createP2P = useCallback((contactId: string, title: string) => {
    const ex = convRef.current.find((c) => c.contactId === contactId); if (ex) return ex.id;
    const c: Conversation = { id: uid(), mode: "p2p", contactId, title: title.slice(0, 60) || "Contact", pinned: false, muted: false, archived: false, unread: 0, syncAt: Date.now() };
    convRef.current = [...convRef.current, c]; setConversations(convRef.current); persist(db.putConversation(c));
    notifySync();
    return c.id;
  }, [persist, notifySync]);
  const addMessage = useCallback((m: Message, blob?: Blob) => {
    if (msgRef.current.some((x) => x.id === m.id)) return;
    const next = m.syncAt ? m : { ...m, syncAt: Date.now() };
    msgRef.current = [...msgRef.current, next]; setMessages(msgRef.current); setNow(Date.now());
    persist((async () => { if (blob) await db.putBlob({ id: next.id, blob, expiresAt: next.expiresAt }); await db.putMessage(next); setBlobTick((x) => x + 1); })());
    notifySync();
  }, [persist, notifySync]);
  const createGroup = useCallback((opts: { id?: string; title: string; members: string[]; hue?: number; names?: Record<string, string> }) => {
    if (opts.id) { const ex = convRef.current.find((c) => c.id === opts.id); if (ex) return ex.id; }
    const c: Conversation = {
      id: opts.id || uid(), mode: "group", title: opts.title.trim().slice(0, 60) || "Group",
      pinned: false, muted: false, archived: false, unread: 0,
      members: Array.from(new Set(opts.members)).slice(0, 50), hue: opts.hue, names: opts.names, syncAt: Date.now(),
    };
    convRef.current = [...convRef.current.filter((x) => x.id !== c.id), c]; setConversations(convRef.current); persist(db.putConversation(c));
    notifySync();
    return c.id;
  }, [persist, notifySync]);
  const reactMessage = useCallback((id: string, emoji: string, who: string, on: boolean) => {
    const cur = msgRef.current.find((x) => x.id === id); if (!cur) return;
    const rx: Record<string, string[]> = { ...(cur.reactions ?? {}) };
    const list = new Set(rx[emoji] ?? []);
    if (on) list.add(who); else list.delete(who);
    if (list.size) rx[emoji] = [...list]; else delete rx[emoji];
    const next = { ...cur, reactions: Object.keys(rx).length ? rx : undefined, id: cur.id, createdAt: cur.createdAt, expiresAt: cur.expiresAt, syncAt: Date.now() };
    msgRef.current = msgRef.current.map((x) => (x.id === id ? next : x)); setMessages(msgRef.current); persist(db.putMessage(next));
    notifySync();
  }, [persist, notifySync]);
  const updateMessage = useCallback((id: string, patch: Partial<Message>) => {
    const cur = msgRef.current.find((x) => x.id === id); if (!cur) return;
    const next = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, expiresAt: cur.expiresAt, syncAt: Date.now() }; // lifetime can never be extended
    msgRef.current = msgRef.current.map((x) => (x.id === id ? next : x)); setMessages(msgRef.current); persist(db.putMessage(next));
    notifySync();
  }, [persist, notifySync]);
  const removeConversation = useCallback((id: string) => {
    const conv = convRef.current.find((c) => c.id === id);
    convRef.current = convRef.current.filter((c) => c.id !== id); setConversations(convRef.current);
    msgRef.current = msgRef.current.filter((m) => m.conversationId !== id); setMessages(msgRef.current); persist(db.deleteConversation(id));
    if (conv?.mode !== "local") addTomb("conv", id);
    notifySync();
  }, [persist, addTomb, notifySync]);
  const clearConversation = useCallback((id: string) => {
    const conv = convRef.current.find((c) => c.id === id);
    if (conv?.mode !== "local") for (const m of msgRef.current) if (m.conversationId === id) addTomb("msg", m.id);
    msgRef.current = msgRef.current.filter((m) => m.conversationId !== id); setMessages(msgRef.current); persist(db.clearConversation(id));
    notifySync();
  }, [persist, addTomb, notifySync]);
  const wipeLocal = useCallback(async () => {
    setMessages([]); setConversations([]); msgRef.current = []; convRef.current = [];
    try { await db.wipeAll(); } catch { setStorageError(true); }
  }, []);
  const exportBackup = useCallback(async (password: string) => {
    const text = await backup.exportBackup(password, { now: Date.now() });
    await db.setFlag("last-backup-at", Date.now());
    return text;
  }, []);
  const importBackup = useCallback(async (text: string, password: string, replaceIdentity: boolean) => {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new Error("err.backup.file"); }
    if (backup.isBackupFile(raw)) {
      const { payload, summary } = await backup.readBackup(text, password, Date.now());
      const r = await backup.restoreBackup(payload, { replaceIdentity, now: Date.now() });
      await reload();
      return { ...r, skipped: summary.skipped, legacy: false };
    }
    // Legacy v1 plaintext export: still importable, but the UI warns about it.
    const r = await db.importData(raw, Date.now());
    await reload();
    return { conversations: r.conversations, messages: r.messages, contacts: 0, skipped: r.skipped, identity: false, legacy: true };
  }, [reload]);

  const getSyncState = useCallback(async (): Promise<SyncState> => {
    const t = Date.now();
    // Local Mode notes stay on this browser, as the welcome screen promises.
    const conversations = convRef.current.filter((c) => c.mode !== "local");
    const ids = new Set(conversations.map((c) => c.id));
    return {
      conversations,
      messages: msgRef.current.filter((m) => m.expiresAt > t && ids.has(m.conversationId)),
      contacts: await db.getContacts(),
      tombstones: tombRef.current,
    };
  }, []);
  const mergeSyncSnapshot = useCallback(async (snap: SyncSnapshot) => {
    const mine = await getDeviceId();
    if (snap.device === mine) return false;
    const now = Date.now();
    const contacts = await db.getContacts();
    const local: SyncState = {
      conversations: convRef.current,
      messages: msgRef.current.filter((m) => m.expiresAt > now),
      contacts, tombstones: tombRef.current,
    };
    const { state: merged, changed } = mergeSync(local, snap, now);
    if (!changed) return false;

    const localConvs = new Map(local.conversations.map((c) => [c.id, c] as const));
    const localMsgs = new Map(local.messages.map((m) => [m.id, m] as const));
    const localContacts = new Map(local.contacts.map((c) => [c.id, c] as const));

    // Deletes first, so a put can never resurrect a tombstoned row.
    for (const t of merged.tombstones) {
      if (t.kind === "msg") {
        const cur = localMsgs.get(t.id);
        if (cur && t.at >= (cur.syncAt ?? cur.createdAt)) await db.deleteMessage(t.id);
      } else if (t.kind === "conv") {
        const cur = localConvs.get(t.id);
        if (cur && t.at >= (cur.syncAt ?? 0)) await db.deleteConversation(t.id);
      } else {
        const cur = localContacts.get(t.id);
        if (cur && t.at >= (cur.syncAt ?? cur.addedAt)) await db.deleteContact(t.id);
      }
    }

    const putConvs = merged.conversations.filter((c) => { const x = localConvs.get(c.id); return !x || (c.syncAt ?? 0) > (x.syncAt ?? 0); });
    const putMsgs = merged.messages.filter((m) => { const x = localMsgs.get(m.id); return !x || (m.syncAt ?? m.createdAt) > (x.syncAt ?? x.createdAt); });
    const putContacts = merged.contacts.filter((c) => { const x = localContacts.get(c.id); return !x || (c.syncAt ?? c.addedAt) > (x.syncAt ?? x.addedAt); });
    if (putConvs.length || putMsgs.length || putContacts.length) await db.putMany(putConvs, putMsgs, putContacts);

    tombRef.current = merged.tombstones;
    await db.setFlag("sync-tombstones", merged.tombstones);
    convRef.current = merged.conversations; setConversations(merged.conversations);
    msgRef.current = merged.messages; setMessages(merged.messages);
    notifySync();
    return true;
  }, [getDeviceId, notifySync]);
  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((s) => {
      const n = { ...s, ...patch };
      try { localStorage.setItem("q7.settings", JSON.stringify(n)); } catch {}
      return n;
    });
    if (patch.theme) try { localStorage.setItem("q7.theme", patch.theme); } catch {}
    if (patch.accent !== undefined) try { localStorage.setItem("q7.accent", patch.accent); } catch {}
  }, []);

  /* Spaces ("Alanlar"): local-only contact groups, persisted as a flag. */
  const mutateSpaces = useCallback((fn: (list: Space[]) => Space[]) => {
    setSpaces((prev) => {
      const n = fn(prev);
      void db.setFlag("spaces", n).catch(() => {});
      return n;
    });
  }, []);
  const createSpace = useCallback((name: string) => {
    const id = uid();
    mutateSpaces((l) => [...l, { id, name: name.trim().slice(0, 40) || "Space", hue: SPACE_HUES[Math.floor(Math.random() * SPACE_HUES.length)], members: [] }]);
    return id;
  }, [mutateSpaces]);
  const deleteSpace = useCallback((id: string) => mutateSpaces((l) => l.filter((s) => s.id !== id)), [mutateSpaces]);
  const renameSpace = useCallback((id: string, name: string) => mutateSpaces((l) => l.map((s) => (s.id === id ? { ...s, name: name.trim().slice(0, 40) || s.name } : s))), [mutateSpaces]);
  const spaceAdd = useCallback((id: string, contactId: string) => mutateSpaces((l) => l.map((s) => (s.id === id && !s.members.includes(contactId) ? { ...s, members: [...s.members, contactId].slice(0, 100) } : s))), [mutateSpaces]);
  const spaceRemove = useCallback((id: string, contactId: string) => mutateSpaces((l) => l.map((s) => (s.id === id ? { ...s, members: s.members.filter((m) => m !== contactId) } : s))), [mutateSpaces]);

  const live = useMemo(() => messages.filter((m) => m.expiresAt > now), [messages, now]);
  const peekConversations = useCallback(() => convRef.current, []);
  const peekMessages = useCallback(() => { const t = Date.now(); return msgRef.current.filter((m) => m.expiresAt > t); }, []);
  const value: Store = { ready, now, storageError, blobTick, bumpBlobs, conversations, messages: live, settings, createLocal, update, send, remove, createP2P, createGroup, addMessage, updateMessage, reactMessage, removeConversation, clearConversation, wipeLocal, exportBackup, importBackup, getSyncState, getDeviceId, mergeSyncSnapshot, setSyncNotifier, tombstoneSync, setSettings, peekConversations, peekMessages, spaces, createSpace, deleteSpace, renameSpace, spaceAdd, spaceRemove };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
