"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Clock, MessageSquareDashed, Reply, ShieldCheck, Trash2, Wifi } from "lucide-react";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { extractUrls, splitBody } from "@/lib/links";
import { cn } from "@/lib/cn";
import type { Attachment, Message } from "@/lib/types";
import { Avatar, ModeBadge } from "./Badges";
import { AttachmentView } from "./Cards";
import { Composer } from "./Composer";
import { ChatMenu, wallStyle } from "./ChatMenu";
import { CopyButton, LinkCard } from "./LinkCard";
import { Logo } from "./Logo";

function Body({ m }: { m: Message }) {
  const cards = m.link ? [m.link] : extractUrls(m.body).map((url) => ({ url }));
  return (
    <>
      {m.body && (
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          {splitBody(m.body).map((s, i) => s.type === "url"
            ? <a key={i} href={s.value} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">{s.value}</a>
            : <span key={i}>{s.value}</span>)}
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
  const end = useRef<HTMLDivElement>(null);
  const conv = conversations.find((c) => c.id === conversationId);
  const list = messages.filter((m) => m.conversationId === conversationId);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [list.length, conversationId]);
  useEffect(() => { setReplyId(null); mgr.setActive(conversationId); return () => mgr.setActive(null); }, [conversationId, mgr]);
  useEffect(() => { if (conv && conv.unread > 0) update(conv.id, { unread: 0 }); }, [conv, list.length, update]);

  if (!conv) return <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center text-muted"><Logo /><div className="flex items-center gap-2 text-sm"><MessageSquareDashed size={18} aria-hidden />{t("chats.pick")}</div></div>;

  const p2p = conv.mode === "p2p" && !!conv.contactId;
  const contact = p2p ? snap.contacts.find((c) => c.id === conv.contactId) : undefined;
  const state = conv.contactId ? snap.status[conv.contactId] ?? "offline" : "offline";
  const viaRelay = p2p && snap.modes[conv.contactId!] === "relay" ? " · " + t("thread.relay") : "";
  const replyTo = list.find((m) => m.id === replyId);
  const statusText = { queued: t("thread.queued"), sent: t("thread.sent"), delivered: t("thread.delivered") } as const;
  const sendAtt = (att: Attachment, blob?: Blob) => { if (p2p) mgr.sendRich(conv.contactId!, "", att, blob, replyId ?? undefined); else send(conv.id, "", undefined, replyId ?? undefined, att, blob); setReplyId(null); };
  const vote = (m: Message, choices: number[]) => {
    if (m.att?.t !== "poll") return;
    if (p2p) mgr.vote(conv.contactId!, m.id, choices); else updateMessage(m.id, { att: { ...m.att, votes: { ...m.att.votes, local: choices } } });
  };

  return (
    <>
      <header className="flex items-center gap-3 px-4 py-3">
        <button onClick={onBack} aria-label={t("thread.back")} className="m3-press rounded-full p-2 text-muted hover:bg-raised md:hidden"><ChevronLeft size={18} className="rtl:-scale-x-100" /></button>
        <Avatar title={contact?.name ?? conv.title} mode={conv.mode} photo={contact?.photo} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 truncate text-lg font-semibold tracking-tight">{contact?.name ?? conv.title}{contact?.verified && <ShieldCheck size={15} className="shrink-0 text-accent" aria-label={t("thread.verified")} />}</h2>
          <div className="flex items-center gap-2">
            <ModeBadge mode={conv.mode} long />
            {p2p && <span className={cn("inline-flex items-center gap-1.5 text-xs", state === "online" ? "text-accent" : "text-muted")}><span className={cn("h-2 w-2 rounded-full", state === "online" ? "bg-accent" : state === "connecting" ? "animate-pulse bg-local" : "bg-line")} />{state === "online" ? t("thread.online") + viaRelay : state === "connecting" ? t("thread.connecting") : t("thread.offline") + viaRelay}</span>}
          </div>
        </div>
        {p2p && state === "offline" && <button onClick={() => mgr.connectNow(conv.contactId!)} className="m3-press inline-flex items-center gap-2 rounded-full bg-sc px-4 py-2 text-sm font-medium text-onsc hover:brightness-110"><Wifi size={14} />{t("thread.connect")}</button>}
        <ChatMenu conv={conv} contact={contact} p2p={p2p} />
      </header>
      <p className="mx-4 rounded-2xl bg-tc px-4 py-3 text-sm leading-relaxed text-ontc">{p2p ? t("thread.noteP2P") : t("thread.noteLocal")}</p>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scroll-thin" role="log" aria-label={contact?.name ?? conv.title} style={{ backgroundImage: wallStyle(conv.wall) }}>
        {list.length === 0 && <p className="pt-10 text-center text-sm text-muted">{t("thread.empty")}</p>}
        {list.map((m, i) => {
          const incoming = m.direction === "in"; const parent = m.replyToId ? list.find((x) => x.id === m.replyToId) : undefined;
          return (
            <div key={m.id} style={{ animationDelay: `${Math.min(list.length - 1 - i, 9) * 25}ms` }} className={cn("m3-msg group max-w-[min(34rem,90%)]", incoming ? "me-auto" : "ms-auto")}>
              <div className={cn("space-y-2 rounded-3xl px-4 py-3", incoming ? "rounded-es-md bg-highest text-ink" : "rounded-ee-md bg-pc text-onpc")}>
                {m.replyToId && <p className="truncate rounded-lg border-s-4 border-current bg-black/10 py-1 ps-2 text-xs opacity-80">{parent ? parent.body || parent.link?.title || t("chats.link") : t("thread.gone")}</p>}
                <Body m={m} />
                {m.att && <AttachmentView m={m} p2p={p2p} onVote={(c) => vote(m, c)} />}
              </div>
              <div className={cn("mt-1 flex items-center gap-1 text-[11px] text-muted", incoming ? "justify-start" : "justify-end")}>
                <Clock size={11} aria-hidden /><span>{t("thread.expires", { time: dur(m.expiresAt - now) })}</span>
                {p2p && !incoming && m.status && <span className="ms-1">· {statusText[m.status]}</span>}
                <span className="ms-2 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                  <button onClick={() => setReplyId(m.id)} aria-label={t("thread.reply")} className="m3-press rounded-full p-1.5 hover:bg-raised hover:text-ink"><Reply size={14} className="rtl:-scale-x-100" /></button>
                  {m.body && <CopyButton text={m.body} />}
                  <button onClick={() => remove(m.id)} aria-label={t("thread.delete")} className="m3-press rounded-full p-1.5 hover:bg-raised hover:text-danger"><Trash2 size={14} /></button>
                </span>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <Composer replyTo={replyTo} onCancelReply={() => setReplyId(null)} onAttach={sendAtt}
        onSend={(body) => { if (p2p) mgr.sendText(conv.contactId!, body, undefined, replyId ?? undefined); else send(conv.id, body, undefined, replyId ?? undefined); setReplyId(null); }} />
    </>
  );
}
