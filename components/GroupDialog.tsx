"use client";
import { useEffect, useState } from "react";
import { Check, Users, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { cn } from "@/lib/cn";
import { Avatar, clipShape } from "./Badges";
import { btn } from "./Connect";

/** "New group": name the space, pick contacts, invite them all. */
export function GroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (gid: string) => void }) {
  const { t } = useI18n(); const { mgr, snap } = useP2P();
  const [title, setTitle] = useState(""); const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  const contacts = snap.contacts.filter((c) => !c.blocked);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const create = () => { const gid = mgr.createGroup(title.trim() || "Group", picked); if (gid) onCreated(gid); };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal aria-label={t("group.create")} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="m3-pop flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-[28px] bg-panel">
        <div className="flex items-center gap-3 p-5 pb-3">
          <span className="flex h-11 w-11 items-center justify-center bg-pc text-onpc" style={clipShape("sunny")}><Users size={20} /></span>
          <h3 className="flex-1 text-lg font-semibold">{t("group.create")}</h3>
          <button onClick={onClose} aria-label={t("c.close")} className="rounded-full p-2 text-muted hover:bg-container hover:text-ink"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 scroll-thin">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={t("group.name")} aria-label={t("group.name")}
            className="w-full rounded-2xl bg-highest px-4 py-3 text-sm" />
          <p className="mt-4 mb-2 text-xs font-medium text-muted">{t("group.pick")}</p>
          {contacts.length === 0 && <p className="py-4 text-sm text-muted">{t("group.none")}</p>}
          <ul className="space-y-1 pb-2">
            {contacts.map((c) => (
              <li key={c.id}>
                <button onClick={() => toggle(c.id)} aria-pressed={picked.includes(c.id)} className="m3-press flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-start hover:bg-container">
                  <Avatar title={c.name} mode="p2p" photo={c.photo} size={38} shape="clover4" />
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-bg", picked.includes(c.id) ? "border-accent bg-accent" : "border-line")}>
                    {picked.includes(c.id) && <Check size={12} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-between gap-2 p-5 pt-3">
          <span className="text-xs text-muted">{picked.length ? t("group.members", { n: picked.length + 1 }) : ""}</span>
          <button disabled={picked.length === 0} onClick={create} className={cn(btn, "bg-accent text-bg disabled:opacity-40")}>{t("c.create")}</button>
        </div>
      </div>
    </div>
  );
}
