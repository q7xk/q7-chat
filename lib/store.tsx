"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Attachment, Conversation, LinkMeta, Message, Settings } from "./types";
import { LIFETIME_MS } from "./time";
import * as db from "./db";
import { useI18n } from "./i18n";

interface Store {
  ready: boolean; now: number; storageError: boolean; blobTick: number; bumpBlobs: () => void;
  conversations: Conversation[]; messages: Message[]; settings: Settings;
  createLocal: (title: string) => string;
  update: (id: string, patch: Partial<Conversation>) => void;
  send: (conversationId: string, body: string, link?: LinkMeta, replyToId?: string, att?: Attachment, blob?: Blob) => void;
  remove: (messageId: string) => void;
  createP2P: (contactId: string, title: string) => string;
  addMessage: (m: Message, blob?: Blob) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  removeConversation: (id: string) => void;
  wipeLocal: () => Promise<void>;
  exportLocal: () => Promise<string>;
  importLocal: (text: string) => Promise<{ conversations: number; messages: number; skipped: number }>;
  setSettings: (patch: Partial<Settings>) => void;
}
const Ctx = createContext<Store | null>(null);
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error("StoreProvider missing"); return s; };

// crypto.randomUUID needs a secure context; fall back so http://<lan-ip> still works on a phone.
const uid = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};
const mk = (conversationId: string, body: string, link?: LinkMeta, replyToId?: string, att?: Attachment): Message => {
  const createdAt = Date.now();
  return { id: uid(), conversationId, body, createdAt, expiresAt: createdAt + LIFETIME_MS, link, replyToId, att };
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
  const [settings, setSettingsState] = useState<Settings>({ theme: "dark", previews: "ask" });
  const convRef = useRef(conversations); convRef.current = conversations;
  const msgRef = useRef(messages); msgRef.current = messages;
  const started = useRef(false);

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
      } catch {
        setStorageError(true);
        const c: Conversation = { id: uid(), mode: "local", title: tRef.current("welcome.title"), pinned: false, muted: false, archived: false, unread: 0 };
        setConversations([c]); setMessages([mk(c.id, tRef.current("welcome.text"))]);
      }
      try { const th = localStorage.getItem("q7.theme"); if (th === "light" || th === "dark") setSettingsState((s) => ({ ...s, theme: th })); } catch {}
      setNow(Date.now()); setReady(true);
    })();
  }, [reload]);

  useEffect(() => { document.documentElement.dataset.theme = settings.theme; }, [settings.theme]);

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
    const c: Conversation = { id: uid(), mode: "local", title: title.trim() || "Untitled", pinned: false, muted: false, archived: false, unread: 0 };
    setConversations((x) => [...x, c]); persist(db.putConversation(c));
    return c.id;
  }, [persist]);
  const update = useCallback((id: string, patch: Partial<Conversation>) => {
    const cur = convRef.current.find((x) => x.id === id); if (!cur) return;
    const next = { ...cur, ...patch };
    setConversations((c) => c.map((x) => (x.id === id ? next : x))); persist(db.putConversation(next));
  }, [persist]);
  const send = useCallback((cid: string, body: string, link?: LinkMeta, replyToId?: string, att?: Attachment, blob?: Blob) => {
    const m = mk(cid, body, link, replyToId, att);
    setNow(Date.now()); msgRef.current = [...msgRef.current, m]; setMessages(msgRef.current);
    persist((async () => { if (blob) await db.putBlob({ id: m.id, blob, expiresAt: m.expiresAt }); await db.putMessage(m); setBlobTick((x) => x + 1); })());
  }, [persist]);
  const remove = useCallback((id: string) => { msgRef.current = msgRef.current.filter((x) => x.id !== id); setMessages(msgRef.current); persist(db.deleteMessage(id)); }, [persist]);
  const createP2P = useCallback((contactId: string, title: string) => {
    const ex = convRef.current.find((c) => c.contactId === contactId); if (ex) return ex.id;
    const c: Conversation = { id: uid(), mode: "p2p", contactId, title: title.slice(0, 60) || "Contact", pinned: false, muted: false, archived: false, unread: 0 };
    convRef.current = [...convRef.current, c]; setConversations(convRef.current); persist(db.putConversation(c));
    return c.id;
  }, [persist]);
  const addMessage = useCallback((m: Message, blob?: Blob) => {
    if (msgRef.current.some((x) => x.id === m.id)) return;
    msgRef.current = [...msgRef.current, m]; setMessages(msgRef.current); setNow(Date.now());
    persist((async () => { if (blob) await db.putBlob({ id: m.id, blob, expiresAt: m.expiresAt }); await db.putMessage(m); setBlobTick((x) => x + 1); })());
  }, [persist]);
  const updateMessage = useCallback((id: string, patch: Partial<Message>) => {
    const cur = msgRef.current.find((x) => x.id === id); if (!cur) return;
    const next = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, expiresAt: cur.expiresAt }; // lifetime can never be extended
    msgRef.current = msgRef.current.map((x) => (x.id === id ? next : x)); setMessages(msgRef.current); persist(db.putMessage(next));
  }, [persist]);
  const removeConversation = useCallback((id: string) => {
    convRef.current = convRef.current.filter((c) => c.id !== id); setConversations(convRef.current);
    msgRef.current = msgRef.current.filter((m) => m.conversationId !== id); setMessages(msgRef.current); persist(db.deleteConversation(id));
  }, [persist]);
  const wipeLocal = useCallback(async () => {
    setMessages([]); setConversations([]); msgRef.current = []; convRef.current = [];
    try { await db.wipeAll(); } catch { setStorageError(true); }
  }, []);
  const exportLocal = useCallback(async () => JSON.stringify(await db.exportData(Date.now()), null, 2), []);
  const importLocal = useCallback(async (text: string) => {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new Error("That file is not valid JSON."); }
    const r = await db.importData(raw, Date.now());
    await reload();
    return r;
  }, [reload]);
  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((s) => ({ ...s, ...patch }));
    if (patch.theme) try { localStorage.setItem("q7.theme", patch.theme); } catch {}
  }, []);

  const live = useMemo(() => messages.filter((m) => m.expiresAt > now), [messages, now]);
  const value: Store = { ready, now, storageError, blobTick, bumpBlobs, conversations, messages: live, settings, createLocal, update, send, remove, createP2P, addMessage, updateMessage, removeConversation, wipeLocal, exportLocal, importLocal, setSettings };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
