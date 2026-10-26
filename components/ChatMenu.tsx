"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive, ArrowLeftRight, Ban, Bell, BellOff, ChevronRight, Eraser, FileText, FolderOpen, Link2, Mic,
  MoreVertical, Palette, Phone, Pin, PinOff, Trash2, User as UserIcon, Video, Download,
} from "lucide-react";
import type { Conversation, Contact, LinkMeta, Message } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useI18n, type K } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { formatCode } from "@/lib/p2p/crypto";
import { extractUrls } from "@/lib/links";
import { cn } from "@/lib/cn";
import { Avatar } from "./Badges";

/** Chat wallpapers applied over the message list background. */
export const WALLS: { id: string; css: string }[] = [
  { id: "", css: "" },
  { id: "w1", css: "linear-gradient(160deg, rgb(var(--accent) / .14), transparent 55%)" },
  { id: "w2", css: "linear-gradient(20deg, rgb(var(--local) / .18), transparent 60%)" },
  { id: "w3", css: "linear-gradient(200deg, rgb(var(--pc) / .40), transparent 65%)" },
  { id: "w4", css: "radial-gradient(120% 90% at 15% 0%, rgb(var(--accent) / .22), transparent 60%)" },
  { id: "w5", css: "linear-gradient(315deg, rgb(var(--danger) / .12), transparent 55%)" },
  { id: "w6", css: "linear-gradient(135deg, rgb(var(--accent) / .12), rgb(var(--local) / .12))" },
];
export const wallStyle = (id?: string) => WALLS.find((w) => w.id === id)?.css || undefined;

const item = "m3-press flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start text-sm hover:bg-container";
const sheetWrap = "fixed inset-0 z-40 flex items-end justify-center bg-black/50 md:items-center";
const sheet = "m3-pop max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-panel p-5 scroll-thin md:rounded-[28px]";

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className={sheetWrap} role="dialog" aria-modal aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={sheet}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="close" className="rounded-full p-2 text-muted transition-colors hover:bg-container hover:text-ink">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function ChatMenu({ conv, contact, p2p }: { conv: Conversation; contact?: Contact; p2p: boolean }) {
  const { t } = useI18n(); const { mgr, snap } = useP2P();
  const { messages, update, clearConversation } = useStore();
  const [open, setOpen] = useState(false); const [more, setMore] = useState(false);
  const [panel, setPanel] = useState<null | "info" | "media" | "theme" | "clear">(null);
  const [toast, setToast] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const msgs = useMemo(() => messages.filter((m) => m.conversationId === conv.id), [messages, conv.id]);

  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) { setOpen(false); setMore(false); } };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setMore(false); } };
    document.addEventListener("pointerdown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("pointerdown", h); document.removeEventListener("keydown", k); };
  }, [open]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const call = async (video: boolean) => {
    setOpen(false);
    if (!conv.contactId) return;
    const ok = await mgr.placeCall(conv.contactId, video);
    if (!ok) flash(snap.status[conv.contactId] !== "online" ? t("thread.offline") : t("err.noMedia"));
  };
  const exportChat = () => {
    const name = (m: Message) => (m.direction === "in" ? contact?.name ?? conv.title : t("chats.you"));
    const body = (m: Message) => m.body || (m.att?.t === "file" ? (m.att.kind === "voice" ? "🎤" : m.att.kind === "image" ? "🖼" : `📄 ${m.att.name}`) : m.att?.t === "gif" ? "GIF" : m.att?.t === "poll" ? `📊 ${m.att.q}` : m.att?.t === "event" ? `📅 ${m.att.title}` : m.att?.t === "location" ? "📍" : m.att?.t === "contact" ? `👤 ${m.att.name}` : m.link?.title || t("chats.link"));
    const txt = msgs.map((m) => `[${new Date(m.createdAt).toLocaleString()}] ${name(m)}: ${body(m)}`).join("\n");
    const url = URL.createObjectURL(new Blob([txt], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${(contact?.name ?? conv.title).replace(/[^\w-]+/g, "_")}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const togglePin = () => update(conv.id, { pinned: !conv.pinned });
  const toggleArchive = () => { update(conv.id, { archived: !conv.archived }); setOpen(false); };
  const toggleMute = () => update(conv.id, { muted: !conv.muted });

  const cid = conv.contactId!;
  const online = snap.status[cid] === "online";
  const iconBtn = "rounded-full p-2.5 text-muted transition-colors hover:bg-raised hover:text-ink";

  return (
    <div ref={root} className="relative flex items-center gap-0.5">
      {toast && <p role="status" className="absolute end-0 -top-9 whitespace-nowrap rounded-full bg-highest px-3 py-1.5 text-xs shadow">{toast}</p>}
      {p2p && <>
        <button onClick={() => void call(true)} disabled={!online} aria-label={t("call.video")} title={t("call.video")} className={cn(iconBtn, !online && "opacity-40")}><Video size={19} /></button>
        <button onClick={() => void call(false)} disabled={!online} aria-label={t("call.audio")} title={t("call.audio")} className={cn(iconBtn, !online && "opacity-40")}><Phone size={19} /></button>
      </>}
      <button onClick={() => setOpen((v) => !v)} aria-label={t("menu.more")} aria-expanded={open} className={cn(iconBtn, open && "bg-raised text-ink")}><MoreVertical size={19} /></button>
      {open && (
        <div className="m3-pop absolute end-0 top-12 z-20 w-64 space-y-0.5 rounded-3xl bg-highest p-2 shadow-xl" role="menu">
          {p2p && <>
            <button role="menuitem" onClick={() => { setOpen(false); setPanel("info"); }} className={item}><UserIcon size={18} />{t("menu.contact")}</button>
            <button role="menuitem" onClick={() => void call(false)} className={item}><Phone size={18} />{t("menu.call")}</button>
          </>}
          <button role="menuitem" onClick={() => { setOpen(false); setPanel("media"); }} className={item}><FolderOpen size={18} />{t("menu.media")}</button>
          <button role="menuitem" onClick={toggleMute} className={item}>{conv.muted ? <Bell size={18} /> : <BellOff size={18} />}{conv.muted ? t("menu.unmute") : t("menu.mute")}</button>
          <button role="menuitem" onClick={() => { setOpen(false); setPanel("theme"); }} className={item}><Palette size={18} />{t("menu.theme")}</button>
          {p2p && <button role="menuitem" onClick={() => { setOpen(false); void mgr.blockContact(cid, !contact?.blocked); }} className={cn(item, !contact?.blocked && "text-danger")}>{contact?.blocked ? <ArrowLeftRight size={18} /> : <Ban size={18} />}{contact?.blocked ? t("menu.unblock") : t("menu.block")}</button>}
          <button role="menuitem" onClick={() => setMore((v) => !v)} aria-expanded={more} className={item}><ChevronRight size={18} className="rtl:-scale-x-100" />{t("menu.more")}</button>
          {more && (
            <div className="m3-pop space-y-0.5 rounded-2xl bg-container p-1.5" role="menu">
              <button role="menuitem" onClick={() => { setOpen(false); setPanel("clear"); }} className={item}><Eraser size={18} />{t("menu.clear")}</button>
              <button role="menuitem" onClick={() => { exportChat(); setOpen(false); }} className={item}><Download size={18} />{t("menu.export")}</button>
              <button role="menuitem" onClick={togglePin} className={item}>{conv.pinned ? <PinOff size={18} /> : <Pin size={18} />}{conv.pinned ? t("menu.unpin") : t("menu.pin")}</button>
              <button role="menuitem" onClick={toggleArchive} className={item}><Archive size={18} />{conv.archived ? t("menu.unarchive") : t("menu.archive")}</button>
            </div>
          )}
        </div>
      )}

      {panel === "info" && contact && <ContactSheet contact={contact} onClose={() => setPanel(null)} />}
      {panel === "media" && <MediaSheet conv={conv} contact={contact} msgs={msgs} onClose={() => setPanel(null)} />}
      {panel === "theme" && (
        <Sheet title={t("menu.theme")} onClose={() => setPanel(null)}>
          <div className="grid grid-cols-2 gap-3">
            {WALLS.map((w) => (
              <button key={w.id || "none"} onClick={() => { update(conv.id, { wall: w.id || undefined }); setPanel(null); }} aria-pressed={(conv.wall ?? "") === w.id}
                className={cn("m3-press flex h-24 items-end justify-start rounded-[28px] border-2 bg-bg p-2 text-xs transition-colors", (conv.wall ?? "") === w.id ? "border-accent" : "border-line hover:border-muted")}
                style={w.css ? { backgroundImage: w.css } : undefined}>
                <span className="rounded-full bg-highest px-2 py-0.5">{w.id ? w.id.toUpperCase() : "—"}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {panel === "clear" && (
        <Sheet title={t("menu.clear")} onClose={() => setPanel(null)}>
          <p className="text-sm leading-relaxed">{t("clear.ask")}</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { clearConversation(conv.id); setPanel(null); }} className="m3-press rounded-full bg-danger px-5 py-2 text-sm font-medium text-bg hover:brightness-110">{t("clear.yes")}</button>
            <button onClick={() => setPanel(null)} className="rounded-full px-5 py-2 text-sm text-muted transition-colors hover:bg-container">{t("c.cancel")}</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function ContactSheet({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { t } = useI18n(); const { mgr } = useP2P();
  const [name, setName] = useState(contact.name);
  const [askRemove, setAskRemove] = useState(false);
  return (
    <Sheet title={t("menu.contact")} onClose={onClose}>
      <div className="mb-5 flex items-center gap-4">
        <Avatar title={contact.name} mode="p2p" photo={contact.photo} size={64} shape="cookie12" />
        <div className="min-w-0"><p className="truncate text-lg font-semibold">{contact.name}</p>
          <p className="text-xs tabular-nums text-muted">{formatCode(contact.code)}</p>
          {contact.blocked && <p className="mt-1 text-xs font-medium text-danger">{t("info.blocked")}</p>}</div>
      </div>
      <label className="block space-y-1.5"><span className="text-xs text-muted">{t("set.name")}</span>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="min-w-0 flex-1 rounded-2xl bg-highest px-4 py-2.5 text-sm" />
          <button onClick={() => void mgr.renameContact(contact.id, name)} className="m3-press rounded-full bg-sc px-4 py-2 text-sm font-medium text-onsc hover:brightness-110">{t("c.save")}</button>
        </div></label>
      <button onClick={() => void mgr.setVerified(contact.id, !contact.verified)} aria-pressed={contact.verified} className="mt-4 flex w-full items-center justify-between rounded-2xl bg-container px-4 py-3 text-sm transition-colors hover:bg-raised">
        <span>{t("contacts.verify")}</span><span className={cn("h-5 w-5 rounded-full border-2", contact.verified ? "border-accent bg-accent text-bg" : "border-line")}>{contact.verified && "✓"}</span>
      </button>
      <div className="mt-2 space-y-2">
        <button onClick={() => void mgr.blockContact(contact.id, !contact.blocked)} className={cn("flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors hover:bg-container", !contact.blocked && "text-danger")}>
          <Ban size={18} />{contact.blocked ? t("menu.unblock") : t("menu.block")}</button>
        {contact.blocked && <p className="px-1 text-xs text-muted">{t("info.blockedNote")}</p>}
      </div>
      {!askRemove ? (
        <button onClick={() => setAskRemove(true)} className="mt-2 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-danger transition-colors hover:bg-container"><Trash2 size={18} />{t("c.remove")}</button>
      ) : (
        <div className="mt-2 rounded-2xl bg-danger/10 p-4">
          <p className="text-sm">{t("contacts.removeAsk")}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { void mgr.removeContact(contact.id); onClose(); }} className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-bg">{t("c.remove")}</button>
            <button onClick={() => setAskRemove(false)} className="rounded-full px-4 py-2 text-sm text-muted">{t("c.cancel")}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function MediaSheet({ conv, contact, msgs, onClose }: { conv: Conversation; contact?: Contact; msgs: Message[]; onClose: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"media" | "links" | "docs">("media");
  const media = msgs.filter((m) => m.att && (m.att.t === "gif" || (m.att.t === "file" && (m.att.kind === "image" || m.att.kind === "voice"))));
  const links = msgs.flatMap((m): LinkMeta[] => m.link ? [m.link] : extractUrls(m.body).map((u) => ({ url: u })));
  const docs = msgs.filter((m) => m.att?.t === "file" && m.att.kind === "document");
  const tabBtn = (id: typeof tab) => cn("rounded-xl px-4 py-2 text-sm font-medium transition-colors", tab === id ? "bg-sc text-onsc" : "text-muted hover:bg-container");
  return (
    <Sheet title={t("menu.media")} onClose={onClose}>
      <div className="mb-4 flex gap-1.5" role="tablist">
        <button role="tab" aria-selected={tab === "media"} onClick={() => setTab("media")} className={tabBtn("media")}>{t("media.images")}</button>
        <button role="tab" aria-selected={tab === "links"} onClick={() => setTab("links")} className={tabBtn("links")}>{t("media.links")}</button>
        <button role="tab" aria-selected={tab === "docs"} onClick={() => setTab("docs")} className={tabBtn("docs")}>{t("media.docs")}</button>
      </div>
      {tab === "media" && (
        <div className="grid grid-cols-3 gap-2">
          {media.map((m) => {
            const a = m.att;
            if (!a) return null;
            return a.t === "gif" ? (
              <a key={m.id} href={a.url} target="_blank" rel="noopener noreferrer" className="m3-press block overflow-hidden rounded-2xl bg-container hover:brightness-110">
                {/* eslint-disable-next-line @next/next/no-img-element */}<img src={a.url} alt="GIF" loading="lazy" className="h-24 w-full object-cover" /></a>
            ) : a.t === "file" && a.kind === "voice" ? (
              <span key={m.id} className="flex h-24 items-center justify-center gap-1.5 rounded-2xl bg-container text-xs text-muted"><Mic size={16} />{t("composer.voice")}</span>
            ) : (
              <MediaBlob key={m.id} id={m.id} />
            );
          })}
        </div>
      )}
      {tab === "links" && (
        <ul className="space-y-2">
          {links.map((l, i) => (
            <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 rounded-2xl bg-container px-4 py-3 text-sm transition-colors hover:bg-raised">
              <Link2 size={16} className="shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate">{l.title || l.url}</span></a></li>
          ))}
        </ul>
      )}
      {tab === "docs" && (
        <ul className="space-y-2">
          {docs.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-container px-4 py-3 text-sm"><FileText size={16} className="shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate">{m.att?.t === "file" ? m.att.name : ""}</span></li>
          ))}
        </ul>
      )}
      {((tab === "media" && media.length === 0) || (tab === "links" && links.length === 0) || (tab === "docs" && docs.length === 0)) && (
        <p className="py-6 text-center text-sm text-muted">{t("media.empty")}</p>
      )}
      <p className="mt-4 text-center text-[10px] text-muted">{contact?.name ?? conv.title}</p>
    </Sheet>
  );
}

function MediaBlob({ id }: { id: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let live = true; import("@/lib/db").then((db) => db.getBlob(id)).then((r) => { if (live && r) setUrl(URL.createObjectURL(r.blob)); }).catch(() => {}); return () => { live = false; }; }, [id]);
  if (!url) return <span className="h-24 animate-pulse rounded-2xl bg-container" />;
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={url} alt="" className="h-24 w-full rounded-2xl object-cover" />;
}
