"use client";
import { useMemo, useState } from "react";
import { BellOff, Clock, Pin, Plus, Search, UserPlus, MessageSquarePlus } from "lucide-react";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { cn } from "@/lib/cn";
import { Avatar, ModeBadge } from "./Badges";

type Filter = "all" | "unread" | "archived";

export function ChatList({ activeId, onOpen, onAdd }: { activeId: string | null; onOpen: (id: string) => void; onAdd: () => void }) {
  const { conversations, messages, now, createLocal, ready, storageError } = useStore();
  const { t, dur, clock } = useI18n(); const { snap } = useP2P();
  const [q, setQ] = useState(""); const [f, setF] = useState<Filter>("all"); const [menu, setMenu] = useState(false); const [adding, setAdding] = useState(false); const [title, setTitle] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return conversations
      .map((c) => { const contact = c.contactId ? snap.contacts.find((x) => x.id === c.contactId) : undefined; const msgs = messages.filter((m) => m.conversationId === c.id);
        return { c, name: contact?.name ?? c.title, photo: contact?.photo, msgs, last: msgs[msgs.length - 1], next: msgs.reduce<number | null>((a, m) => (a === null || m.expiresAt < a ? m.expiresAt : a), null) }; })
      .filter(({ c }) => (f === "archived" ? c.archived : !c.archived) && (f !== "unread" || c.unread > 0))
      .filter(({ name, msgs }) => !term || name.toLowerCase().includes(term) || msgs.some((m) => m.body.toLowerCase().includes(term)))
      .sort((a, b) => Number(b.c.pinned) - Number(a.c.pinned) || (b.last?.createdAt ?? 0) - (a.last?.createdAt ?? 0));
  }, [conversations, messages, q, f, snap.contacts]);

  const preview = (m?: (typeof messages)[number], mine = false) => {
    if (!m) return t("chats.noMessages");
    const a = m.att; const body = m.body || (a?.t === "poll" ? `📊 ${a.q}` : a?.t === "event" ? `📅 ${a.title}` : a?.t === "location" ? "📍" : a?.t === "contact" ? `👤 ${a.name}` : a?.t === "file" ? `${a.kind === "image" ? "🖼" : "📄"} ${a.name}` : m.link?.title || t("chats.link"));
    return (mine ? t("chats.you") + ": " : "") + body;
  };

  return (
    <>
      {storageError && <p role="alert" className="mx-4 mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm leading-relaxed text-danger">{t("err.save")}</p>}
      <header className="space-y-4 p-4 pb-2">
        <div className="relative flex items-center justify-between">
          <h1 className="px-1 text-[28px] font-semibold leading-9 tracking-tight">{t("nav.chats")}</h1>
          <button onClick={() => setMenu((v) => !v)} aria-label={t("chats.newLocal")} aria-expanded={menu} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pc text-onpc transition-[border-radius] duration-300 ease-spring hover:rounded-full"><Plus size={22} /></button>
          {menu && (
            <div className="absolute end-0 top-14 z-10 w-60 space-y-1 rounded-3xl bg-highest p-2 shadow-lg">
              <button onClick={() => { setMenu(false); setAdding(true); }} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start text-sm hover:bg-container"><MessageSquarePlus size={18} />{t("chats.newLocal")}</button>
              <button onClick={() => { setMenu(false); onAdd(); }} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start text-sm hover:bg-container"><UserPlus size={18} />{t("chats.addContact")}</button>
            </div>
          )}
        </div>
        {adding && (
          <form onSubmit={(e) => { e.preventDefault(); onOpen(createLocal(title)); setTitle(""); setAdding(false); }} className="flex gap-2">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={t("chats.localName")} aria-label={t("chats.localName")} className="min-w-0 flex-1 rounded-2xl bg-highest px-4 py-3 text-sm" />
            <button className="rounded-full bg-pc px-5 text-sm font-medium text-onpc">{t("c.save")}</button>
          </form>
        )}
        <label className="relative block">
          <Search size={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("chats.search")} aria-label={t("chats.search")} className="w-full rounded-full bg-highest py-3.5 pe-4 ps-12 text-sm" />
        </label>
        <div className="flex gap-1.5" role="group">
          {(["all", "unread", "archived"] as Filter[]).map((k) => (
            <button key={k} onClick={() => setF(k)} aria-pressed={f === k} className={cn("rounded-xl border px-4 py-1.5 text-sm font-medium transition-[border-radius,background-color] duration-300 ease-spring hover:rounded-full", f === k ? "border-transparent bg-sc text-onsc" : "border-line text-muted hover:bg-container")}>{t(`chats.${k}`)}</button>
          ))}
        </div>
      </header>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 scroll-thin">
        {rows.map(({ c, name, photo, last, next }) => (
          <li key={c.id}>
            <button onClick={() => onOpen(c.id)} aria-current={activeId === c.id} className={cn("flex w-full gap-3 px-3 py-3 text-start transition-[border-radius,background-color] duration-300 ease-spring", activeId === c.id ? "rounded-[28px] bg-sc text-onsc" : "rounded-2xl hover:rounded-[28px] hover:bg-container")}>
              <Avatar title={name} mode={c.mode} photo={photo} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-base font-medium">{name}</span>
                  {c.pinned && <Pin size={12} className="shrink-0 text-muted" />}{c.muted && <BellOff size={12} className="shrink-0 text-muted" />}
                  <span className="ms-auto shrink-0 text-xs text-muted">{last ? clock(last.createdAt, now) : ""}</span>
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted">{preview(last, last?.direction === "out" && c.mode === "p2p")}</span>
                <span className="mt-1.5 flex items-center gap-2">
                  <ModeBadge mode={c.mode} />
                  {next !== null && <span className="inline-flex items-center gap-1 text-[11px] text-muted"><Clock size={11} aria-hidden />{dur(next - now)}</span>}
                  {c.unread > 0 && <span className="ms-auto min-w-5 rounded-full bg-accent px-1.5 text-center text-xs font-semibold text-bg">{c.unread}</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
        {ready && rows.length === 0 && <li className="p-6 text-center text-sm text-muted">{conversations.length === 0 && f === "all" && !q ? t("chats.empty") : t("chats.emptyFilter")}</li>}
      </ul>
    </>
  );
}
