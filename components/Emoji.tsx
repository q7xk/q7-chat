"use client";
import { useEffect, useMemo, useState } from "react";
import * as db from "@/lib/db";
import { useI18n, type K } from "@/lib/i18n";
import { EMOJI_GROUPS, EMOJI_INDEX } from "@/lib/emoji-data";
import { cn } from "@/lib/cn";

const CAT_ICON: Record<string, string> = { smileys: "😀", people: "👋", nature: "🐻", food: "🍔", travel: "🚗", activity: "⚽", objects: "💡", flags: "🚩" };

/** Full-Unicode emoji picker (CLDR set, v15; the symbols group is intentionally excluded). */
export function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const { t } = useI18n();
  const [recent, setRecent] = useState<string[]>([]);
  const [tab, setTab] = useState("recent");
  const [q, setQ] = useState("");
  useEffect(() => { db.getFlag("emoji-recent").then((v) => { if (Array.isArray(v)) setRecent(v.filter((x) => typeof x === "string").slice(0, 32)); }).catch(() => {}); }, []);
  const pick = (e: string) => {
    onPick(e);
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 32); setRecent(next); void db.setFlag("emoji-recent", next).catch(() => {});
  };
  const term = q.trim().toLowerCase();
  const list = useMemo(() => (term
    ? EMOJI_INDEX.filter(([, n]) => n.includes(term)).slice(0, 120).map(([c]) => c)
    : tab === "recent" ? recent : (EMOJI_GROUPS.find((g) => g.id === tab)!.list.map(([c]) => c))), [term, tab, recent]);
  return (
    <div className="mb-2 rounded-3xl bg-highest p-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("emoji.search")} aria-label={t("emoji.search")} className="mb-2 w-full rounded-2xl bg-container px-4 py-2.5 text-sm" />
      {!term && (
        <div className="mb-2 flex gap-0.5 overflow-x-auto scroll-thin" role="tablist">
          {["recent", ...EMOJI_GROUPS.map((g) => g.id)].map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} aria-label={t(id === "recent" ? "emoji.recent" : `emoji.cat.${id}` as K)} onClick={() => setTab(id)}
              title={t(id === "recent" ? "emoji.recent" : `emoji.cat.${id}` as K)}
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-xl transition-colors", tab === id ? "bg-pc text-onpc" : "text-muted hover:bg-container")}>
              {id === "recent" ? <span className="text-sm">{t("emoji.recent")}</span> : CAT_ICON[id]}
            </button>
          ))}
        </div>
      )}
      <div className="grid max-h-44 grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-0.5 overflow-y-auto scroll-thin" role="group">
        {list.length === 0 && <p className="col-span-full py-4 text-center text-sm text-muted">{t("emoji.none")}</p>}
        {list.map((e) => <button key={e} onClick={() => pick(e)} className="rounded-xl px-1 py-1 text-2xl transition-colors hover:bg-container">{e}</button>)}
      </div>
    </div>
  );
}
