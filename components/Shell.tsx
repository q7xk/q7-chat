"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Home, MessageSquare, MonitorSmartphone, Plus, ScanLine, Settings as Cog, Star, Users, type LucideIcon } from "lucide-react";
import type { SettingsSection, View } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useI18n, type K } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { useStore } from "@/lib/store";
import { Avatar, ShapeDefs } from "./Badges";
import { ChatList } from "./ChatList";
import { ConnectPanel } from "./Connect";
import { ContactsPanel } from "./Contacts";
import { DevicesPanel } from "./Devices";
import { Onboarding } from "./Onboarding";
import { MentionsPanel, SpacesPanel, StarredPanel } from "./Shortcuts";
import { SettingsPanel } from "./Settings";
import { Thread } from "./Thread";
import { TopBar } from "./TopBar";

/** Rail order, used for the direction-aware view transition. */
const ORDER: View[] = ["chats", "mentions", "starred", "spaces", "contacts", "connect", "devices", "settings"];
const SHORTCUTS: { id: View; label: K; icon: LucideIcon }[] = [
  { id: "chats", label: "rail.home", icon: Home }, { id: "mentions", label: "rail.mentions", icon: AtSign }, { id: "starred", label: "rail.starred", icon: Star },
];
const BOTTOM: { id: View; label: K; icon: LucideIcon }[] = [
  { id: "devices", label: "nav.devices", icon: MonitorSmartphone },
  { id: "settings", label: "nav.settings", icon: Cog },
  { id: "contacts", label: "nav.contacts", icon: Users },
];
const MOBILE_NAV: { id: View; label: K; icon: LucideIcon }[] = [
  { id: "chats", label: "nav.chats", icon: MessageSquare },
  { id: "devices", label: "nav.devices", icon: MonitorSmartphone },
  { id: "connect", label: "nav.connect", icon: ScanLine },
  { id: "settings", label: "nav.settings", icon: Cog },
];

import { notifyAndroid, vibrateAndroid } from "@/lib/android-bridge";

/** System notifications for messages that arrive while the tab is hidden. */
function useNotifier() {
  const { messages, conversations, settings } = useStore();
  const { snap } = useP2P(); const { t } = useI18n();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const inc = messages.filter((m) => m.direction === "in");
    if (!seen.current) { seen.current = new Set(inc.map((m) => m.id)); return; } // first render: baseline, no alerts
    const fresh = inc.filter((m) => !seen.current!.has(m.id));
    if (!fresh.length) return;
    for (const m of fresh) seen.current.add(m.id);
    if (seen.current.size > 600) seen.current = new Set([...seen.current].slice(-300));
    if (!settings.notify || settings.presence === "dnd" || document.visibilityState === "visible") return;
    for (const m of fresh.slice(-3)) {
      const conv = conversations.find((c) => c.id === m.conversationId);
      if (!conv || conv.mode === "local" || conv.muted) continue;
      const sender = conv.mode === "group" ? (snap.contacts.find((c) => c.id === m.from)?.name ?? conv.names?.[m.from ?? ""] ?? "") : "";
      const name = conv.mode === "group"
        ? (sender ? `${sender} · ${conv.title}` : conv.title)
        : snap.contacts.find((c) => c.id === conv.contactId)?.name ?? conv.title;
      const body = settings.notifyPreview === false || !m.body ? t("notif.new") : m.body.slice(0, 160);
      
      // Native Android notification support
      const notifiedViaNative = notifyAndroid(name, body);
      if (settings.notifySound !== false) {
        vibrateAndroid(60);
      }

      // Web Notification fallback
      if (!notifiedViaNative && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification(name, { body, silent: settings.notifySound === false }); } catch {}
      }
    }
  }, [messages, conversations, settings, snap.contacts, t]);
}

export function Shell() {
  const { t } = useI18n(); const { mgr, snap } = useP2P();
  const { conversations, messages, spaces } = useStore();
  const [view, setView] = useState<View>("chats"); const [activeId, setActiveId] = useState<string | null>(null);
  const [pin, setPin] = useState(false); // hamburger: keep the rail expanded
  const [hover, setHover] = useState(false); // rail grows when the mouse approaches
  const [query, setQuery] = useState(""); // top-bar "search in chats"
  const [section, setSection] = useState<SettingsSection | null>(null); // settings category to scroll to
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const expanded = pin || hover;
  const go = useCallback((v: View) => { setView(v); setActiveId(null); }, []);
  const openChat = useCallback((id: string) => { setView("chats"); setActiveId(id); }, []);
  const openSection = useCallback((s: SettingsSection) => { setSection(s); go("settings"); }, []);
  const clearSection = useCallback(() => setSection(null), []);
  useNotifier();
  const chat = view === "chats"; const pane = "md:rounded-[28px] md:overflow-hidden"; const paneScroll = "md:rounded-[28px]";
  const badge = (id: View) => (id === "connect" ? snap.requests.length : 0);
  /* direction-aware shared-axis transition when switching categories */
  const idx = ORDER.indexOf(view);
  const lastIdx = useRef(idx);
  const viewAnim = idx === lastIdx.current ? "" : idx > lastIdx.current ? "m3-view-next" : "m3-view-prev";
  useEffect(() => { lastIdx.current = idx; });

  useEffect(() => {
    const handleAndroidBack = (e: Event) => {
      if (activeId !== null) {
        e.preventDefault();
        setActiveId(null);
      } else if (view !== "chats") {
        e.preventDefault();
        setView("chats");
      }
    };
    window.addEventListener("android-back-press", handleAndroidBack);
    return () => window.removeEventListener("android-back-press", handleAndroidBack);
  }, [activeId, view]);

  const totalUnread = useMemo(() => conversations.reduce((a, c) => a + (c.archived ? 0 : c.unread), 0), [conversations]);
  const dms = useMemo(() => conversations
    .filter((c) => c.mode === "p2p" && c.contactId && !c.archived)
    .map((c) => { const contact = snap.contacts.find((x) => x.id === c.contactId); const last = messages.reduce((a, m) => (m.conversationId === c.id ? Math.max(a, m.createdAt) : a), 0); return { c, contact, last }; })
    .filter((x) => x.contact && !x.contact.blocked)
    .sort((a, b) => Number(b.c.pinned) - Number(a.c.pinned) || b.last - a.last)
    .slice(0, 12), [conversations, messages, snap.contacts]);
  const groups = useMemo(() => conversations
    .filter((c) => c.mode === "group" && !c.archived)
    .map((c) => ({ c, last: messages.reduce((a, m) => (m.conversationId === c.id ? Math.max(a, m.createdAt) : a), 0) }))
    .sort((a, b) => Number(b.c.pinned) - Number(a.c.pinned) || b.last - a.last)
    .slice(0, 12), [conversations, messages]);

  const rowCls = (on: boolean) => cn("m3-press relative flex h-11 shrink-0 items-center rounded-full text-sm font-medium",
    expanded ? "w-full gap-3 px-3.5 text-start" : "mx-auto w-11 justify-center",
    on ? "bg-sc text-onsc" : "text-muted hover:bg-container hover:text-ink");
  const cap = "mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted";

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <ShapeDefs />
      <TopBar railOpen={pin} onRail={() => setPin((v) => !v)} query={query} onQuery={setQuery} onSection={openSection} view={view} goChats={() => go("chats")} />

      <div className="flex min-h-0 flex-1">
        {/* Rail: same tonal surface as the top bar — reads as one continuous frame. Grows on hover. */}
        <nav aria-label="Q7 Chat" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          className={cn("relative hidden shrink-0 select-none flex-col bg-panel p-3 pb-4 transition-[width] duration-300 ease-spring md:my-2 md:flex md:rounded-[28px]", expanded ? "w-[260px]" : "w-[84px]")}>
          {/* Yeni sohbet → Bağlan */}
          <button onClick={() => go("connect")} title={t("rail.newChat")} aria-label={t("rail.newChat")}
            className={cn("m3-press flex shrink-0 items-center gap-3 bg-pc text-onpc transition-[filter,transform] duration-200 ease-spring hover:brightness-110 active:scale-95",
              expanded ? "h-12 w-full rounded-full px-5 text-[15px] font-semibold" : "mx-auto h-12 w-12 justify-center rounded-2xl")}>
            <Plus size={20} className="shrink-0" />
            {expanded && <span className="truncate">{t("rail.newChat")}</span>}
          </button>

          <div className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-clip pb-2 pt-1">
            <p aria-hidden={!expanded} className={cn(cap, !expanded && "sr-only")}>{t("rail.shortcuts")}</p>
            {SHORTCUTS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => go(id)} aria-current={view === id ? "page" : undefined} title={t(label)}
                className={rowCls(view === id)}>
                <span key={view === id ? "on" : "off"} className={cn("flex shrink-0", view === id && "m3-bounce")}><Icon size={19} className={cn(id === "starred" && view === id && "fill-current")} /></span>
                {expanded && <span className="truncate">{t(label)}</span>}
                {expanded && id === "chats" && totalUnread > 0 && <span key={totalUnread} className="m3-bounce ms-auto rounded-full bg-accent px-1.5 text-center text-xs font-semibold text-bg">{totalUnread}</span>}
                {!expanded && id === "chats" && totalUnread > 0 && <span key={totalUnread} className="m3-bounce absolute end-1 top-1 h-2 w-2 rounded-full bg-accent" />}
              </button>
            ))}

            <p aria-hidden={!expanded} className={cn(cap, !expanded && "sr-only")}>{t("rail.dms")}</p>
            {dms.map(({ c, contact }) => (
              <button key={c.id} onClick={() => openChat(c.id)} title={contact!.name} aria-current={chat && activeId === c.id ? "true" : undefined}
                className={rowCls(chat && activeId === c.id)}>
                <span className="relative shrink-0">
                  <Avatar title={contact!.name} mode="p2p" photo={contact!.photo} size={30} shape="clover4" />
                  <span className={cn("absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel", snap.status[contact!.id] === "online" ? "bg-accent" : "bg-line")} />
                </span>
                {expanded && <span className="min-w-0 flex-1 truncate">{contact!.name}</span>}
                {expanded && c.unread > 0 && <span key={c.unread} className="m3-bounce rounded-full bg-accent px-1.5 text-center text-xs font-semibold text-bg">{c.unread}</span>}
                {!expanded && c.unread > 0 && <span key={c.unread} className="m3-bounce absolute end-1 top-1 h-2 w-2 rounded-full bg-accent" />}
              </button>
            ))}
            {expanded && dms.length === 0 && <p className="px-3 pb-1 text-xs leading-relaxed text-muted">{t("rail.dmNone")}</p>}

            <p aria-hidden={!expanded} className={cn(cap, !expanded && "sr-only")}>{t("rail.groups")}</p>
            {groups.map(({ c }) => (
              <button key={c.id} onClick={() => openChat(c.id)} title={c.title} aria-current={chat && activeId === c.id ? "true" : undefined}
                className={rowCls(chat && activeId === c.id)}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[11px] font-semibold text-white" style={{ clipPath: "url(#shape-clover8)", backgroundColor: `hsl(${c.hue ?? 210} 62% 46%)` }}>
                  {c.title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "#"}
                </span>
                {expanded && <span className="min-w-0 flex-1 truncate">{c.title}</span>}
                {expanded && c.unread > 0 && <span key={c.unread} className="m3-bounce rounded-full bg-accent px-1.5 text-center text-xs font-semibold text-bg">{c.unread}</span>}
                {!expanded && c.unread > 0 && <span key={c.unread} className="m3-bounce absolute end-1 top-1 h-2 w-2 rounded-full bg-accent" />}
              </button>
            ))}
            {expanded && groups.length === 0 && <p className="px-3 pb-1 text-xs leading-relaxed text-muted">{t("group.none")}</p>}

            <p aria-hidden={!expanded} className={cn(cap, !expanded && "sr-only")}>{t("rail.spaces")}</p>
            {spaces.map((s) => {
              const n = s.members.filter((id) => snap.contacts.some((c) => c.id === id)).length;
              const on = view === "spaces" && spaceId === s.id;
              return (
                <button key={s.id} onClick={() => { setSpaceId(s.id); go("spaces"); }} title={s.name} aria-current={on ? "true" : undefined}
                  className={rowCls(on)}>
                  <span className="h-6 w-6 shrink-0 rounded-xl" style={{ backgroundColor: `hsl(${s.hue} 65% 55%)` }} />
                  {expanded && <>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="shrink-0 text-xs text-muted">{n}</span>
                  </>}
                </button>
              );
            })}
            <button onClick={() => { setSpaceId(null); go("spaces"); }} title={t("spaces.create")} aria-label={t("spaces.create")} className={rowCls(false)}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-line"><Plus size={13} /></span>
              {expanded && <span className="truncate">{t("spaces.create")}</span>}
            </button>
          </div>

          {/* bottom: settings · calls · contacts */}
          <div className="shrink-0 space-y-1 border-t border-line/60 pt-2">
            {BOTTOM.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => go(id)} aria-current={view === id ? "page" : undefined} title={t(label)}
                className={rowCls(view === id)}>
                <span key={view === id ? "on" : "off"} className={cn("flex shrink-0", view === id && "m3-bounce")}><Icon size={19} /></span>
                {expanded && <span className="truncate">{t(label)}</span>}
                {!expanded && badge(id) > 0 && <span key={badge(id)} className="m3-bounce absolute end-1 top-1 h-2 w-2 rounded-full bg-accent" />}
                {expanded && badge(id) > 0 && <span key={badge(id)} className="m3-bounce ms-auto rounded-full bg-accent px-1.5 text-center text-xs font-semibold text-bg">{badge(id)}</span>}
              </button>
            ))}
          </div>
        </nav>

        <main className="flex min-h-0 min-w-0 flex-1 gap-2 md:p-2">
          {chat ? (
            <>
              <section className={cn("m3-fade w-full shrink-0 flex-col bg-panel md:flex md:w-96", pane, activeId ? "hidden" : "flex")}><ChatList activeId={activeId} onOpen={setActiveId} onAdd={() => go("connect")} query={query} /></section>
              <section key={activeId} className={cn("m3-page min-w-0 flex-1 flex-col bg-container md:flex", pane, activeId ? "flex" : "hidden")}><Thread conversationId={activeId} onBack={() => setActiveId(null)} /></section>
            </>
          ) : (
            <section className={cn("min-w-0 flex-1 overflow-y-auto overflow-x-clip bg-panel scroll-thin", paneScroll)}>
              <div key={view} className={cn("min-h-full", viewAnim)}>
                {view === "mentions" && <MentionsPanel onOpenChat={openChat} />}
                {view === "starred" && <StarredPanel onOpenChat={openChat} />}
                {view === "spaces" && <SpacesPanel spaceId={spaceId} onPick={setSpaceId} onOpenChat={openChat} />}
                {view === "contacts" && <ContactsPanel onOpenChat={openChat} onAdd={() => go("connect")} />}
                {view === "devices" && <DevicesPanel />}
                {view === "connect" && <ConnectPanel onOpenChat={openChat} />}
                {view === "settings" && <SettingsPanel section={section} onContacts={() => go("contacts")} onSectionSeen={clearSection} />}
              </div>
            </section>
          )}
        </main>
      </div>

      <nav aria-label="Q7 Chat" className={cn("bg-container pb-[env(safe-area-inset-bottom)] md:hidden", chat && activeId && "hidden")}>
        <ul className="grid grid-cols-4 px-1 pb-2 pt-3">
          {MOBILE_NAV.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button onClick={() => go(id)} aria-label={t(label)} aria-current={view === id ? "page" : undefined} className="m3-press flex w-full flex-col items-center gap-1 text-xs font-medium">
                <span key={view === id ? "on" : "off"} className={cn("relative flex h-8 w-16 items-center justify-center rounded-full transition-[background-color] duration-300 ease-spring", view === id ? "m3-bounce bg-sc text-onsc" : "text-muted")}><Icon size={20} />{badge(id) > 0 && <span key={badge(id)} className="m3-bounce absolute end-2 top-0 h-2.5 w-2.5 rounded-full bg-accent" />}</span>
                <span className={cn("truncate", view === id ? "text-ink" : "text-muted")}>{t(label)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {snap.fresh && <Onboarding />}                    {/* first-run setup wizard covers the app until it finishes */}
    </div>
  );
}
