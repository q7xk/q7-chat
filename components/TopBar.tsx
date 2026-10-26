"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell, Check, ChevronDown, CircleHelp, Copy, GraduationCap, Grip, Image as ImageIcon, LifeBuoy, Lock, Menu as MenuIcon,
  Palette, PersonStanding, Search, Settings as Cog, ShieldOff, SlidersHorizontal, type LucideIcon,
} from "lucide-react";
import type { K } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { formatCode } from "@/lib/p2p/crypto";
import { useStore } from "@/lib/store";
import type { Presence, SettingsSection, View } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Avatar } from "./Badges";
import { LogoMark } from "./Logo";

export const PRESENCE: { id: Presence; k: "pres.online" | "pres.dnd" | "pres.away"; dot: string }[] = [
  { id: "online", k: "pres.online", dot: "bg-accent" },
  { id: "dnd", k: "pres.dnd", dot: "bg-danger" },
  { id: "away", k: "pres.away", dot: "bg-[hsl(38_92%_52%)]" },
];
/** The seven settings categories; the gear menu and the settings page share it. */
export const SETTINGS_SECTIONS: { id: SettingsSection; icon: LucideIcon; label: K }[] = [
  { id: "general", icon: SlidersHorizontal, label: "set.sec.general" },
  { id: "notifications", icon: Bell, label: "set.sec.notif" },
  { id: "media", icon: ImageIcon, label: "set.sec.media" },
  { id: "look", icon: Palette, label: "set.look" },
  { id: "a11y", icon: PersonStanding, label: "set.sec.a11y" },
  { id: "restrict", icon: ShieldOff, label: "set.sec.restrict" },
  { id: "privacy", icon: Lock, label: "set.sec.privacy" },
];

interface Props {
  railOpen: boolean; onRail: () => void;
  query: string; onQuery: (q: string) => void;
  onSection: (s: SettingsSection) => void;
  view: View; goChats: () => void;
}

export function TopBar({ railOpen, onRail, query, onQuery, onSection, view, goChats }: Props) {
  const { t } = useI18n(); const { snap } = useP2P(); const { settings, setSettings } = useStore();
  const [menu, setMenu] = useState<null | "status" | "help" | "settings" | "apps" | "profile">(null);
  const [copied, setCopied] = useState(false);
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => { if (bar.current && !bar.current.contains(e.target as Node)) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", out); document.removeEventListener("keydown", esc); };
  }, []);
  const tog = (m: typeof menu) => setMenu((c) => (c === m ? null : m));
  const presence = settings.presence ?? "online";
  const meta = PRESENCE.find((p) => p.id === presence)!;
  const iconBtn = "m3-press flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-container hover:text-ink";
  const name = snap.settings.name || "Q7";

  return (
    <header ref={bar} className="relative z-40 hidden h-16 shrink-0 items-center gap-2 bg-panel px-4 md:flex">
      {/* rail toggle + brand */}
      <button onClick={onRail} aria-expanded={railOpen} aria-label={t(railOpen ? "top.railClose" : "top.railOpen")} title={t(railOpen ? "top.railClose" : "top.railOpen")} className={iconBtn}>
        <MenuIcon size={20} />
      </button>
      <div className="flex items-center gap-2.5 pe-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logotr.svg" alt="" width={36} height={36} className="h-9 w-9 shrink-0" />
        <span className="text-lg font-semibold tracking-tight text-ink">Chat</span>
      </div>

      {/* search across the chats */}
      <div className="relative mx-auto w-full min-w-0 max-w-md">
        <Search size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={query}
          onChange={(e) => { onQuery(e.target.value); if (e.target.value && view !== "chats") goChats(); }}
          onFocus={() => { if (view !== "chats") goChats(); }}
          onKeyDown={(e) => { if (e.key === "Escape") { onQuery(""); (e.target as HTMLInputElement).blur(); } }}
          placeholder={t("top.search")} aria-label={t("top.search")}
          className="w-full rounded-full bg-highest py-2.5 pe-4 ps-10 text-sm outline-2 outline-transparent focus:outline-[rgb(var(--accent))]"
        />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* presence capsule: dot · status · chevron */}
        <div className="relative">
          <button onClick={() => tog("status")} aria-expanded={menu === "status"} aria-label={t("top.status")} title={t("top.status")}
            className="m3-press flex h-10 items-center gap-2 rounded-full bg-highest ps-3.5 pe-2.5 text-sm font-medium text-ink hover:bg-container">
            <span className={cn("h-2.5 w-2.5 rounded-full", meta.dot)} />
            <span className="hidden max-w-28 truncate lg:inline">{t(meta.k)}</span>
            <ChevronDown size={15} className={cn("text-muted transition-transform duration-200", menu === "status" && "rotate-180")} />
          </button>
          {menu === "status" && (
            <div role="radiogroup" aria-label={t("top.status")} className="m3-pop absolute end-0 top-12 z-50 w-56 space-y-1 rounded-3xl bg-highest p-2 shadow-lg">
              {PRESENCE.map((p) => (
                <button key={p.id} role="radio" aria-checked={presence === p.id} onClick={() => { setSettings({ presence: p.id }); setMenu(null); }}
                  className={cn("m3-press flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start text-sm text-ink", presence === p.id ? "bg-container" : "hover:bg-container")}>
                  <span className={cn("h-2.5 w-2.5 rounded-full", p.dot)} />{t(p.k)}
                  {presence === p.id && <Check size={16} className="ms-auto text-accent" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* help & learn */}
        <div className="relative">
          <button onClick={() => tog("help")} aria-expanded={menu === "help"} aria-label={t("top.helpMenu")} title={t("top.helpMenu")} className={cn(iconBtn, menu === "help" && "bg-container text-ink")}>
            <CircleHelp size={20} />
          </button>
          {menu === "help" && (
            <div className="m3-pop absolute end-0 top-12 z-50 w-60 space-y-1 rounded-3xl bg-highest p-2 shadow-lg">
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted">{t("top.helpMenu")}</p>
              <Link href="/help" target="_blank" onClick={() => setMenu(null)} className="m3-press flex items-center gap-3 rounded-2xl px-3 py-2.5 text-start text-sm text-ink hover:bg-container">
                <LifeBuoy size={18} className="shrink-0 text-muted" />{t("top.help")}
              </Link>
              <Link href="/learn" target="_blank" onClick={() => setMenu(null)} className="m3-press flex items-center gap-3 rounded-2xl px-3 py-2.5 text-start text-sm text-ink hover:bg-container">
                <GraduationCap size={18} className="shrink-0 text-muted" />{t("top.learn")}
              </Link>
            </div>
          )}
        </div>

        {/* settings menu: the seven categories */}
        <div className="relative">
          <button onClick={() => tog("settings")} aria-expanded={menu === "settings"} aria-label={t("nav.settings")} title={t("nav.settings")} className={cn(iconBtn, (menu === "settings" || view === "settings") && "bg-container text-ink")}>
            <Cog size={20} />
          </button>
          {menu === "settings" && (
            <div className="m3-pop absolute end-0 top-12 z-50 w-64 space-y-1 rounded-3xl bg-highest p-2 shadow-lg">
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted">{t("nav.settings")}</p>
              {SETTINGS_SECTIONS.map(({ id, icon: Icon, label }) => (
                <button key={id} onClick={() => { onSection(id); setMenu(null); }} className="m3-press flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start text-sm text-ink hover:bg-container">
                  <Icon size={18} className="shrink-0 text-muted" />{t(label)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Q7 apps launcher */}
        <div className="relative">
          <button onClick={() => tog("apps")} aria-expanded={menu === "apps"} aria-label={t("top.apps")} title={t("top.apps")} className={cn(iconBtn, menu === "apps" && "bg-container text-ink")}>
            <Grip size={20} />
          </button>
          {menu === "apps" && (
            <div className="m3-pop absolute end-0 top-12 z-50 w-72 rounded-3xl bg-highest p-4 shadow-lg">
              <p className="text-sm font-semibold text-ink">{t("top.apps")}</p>
              <div className="mt-3 flex flex-col items-center gap-1.5 rounded-2xl bg-pc px-2 py-4 text-onpc">
                <LogoMark size={30} />
                <span className="text-xs font-semibold">Q7 Chat</span>
              </div>
              <div className="mt-4 flex flex-col items-center gap-2 pb-1 text-center">
                <Grip size={26} className="text-line" aria-hidden />
                <p className="text-xs leading-relaxed text-muted">{t("top.appsEmpty")}</p>
              </div>
            </div>
          )}
        </div>

        {/* my profile */}
        <div className="relative">
          <button onClick={() => tog("profile")} aria-expanded={menu === "profile"} aria-label={t("top.profile")} title={t("top.profile")} className="m3-press relative ms-1 block">
            <Avatar title={name} mode="p2p" photo={snap.settings.photo} size={40} shape="clover8" />
            <span className={cn("absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-panel", meta.dot)} />
          </button>
          {menu === "profile" && (
            <div className="m3-pop absolute end-0 top-12 z-50 w-72 space-y-3 rounded-3xl bg-highest p-4 shadow-lg">
              <div className="flex items-center gap-3">
                <Avatar title={name} mode="p2p" photo={snap.settings.photo} size={64} shape="sunny" />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink">{name}</p>
                  <p dir="ltr" className="truncate text-xs tabular-nums text-muted">{formatCode(snap.code)}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><span className={cn("h-2 w-2 rounded-full", meta.dot)} />{t(meta.k)}</p>
                </div>
              </div>
              <div role="radiogroup" aria-label={t("top.status")} className="flex flex-wrap gap-1.5">
                {PRESENCE.map((p) => (
                  <button key={p.id} role="radio" aria-checked={presence === p.id} onClick={() => setSettings({ presence: p.id })}
                    className={cn("m3-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium", presence === p.id ? "bg-sc text-onsc" : "bg-container text-muted hover:text-ink")}>
                    <span className={cn("h-2 w-2 rounded-full", p.dot)} />{t(p.k)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={async () => { try { await navigator.clipboard.writeText(formatCode(snap.code)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
                  className="m3-press inline-flex items-center gap-2 rounded-full bg-container px-4 py-2 text-sm font-medium text-ink hover:bg-raised">
                  {copied ? <Check size={15} className="text-accent" /> : <Copy size={15} />}{copied ? t("c.copied") : t("connect.copyCode")}
                </button>
                <button onClick={() => { onSection("general"); setMenu(null); }} className="m3-press inline-flex items-center gap-2 rounded-full bg-sc px-4 py-2 text-sm font-medium text-onsc hover:brightness-110">
                  <Cog size={15} />{t("set.profile")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
