"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AtSign, MessageSquare, Plus, Star, StarOff, Trash2, UserPlus } from "lucide-react";
import type { Contact, Message, Space } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { cn } from "@/lib/cn";
import { Avatar, clipShape } from "./Badges";
import { btn, field } from "./Connect";
import { Box, Page } from "./ui";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const summary = (m: Message | undefined, link: string) =>
  !m ? "" : m.body || (m.att?.t === "poll" ? `📊 ${m.att.q}` : m.att?.t === "event" ? `📅 ${m.att.title}` : m.att?.t === "location" ? "📍" : m.att?.t === "contact" ? `👤 ${m.att.name}` : m.att?.t === "gif" ? "GIF" : m.att?.t === "file" ? (m.att.kind === "voice" ? "🎤" : m.att.kind === "image" ? "🖼" : `📄 ${m.att.name}`) : m.link?.title || link);

/* ---------- Bahsetmeler: incoming messages that call me by name ---------- */
export function MentionsPanel({ onOpenChat }: { onOpenChat: (id: string) => void }) {
  const { messages, conversations, now } = useStore();
  const { snap } = useP2P(); const { t, clock } = useI18n();
  const me = snap.settings.name.trim().toLowerCase();
  const rows = useMemo(() => {
    if (me.length < 2) return [];
    return messages
      .filter((m) => m.direction === "in" && m.body.toLowerCase().includes(me))
      .map((m) => { const conv = conversations.find((c) => c.id === m.conversationId); const contact = conv?.contactId ? snap.contacts.find((x) => x.id === conv.contactId) : undefined; return { m, conv, name: contact?.name ?? conv?.title ?? "", photo: contact?.photo }; })
      .filter((r) => r.conv)
      .sort((a, b) => b.m.createdAt - a.m.createdAt)
      .slice(0, 50);
  }, [messages, conversations, snap.contacts, me]);
  const mark = (text: string) => text.split(new RegExp(`(${escapeRe(me)})`, "gi")).map((part, i) =>
    part.toLowerCase() === me ? <span key={i} className="font-semibold text-accent">{part}</span> : <span key={i}>{part}</span>);

  return (
    <Page title={t("mentions.title")} className="stagger">
      <Box>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center bg-tc text-ontc" style={clipShape("sunny")}><AtSign size={24} /></span>
            <p className="max-w-xs text-sm leading-relaxed text-muted">{t("mentions.none")}</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {rows.map(({ m, conv, name, photo }) => (
              <li key={m.id}>
                <button onClick={() => onOpenChat(conv!.id)} className="m3-press flex w-full items-start gap-3 rounded-3xl bg-container p-3 text-start hover:bg-raised">
                  <Avatar title={name} mode={conv!.mode} photo={photo} size={40} shape="clover4" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{name}</span>
                      <span className="ms-auto shrink-0 text-[11px] text-muted">{clock(m.createdAt, now)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{mark(m.body)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Box>
    </Page>
  );
}

/* ---------- Yıldızlı: conversations the user starred ---------- */
export function StarredPanel({ onOpenChat }: { onOpenChat: (id: string) => void }) {
  const { conversations, messages, update, now } = useStore();
  const { snap } = useP2P(); const { t, dur, clock } = useI18n();
  const rows = useMemo(() => conversations
    .filter((c) => c.starred)
    .map((c) => { const contact = c.contactId ? snap.contacts.find((x) => x.id === c.contactId) : undefined; const msgs = messages.filter((m) => m.conversationId === c.id); return { c, name: contact?.name ?? c.title, photo: contact?.photo, last: msgs[msgs.length - 1] }; })
    .sort((a, b) => (b.last?.createdAt ?? 0) - (a.last?.createdAt ?? 0)), [conversations, messages, snap.contacts]);

  return (
    <Page title={t("starred.title")} className="stagger">
      <Box>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center bg-tc text-ontc" style={clipShape("cookie9")}><Star size={24} /></span>
            <p className="max-w-xs text-sm leading-relaxed text-muted">{t("starred.none")}</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {rows.map(({ c, name, photo, last }) => (
              <li key={c.id} className="group flex items-center gap-1 rounded-3xl bg-container p-2 hover:bg-raised">
                <button onClick={() => onOpenChat(c.id)} className="m3-press flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 text-start">
                  <Avatar title={name} mode={c.mode} photo={photo} size={44} shape="clover4" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-base font-medium">{name}</span>
                      <span className="ms-auto shrink-0 text-xs text-muted">{last ? clock(last.createdAt, now) : ""}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted">{summary(last, t("chats.link"))}</span>
                    {last && <span className="mt-1 block text-[11px] text-muted">{t("thread.expires", { time: dur(last.expiresAt - now) })}</span>}
                  </span>
                </button>
                <button onClick={() => update(c.id, { starred: false })} aria-label={t("menu.unstar")} title={t("menu.unstar")} className="m3-press rounded-full p-2.5 text-muted hover:bg-container hover:text-ink"><StarOff size={17} /></button>
              </li>
            ))}
          </ul>
        )}
      </Box>
    </Page>
  );
}

/* ---------- Alanlar: local groups of contacts, like small communities ---------- */
export function SpacesPanel({ spaceId, onPick, onOpenChat }: { spaceId: string | null; onPick: (id: string | null) => void; onOpenChat: (convId: string) => void }) {
  const { spaces, createSpace, deleteSpace, renameSpace, spaceAdd, spaceRemove, conversations, createP2P } = useStore();
  const { snap } = useP2P(); const { t } = useI18n();
  const [name, setName] = useState(""); const [edit, setEdit] = useState(""); const [confirmDel, setConfirmDel] = useState(false);
  const space = spaces.find((s) => s.id === spaceId) ?? null;
  useEffect(() => { if (spaceId && !space) onPick(null); }, [spaceId, space, onPick]);

  if (!space) {
    return (
      <Page title={t("spaces.title")} intro={t("spaces.empty")} className="stagger">
        {spaces.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {spaces.map((s) => {
              const n = s.members.filter((id) => snap.contacts.some((c) => c.id === id)).length;
              return (
                <li key={s.id}>
                  <button onClick={() => onPick(s.id)} className="m3-press group flex w-full items-center gap-3 rounded-[28px] bg-container p-4 text-start hover:bg-raised">
                    <span className="h-11 w-11 shrink-0 rounded-2xl" style={{ backgroundColor: `hsl(${s.hue} 65% 55%)` }} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.name}</span><span className="block text-xs text-muted">{t("spaces.members")}: {n}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Box className="space-y-3"><p className="text-sm font-medium">{t("spaces.create")}</p>
          <div className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t("spaces.name")} aria-label={t("spaces.name")} className={field}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onPick(createSpace(name)); setName(""); } }} />
            <button disabled={!name.trim()} onClick={() => { onPick(createSpace(name)); setName(""); }} className={cn(btn, "bg-pc text-onpc disabled:opacity-40")}><Plus size={15} />{t("spaces.create")}</button></div>
        </Box>
      </Page>
    );
  }

  const members = space.members.map((id) => snap.contacts.find((c) => c.id === id)).filter((c): c is Contact => !!c && !c.blocked);
  const candidates = snap.contacts.filter((c) => !c.blocked && !space.members.includes(c.id));
  const openMember = (c: Contact) => { const conv = conversations.find((x) => x.contactId === c.id); onOpenChat(conv ? conv.id : createP2P(c.id, c.name)); };

  return (
    <Page title={space.name} className="stagger">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onPick(null)} className="m3-press inline-flex items-center gap-2 rounded-full bg-highest px-4 py-2 text-sm text-muted hover:text-ink"><ArrowLeft size={15} className="rtl:-scale-x-100" />{t("thread.back")}</button>
        <div className="flex min-w-0 flex-1 gap-2">
          <input value={edit} onChange={(e) => setEdit(e.target.value)} maxLength={40} placeholder={t("spaces.name")} aria-label={t("spaces.name")} className={cn(field, "max-w-64 py-2")} />
          <button onClick={() => { if (edit.trim()) renameSpace(space.id, edit); setEdit(""); }} disabled={!edit.trim()} className={cn(btn, "bg-sc text-onsc disabled:opacity-40")}>{t("c.save")}</button>
        </div>
        {!confirmDel ? <button onClick={() => setConfirmDel(true)} className="m3-press inline-flex items-center gap-2 rounded-full border border-danger/50 px-4 py-2 text-sm text-danger"><Trash2 size={14} />{t("spaces.delete")}</button>
          : <div className="flex items-center gap-2 rounded-3xl bg-danger/10 p-2"><p className="px-2 text-sm">{t("spaces.deleteAsk")}</p>
            <button onClick={() => { deleteSpace(space.id); onPick(null); }} className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-bg">{t("spaces.delete")}</button>
            <button onClick={() => setConfirmDel(false)} className="rounded-full px-4 py-2 text-sm text-muted">{t("c.cancel")}</button></div>}
      </div>

      <Box className="space-y-3"><p className="text-sm font-medium">{t("spaces.members")} ({members.length})</p>
        {members.length === 0 ? <p className="text-sm text-muted">{t("spaces.noMembers")}</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {members.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-3xl bg-container p-3">
                <span className="relative shrink-0">
                  <Avatar title={c.name} mode="p2p" photo={c.photo} size={44} shape="clover4" />
                  <span className={cn("absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-container", snap.status[c.id] === "online" ? "bg-accent" : "bg-line")} />
                </span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.name}</span><span className="block text-xs tabular-nums text-muted">{c.code}</span></span>
                <button onClick={() => openMember(c)} aria-label={t("nav.chats")} title={t("nav.chats")} className="m3-press rounded-full p-2.5 text-muted hover:bg-raised hover:text-ink"><MessageSquare size={17} /></button>
                <button onClick={() => spaceRemove(space.id, c.id)} aria-label={t("c.remove")} title={t("c.remove")} className="m3-press rounded-full p-2.5 text-muted hover:bg-raised hover:text-danger"><Trash2 size={17} /></button>
              </li>
            ))}
          </ul>
        )}
      </Box>

      <Box className="space-y-3"><p className="text-sm font-medium">{t("spaces.add")}</p>
        {candidates.length === 0 ? <p className="text-sm text-muted">{t("spaces.noneLeft")}</p> : (
          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li key={c.id}>
                <button onClick={() => spaceAdd(space.id, c.id)} className="m3-press flex w-full items-center gap-3 rounded-3xl bg-container px-3 py-2.5 text-start text-sm hover:bg-raised">
                  <Avatar title={c.name} mode="p2p" photo={c.photo} size={36} shape="clover4" />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <UserPlus size={17} className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Box>
    </Page>
  );
}
