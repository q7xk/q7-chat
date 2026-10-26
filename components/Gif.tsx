"use client";
import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { cn } from "@/lib/cn";

export interface GifPick { url: string; w: number; h: number }
interface Gif { url: string; w: number; h: number }

/** GIPHY browser. Runs fully client-side; the user supplies their own free API key (serverless app). */
export function GifPicker({ onPick }: { onPick: (g: GifPick) => void }) {
  const { t, tk } = useI18n(); const { mgr, snap } = useP2P();
  const [q, setQ] = useState(""); const [items, setItems] = useState<Gif[]>([]);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const [draftKey, setDraftKey] = useState(""); const [showKey, setShowKey] = useState(!snap.settings.giphy);
  const seq = useRef(0); const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const key = snap.settings.giphy ?? "";

  useEffect(() => {
    if (!key) { setShowKey(true); return; }
    const query = (text: string) => {
      const n = ++seq.current; setBusy(true); setFailed(false);
      const url = text
        ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&limit=24&rating=pg-13&q=${encodeURIComponent(text)}`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=pg-13`;
      fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then((d) => {
        if (seq.current !== n) return;
        const list: Gif[] = ((d.data ?? []) as Record<string, never>[]).map((g) => {
          const fx = (g as { images?: { fixed_width?: { url?: string; width?: string; height?: string } } }).images?.fixed_width;
          return { url: fx?.url ?? "", w: Number(fx?.width) || 200, h: Number(fx?.height) || 200 };
        }).filter((g) => /^https:\/\//.test(g.url));
        setItems(list);
      }).catch(() => { if (seq.current === n) { setItems([]); setFailed(true); } }).finally(() => { if (seq.current === n) setBusy(false); });
    };
    query(q);
    return () => clearTimeout(timer.current);
  }, [key, q]);

  const saveKey = async () => { await mgr.setGiphyKey(draftKey); setDraftKey(""); setShowKey(false); };

  return (
    <div className="mb-2 space-y-2 rounded-3xl bg-highest p-3">
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("gif.search")} aria-label={t("gif.search")} className="min-w-0 flex-1 rounded-2xl bg-container px-4 py-2.5 text-sm" />
        <button onClick={() => setShowKey((v) => !v)} aria-label={t("set.giphyKey")} className="rounded-full p-2 text-muted transition-colors hover:bg-container hover:text-ink"><ExternalLink size={16} /></button>
      </div>
      {showKey && (
        <div className="space-y-2 rounded-2xl bg-container p-3">
          <p className="text-xs leading-relaxed text-muted">{t("gif.keyNote")}</p>
          <div className="flex gap-2">
            <input value={draftKey} onChange={(e) => setDraftKey(e.target.value)} dir="ltr" placeholder="AbC123…" aria-label={t("set.giphyKey")} className="min-w-0 flex-1 rounded-2xl bg-highest px-4 py-2.5 text-sm" />
            <button onClick={() => void saveKey()} disabled={!draftKey.trim()} className="rounded-full bg-sc px-4 py-2 text-sm font-medium text-onsc disabled:opacity-40">{t("c.save")}</button>
          </div>
        </div>
      )}
      {!key && !showKey && <p className="text-sm text-muted">{t("gif.keyNote")}</p>}
      {busy && <div className="grid grid-cols-3 gap-1">{Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-2xl bg-container" />)}</div>}
      {!busy && items.length > 0 && (
        <div className="grid max-h-52 grid-cols-3 gap-1 overflow-y-auto scroll-thin">
          {items.map((g) => (
            <button key={g.url} onClick={() => onPick(g)} className="overflow-hidden rounded-2xl bg-container transition-[filter] hover:brightness-110">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt="" width={g.w} height={g.h} loading="lazy" className="h-auto w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {!busy && key && items.length === 0 && <p className="py-2 text-center text-sm text-muted">{failed ? t("err.generic") : t("gif.none")}</p>}
      <p className={cn("text-end text-[10px] text-muted", !key && "hidden")}>{t("gif.trending")} · GIPHY</p>
      {failed && <p className="text-center text-xs text-danger">{tk("err.generic")}</p>}
    </div>
  );
}
