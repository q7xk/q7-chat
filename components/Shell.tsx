"use client";
import { useState } from "react";
import { MessageSquare, Phone, ScanLine, Settings as Cog, Users, type LucideIcon } from "lucide-react";
import type { View } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useI18n, type K } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { ShapeDefs } from "./Badges";
import { CallOverlay } from "./Call";
import { ChatList } from "./ChatList";
import { ConnectPanel } from "./Connect";
import { ContactsPanel } from "./Contacts";
import { Logo } from "./Logo";
import { SettingsPanel } from "./Settings";
import { Thread } from "./Thread";
import { Box, Page } from "./ui";

const NAV: { id: View; label: K; icon: LucideIcon }[] = [
  { id: "chats", label: "nav.chats", icon: MessageSquare }, { id: "contacts", label: "nav.contacts", icon: Users }, { id: "connect", label: "nav.connect", icon: ScanLine },
  { id: "calls", label: "nav.calls", icon: Phone }, { id: "settings", label: "nav.settings", icon: Cog },
];

export function Shell() {
  const { t } = useI18n(); const { snap } = useP2P();
  const [view, setView] = useState<View>("chats"); const [activeId, setActiveId] = useState<string | null>(null);
  const go = (v: View) => { setView(v); setActiveId(null); };
  const openChat = (id: string) => { setView("chats"); setActiveId(id); };
  const chat = view === "chats"; const pane = "md:rounded-[28px] md:overflow-hidden"; const paneScroll = "md:rounded-[28px]";
  const badge = (id: View) => (id === "connect" ? snap.requests.length : 0);

  return (
    <div className="flex h-dvh flex-col bg-bg md:flex-row">
      <ShapeDefs />
      <nav aria-label="Q7 Message" className="hidden w-64 shrink-0 flex-col p-4 md:flex">
        <div className="mb-6 px-1 py-2"><Logo /></div>
        <ul className="flex flex-1 flex-col gap-1">
          {NAV.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button onClick={() => go(id)} aria-current={view === id ? "page" : undefined} className={cn("flex h-14 w-full items-center gap-3 rounded-full px-5 text-start text-[15px] font-medium transition-[background-color] duration-300", view === id ? "bg-sc text-onsc" : "text-muted hover:bg-container hover:text-ink")}>
                <Icon size={21} />{t(label)}{badge(id) > 0 && <span className="ms-auto rounded-full bg-accent px-2 text-xs font-semibold text-bg">{badge(id)}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex min-h-0 min-w-0 flex-1 gap-2 md:p-2 md:ps-0">
        {chat ? (
          <>
            <section className={cn("w-full shrink-0 flex-col bg-panel md:flex md:w-96", pane, activeId ? "hidden" : "flex")}><ChatList activeId={activeId} onOpen={setActiveId} onAdd={() => go("connect")} /></section>
            <section className={cn("min-w-0 flex-1 flex-col bg-container md:flex", pane, activeId ? "flex" : "hidden")}><Thread conversationId={activeId} onBack={() => setActiveId(null)} /></section>
          </>
        ) : (
          <section className={cn("min-w-0 flex-1 overflow-y-auto bg-panel scroll-thin", paneScroll)}>
            {view === "contacts" && <ContactsPanel onOpenChat={openChat} onAdd={() => go("connect")} />}
            {view === "connect" && <ConnectPanel onOpenChat={openChat} />}
            {view === "calls" && <Page title={t("calls.title")}><Box className="flex items-center gap-3 text-sm text-muted"><Phone size={20} aria-hidden />{t("calls.soon")}</Box></Page>}
            {view === "settings" && <SettingsPanel />}
          </section>
        )}
      </main>

      <CallOverlay />

      <nav aria-label="Q7 Message" className={cn("bg-container pb-[env(safe-area-inset-bottom)] md:hidden", chat && activeId && "hidden")}>
        <ul className="grid grid-cols-5 px-1 pb-2 pt-3">
          {NAV.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button onClick={() => go(id)} aria-label={t(label)} aria-current={view === id ? "page" : undefined} className="flex w-full flex-col items-center gap-1 text-xs font-medium">
                <span className={cn("relative flex h-8 w-16 items-center justify-center rounded-full transition-[background-color] duration-300 ease-spring", view === id ? "bg-sc text-onsc" : "text-muted")}><Icon size={20} />{badge(id) > 0 && <span className="absolute end-2 top-0 h-2.5 w-2.5 rounded-full bg-accent" />}</span>
                <span className={cn("truncate", view === id ? "text-ink" : "text-muted")}>{t(label)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
