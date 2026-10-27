"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Clock, MessageSquareDashed, Pencil, Reply, ShieldCheck, Smile, Trash2, Wifi, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { INLINE_MAX } from "@/lib/p2p/manager";
import { memberName } from "@/lib/names";
import { extractUrls, splitBody } from "@/lib/links";
import { cn } from "@/lib/cn";
import type { Attachment, Message } from "@/lib/types";
import { Avatar, ModeBadge } from "./Badges";
import { AttachmentView } from "./Cards";
import { Composer } from "./Composer";
import { ChatMenu, wallStyle } from "./ChatMenu";
import { CopyButton, LinkCard } from "./LinkCard";
import { Logo } from "./Logo";

/** Google-Chat-style quick reactions. */
const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function Body({ m }: { m: Message }) {
  const cards = m.link ? [m.link] : extractUrls(m.body).map((url) => ({ url }));
  return (
    <>
      {m.body && (
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          {splitBody(m.body).map((s, i) => s.type === "url"
            ? <a key={i} href={s.value} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">{s.value}</a>
            : <span key={i}>{s.value.split(/(@[\p{L}\d_]+)/u).map((part, j) => part.startsWith("@")
              ? <span key={j} className="font-semibold text-accent">{part}</span>
              : <span key={j}>{part}</span>)}</span>)}
        </p>
      )}
      {cards.map((l) => <LinkCard key={l.url} link={l} />)}
    </>
  );
}

export function Thread({ conversationId, onBack }: { conversationId: string | null; onBack: () => void }) {
  const { conversations, messages, now, update, send, remove, updateMessage } = useStore();
  const { t, dur } = useI18n(); const { mgr, snap } = useP2P();
  const [replyId, setReplyId] = useState<string | null>(null);
  const [reactId, setReactId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const conv = conversations.find((c) => c.id === conversationId);
  const list = messages.filter((m) => m.conversationId === conversationId);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [list.length, conversationId]);
  useEffect(() => { setReplyId(null); setReactId(null); setEditId(null); mgr.setActive(conversationId); return () => mgr.setActive(null); }, [conversationId, mgr]);
  useEffect(() => { if (conv && conv.unread > 0) update(conv.id, { unread: 0 }); }, [conv, list.length, update]);
  useEffect(() => { if (conv && conv.mode !== "local") mgr.markRead(conv.id); }, [conv, list.length, mgr]); // read receipts

  if (!conv) return <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center text-muted"><Logo /><div className="flex items-center gap-2 text-sm"><MessageSquareDashed size={18} aria-hidden />{t("chats.pick")}</div></div>;

  const group = conv.mode === "group";
  const p2p = conv.mode === "p2p" && !!conv.contactId;
  const contact = p2p ? snap.contacts.find((c) => c.id === conv.contactId) : undefined;
  const state = conv.contactId ? snap.status[conv.contactId] ?? "offline" : "offline";
  const viaRelay = p2p && snap.modes[conv.contactId!] === "relay" ? " · " + t("thread.relay") : "";
  const members = group ? conv.members ?? [] : [];
  const nameOf = (fp: string | undefined) => memberName(conv, fp, snap.contacts, t("group.unknown"));
  const replyTo = list.find((m) => m.id === replyId);
  const statusText = { queued: t("thread.queued"), sent: t("thread.sent"), delivered: t("thread.delivered"), seen: t("thread.seen") } as const;
  const sendAtt = (att: Attachment, blob?: Blob) => {
    if (group) mgr.sendGroup(conv.id, "", att, blob, replyId ?? undefined);
    else if (p2p) mgr.sendRich(conv.contactId!, "", att, blob, replyId ?? undefined);
    else send(conv.id, "", undefined, replyId ?? undefined, att, blob);
    setReplyId(null);
  };
  const onSend = (body: string) => {
    if (group) mgr.sendGroup(conv.id, body, undefined, undefined, replyId ?? undefined);
    else if (p2p) mgr.sendText(conv.contactId!, body, undefined, replyId ?? undefined);
    else send(conv.id, body, undefined, replyId ?? undefined);
    setReplyId(null);
  };
  const vote = (m: Message, choices: number[]) => {
    if (m.att?.t !== "poll") return;
    if (group) mgr.voteIn(conv.id, m.id, choices);
    else if (p2p) mgr.vote(conv.contactId!, m.id, choices); else updateMessage(m.id, { att: { ...m.att, votes: { ...m.att.votes, local: choices } } });
  };
  const saveEdit = (m: Message) => {
    const b = editBody.trim(); setEditId(null);
    if (!b || b === m.body) return;
    if (m.direction === "out" && conv.mode !== "local") mgr.editMessage(conv.id, m.id, b); else updateMessage(m.id, { body: b, editedAt: Date.now() });
  };

  return (
    <>
      <header className="flex items-center gap-3 px-4 py-3">
        <button onClick={onBack} aria-label={t("thread.back")} className="m3-press rounded-full p-2 text-muted hover:bg-raised md:hidden"><ChevronLeft size={18} className="rtl:-scale-x-100" /></button>
        <Avatar title={contact?.name ?? conv.title} mode={conv.mode} photo={contact?.photo} hue={conv.hue} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 truncate text-lg font-semibold tracking-tight">{contact?.name ?? conv.title}{contact?.verified && <ShieldCheck size={15} className="shrink-0 text-accent" aria-label={t("thread.verified")} />}</h2>
          <div className="flex items-center gap-2">
            <ModeBadge mode={conv.mode} long />
            {group && <span className="text-xs text-muted">{t("group.members", { n: members.length })}</span>}
            {p2p && <span className={cn("inline-flex items-center gap-1.5 text-xs", state === "online" ? "text-accent" : "text-muted")}><span className={cn("h-2 w-2 rounded-full", state === "online" ? "bg-accent" : state === "connecting" ? "animate-pulse bg-local" : "bg-line")} />{state === "online" ? t("thread.online") + viaRelay : state === "connecting" ? t("thread.connecting") : t("thread.offline") + viaRelay}</span>}
          </div>
        </div>
        {p2p && state === "offline" && <button onClick={() => mgr.connectNow(conv.contactId!)} className="m3-press inline-flex items-center gap-2 rounded-full bg-sc px-4 py-2 text-sm font-medium text-onsc hover:brightness-110"><Wifi size={14} />{t("thread.connect")}</button>}
        <ChatMenu conv={conv} contact={contact} p2p={p2p} onOpenConv={onBack} />
      </header>
      <p className="mx-4 rounded-2xl bg-tc px-4 py-3 text-sm leading-relaxed text-ontc">{group ? t("thread.noteGroup") : p2p ? t("thread.noteP2P") : t("thread.noteLocal")}</p>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scroll-thin" role="log" aria-label={contact?.name ?? conv.title} style={{ backgroundImage: wallStyle(conv.wall) }}>
        {list.length === 0 && <p className="pt-10 text-center text-sm text-muted">{t("thread.empty")}</p>}
        {list.map((m, i) => {
          const incoming = m.direction === "in"; const parent = m.replyToId ? list.find((x) => x.id === m.replyToId) : undefined;
          const mine = m.direction === "out";
          const editing = editId === m.id;
          const deletable = mine && conv.mode !== "local";
          const editable = mine && !m.att && !m.link?.title;
          return (
            <div key={m.id} style={{ animationDelay: `${Math.min(list.length - 1 - i, 9) * 25}ms` }} className={cn("m3-msg group max-w-[min(34rem,90%)]", incoming ? "me-auto" : "ms-auto")}>
              {group && incoming && <p className="mb-0.5 ms-2 truncate text-[11px] font-semibold text-muted">{nameOf(m.from)}</p>}
              <div className={cn("space-y-2 rounded-3xl px-4 py-3", incoming ? "rounded-es-md bg-highest text-ink" : "rounded-ee-md bg-pc text-onpc")}>
                {m.replyToId && <p className="truncate rounded-lg border-s-4 border-current bg-black/10 py-1 ps-2 text-xs opacity-80">{parent ? parent.body || parent.link?.title || t("chats.link") : t("thread.gone")}</p>}
                {editing ? (
                  <div className="space-y-2">
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} maxLength={4000} autoFocus aria-label={t("thread.edit")}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(m); } if (e.key === "Escape") setEditId(null); }}
                      className="w-full resize-none rounded-xl bg-tc px-3 py-2 text-[15px] text-ink focus-visible:outline-none" />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditId(null)} aria-label={t("c.cancel")} className="m3-press rounded-full p-1.5 hover:bg-black/10"><X size={15} /></button>
                      <button onClick={() => saveEdit(m)} aria-label={t("c.save")} className="m3-press rounded-full bg-accent p-1.5 text-bg"><Check size={15} /></button>
                    </div>
                  </div>
                ) : <Body m={m} />}
                {m.att && <AttachmentView m={m} p2p={p2p || group} onVote={(c) => vote(m, c)} />}
              </div>
              {m.reactions && Object.keys(m.reactions).length > 0 && (
                <div className={cn("mt-1 flex flex-wrap gap-1", incoming ? "justify-start" : "justify-end")}>
                  {Object.entries(m.reactions).map(([e, who]) => (
                    <button key={e} onClick={() => { if (conv.mode !== "local") mgr.react(conv.id, m.id, e); }} aria-label={t("thread.react")}
                      className={cn("m3-press flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", who.includes(snap.fp) ? "bg-accent/20 text-accent" : "bg-tc text-ontc")}>
                      <span>{e}</span><span className="tabular-nums">{who.length}</span>
                    </button>
                  ))}
                </div>
              )}
              {reactId === m.id && (
                <div className={cn("m3-pop mt-1 flex gap-0.5 rounded-full bg-raised px-1.5 py-1", incoming ? "justify-start" : "justify-end")}>
                  {QUICK.map((e) => (
                    <button key={e} onClick={() => { if (conv.mode !== "local") mgr.react(conv.id, m.id, e); setReactId(null); }} className="m3-press rounded-full px-1.5 py-0.5 text-lg hover:bg-tc">{e}</button>
                  ))}
                </div>
              )}
              <div className={cn("mt-1 flex items-center gap-1 text-[11px] text-muted", incoming ? "justify-start" : "justify-end")}>
                <Clock size={11} aria-hidden /><span>{t("thread.expires", { time: dur(m.expiresAt - now) })}</span>
                {m.editedAt && <span className="ms-0.5 italic opacity-80">· {t("thread.edited")}</span>}
                {!incoming && m.status && <span className="ms-1">· {statusText[m.status]}</span>}
                <span className="ms-2 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                  <button onClick={() => setReactId(reactId === m.id ? null : m.id)} aria-label={t("thread.react")} className="m3-press rounded-full p-1.5 hover:bg-raised hover:text-ink"><Smile size={14} /></button>
                  <button onClick={() => setReplyId(m.id)} aria-label={t("thread.reply")} className="m3-press rounded-full p-1.5 hover:bg-raised hover:text-ink"><Reply size={14} className="rtl:-scale-x-100" /></button>
                  {editable && <button onClick={() => { setEditId(m.id); setEditBody(m.body); }} aria-label={t("thread.edit")} className="m3-press rounded-full p-1.5 hover:bg-raised hover:text-ink"><Pencil size={14} /></button>}
                  {m.body && <CopyButton text={m.body} />}
                  <button onClick={() => { if (deletable) mgr.retract(conv.id, m.id); else remove(m.id); }} aria-label={deletable ? t("thread.deleteAll") : t("thread.delete")} className="m3-press rounded-full p-1.5 hover:bg-raised hover:text-danger"><Trash2 size={14} /></button>
                </span>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <Composer replyTo={replyTo} onCancelReply={() => setReplyId(null)} onAttach={sendAtt} maxFile={group ? INLINE_MAX - 8 * 1024 : undefined} onSend={onSend} />
    </>
  );
}
