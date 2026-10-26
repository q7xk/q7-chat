"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Phone, ScanLine, Settings as Cog, Users, type LucideIcon } from "lucide-react";
import type { SettingsSection, View } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useI18n, type K } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { useStore } from "@/lib/store";
import { ShapeDefs } from "./Badges";
import { CallOverlay } from "./Call";
import { CallsPanel } from "./Calls";
import { ChatList } from "./ChatList";
import { ConnectPanel } from "./Connect";
import { ContactsPanel } from "./Contacts";
import { Logo, LogoMark } from "./Logo";
import { SettingsPanel } from "./Settings";
import { Thread } from "./Thread";
import { TopBar } from "./TopBar";

const NAV: { id: View; label: K; icon: LucideIcon }[] = [
  { id: "chats", label: "nav.chats", icon: MessageSquare }, { id: "contacts", label: "nav.contacts", icon: Users }, { id: "connect", label: "nav.connect", icon: ScanLine },
  { id: "calls", label: "nav.calls", icon: Phone }, { id: "settings", label: "nav.settings", icon: Cog },
];

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
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const m of fresh.slice(-3)) {
      const conv = conversations.find((c) => c.id === m.conversationId);
      if (!conv || conv.mode !== "p2p" || conv.muted) continue;
      const name = snap.contacts.find((c) => c.id === conv.contactId)?.name ?? conv.title;
      const body = settings.notifyPreview === false || !m.body ? t("notif.new") : m.body.slice(0, 160);
      try { new Notification(name, { body, silent: settings.notifySound === false }); } catch {}
    }
  }, [messages, conversations, settings, snap.contacts, t]);
}

export function Shell() {
  const { t } = useI18n(); const { snap } = useP2P();
  const [view, setView] = useState<View>("chats"); const [activeId, setActiveId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(true); // desktop rail: labels ↔ icons
  const [query, setQuery] = useState(""); // top-bar "search in chats"
  const [section, setSection] = useState<SettingsSection | null>(null); // settings category to scroll to
  const go = (v: View) => { setView(v); setActiveId(null); };
  const openChat = (id: string) => { setView("chats"); setActiveId(id); };
  const openSection = (s: SettingsSection) => { setSection(s); go("settings"); };
  const clearSection = useCallback(() => setSection(null), []);
  useNotifier();
  const chat = view === "chats"; const pane = "md:rounded-[28px] md:overflow-hidden"; const paneScroll = "md:rounded-[28px]";
  const badge = (id: View) => (id === "connect" ? snap.requests.length : 0);
  /* direction-aware shared-axis transition when switching categories */
  const idx = NAV.findIndex((n) => n.id === view);
  const lastIdx = useRef(idx);
  const viewAnim = idx === lastIdx.current ? "" : idx > lastIdx.current ? "m3-view-next" : "m3-view-prev";
  useEffect(() => { lastIdx.current = idx; });

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <ShapeDefs />
      <TopBar railOpen={railOpen} onRail={() => setRailOpen((v) => !v)} query={query} onQuery={setQuery} onSection={openSection} view={view} goChats={() => go("chats")} />

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Q7 Chat" className={cn("hidden shrink-0 flex-col p-3 transition-[width] duration-300 ease-spring md:flex", railOpen ? "w-64" : "w-[84px]")}>
          <div className={cn("mb-4 mt-1 flex", railOpen ? "px-1" : "justify-center")}>
            {railOpen ? <Logo /> : <span title="Q7 Chat" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pc text-onpc"><LogoMark size={24} /></span>}
          </div>
          <ul className="flex flex-1 flex-col gap-1">
            {NAV.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button onClick={() => go(id)} aria-current={view === id ? "page" : undefined} title={railOpen ? undefined : t(label)}
                  className={cn("m3-press relative flex h-14 w-full items-center gap-3 text-start text-[15px] font-medium", railOpen ? "rounded-full px-5" : "justify-center rounded-full",
                    view === id ? "bg-sc text-onsc" : "text-muted hover:bg-container hover:text-ink")}>
                  <span key={view === id ? "on" : "off"} className={cn("flex shrink-0", view === id && "m3-bounce")}><Icon size={21} /></span>
                  {railOpen && <span className="truncate">{t(label)}</span>}
                  {railOpen && badge(id) > 0 && <span key={badge(id)} className="m3-bounce ms-auto rounded-full bg-accent px-2 text-xs font-semibold text-bg">{badge(id)}</span>}
                  {!railOpen && badge(id) > 0 && <span key={badge(id)} className="m3-bounce absolute end-4 top-3 h-2.5 w-2.5 rounded-full bg-accent" />}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex min-h-0 min-w-0 flex-1 gap-2 md:p-2 md:ps-0">
          {chat ? (
            <>
              <section className={cn("m3-fade w-full shrink-0 flex-col bg-panel md:flex md:w-96", pane, activeId ? "hidden" : "flex")}><ChatList activeId={activeId} onOpen={setActiveId} onAdd={() => go("connect")} query={query} /></section>
              <section key={activeId} className={cn("m3-page min-w-0 flex-1 flex-col bg-container md:flex", pane, activeId ? "flex" : "hidden")}><Thread conversationId={activeId} onBack={() => setActiveId(null)} /></section>
            </>
          ) : (
            <section className={cn("min-w-0 flex-1 overflow-y-auto overflow-x-clip bg-panel scroll-thin", paneScroll)}>
              <div key={view} className={cn("min-h-full", viewAnim)}>
                {view === "contacts" && <ContactsPanel onOpenChat={openChat} onAdd={() => go("connect")} />}
                {view === "connect" && <ConnectPanel onOpenChat={openChat} />}
                {view === "calls" && <CallsPanel onOpenChat={openChat} />}
                {view === "settings" && <SettingsPanel section={section} onContacts={() => go("contacts")} onSectionSeen={clearSection} />}
              </div>
            </section>
          )}
        </main>
      </div>

      <CallOverlay />

      <nav aria-label="Q7 Chat" className={cn("bg-container pb-[env(safe-area-inset-bottom)] md:hidden", chat && activeId && "hidden")}>
        <ul className="grid grid-cols-5 px-1 pb-2 pt-3">
          {NAV.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button onClick={() => go(id)} aria-label={t(label)} aria-current={view === id ? "page" : undefined} className="m3-press flex w-full flex-col items-center gap-1 text-xs font-medium">
                <span key={view === id ? "on" : "off"} className={cn("relative flex h-8 w-16 items-center justify-center rounded-full transition-[background-color] duration-300 ease-spring", view === id ? "m3-bounce bg-sc text-onsc" : "text-muted")}><Icon size={20} />{badge(id) > 0 && <span key={badge(id)} className="m3-bounce absolute end-2 top-0 h-2.5 w-2.5 rounded-full bg-accent" />}</span>
                <span className={cn("truncate", view === id ? "text-ink" : "text-muted")}>{t(label)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
