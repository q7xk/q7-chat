"use client";
import { useEffect, useState } from "react";
import { CalendarPlus, Download, ExternalLink, FileText, MapPin, UserPlus } from "lucide-react";
import * as db from "@/lib/db";
import type { Message } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { formatCode } from "@/lib/p2p/crypto";
import { cn } from "@/lib/cn";

function useBlob(id: string) {
  const { blobTick } = useStore(); const [state, setState] = useState<{ url: string; blob: Blob } | null>(null);
  useEffect(() => {
    let live = true, url = "";
    db.getBlob(id).then((r) => { if (live && r) { url = URL.createObjectURL(r.blob); setState({ url, blob: r.blob }); } }).catch(() => {});
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [id, blobTick]);
  return state;
}
const save = (url: string, name: string) => { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); };

function ics(title: string, start: number, place?: string, note?: string) {
  const f = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const e = (s: string) => s.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\r?\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Q7 Message//EN", "BEGIN:VEVENT", `UID:${start}-${title.length}@q7`, `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(start)}`, `DTEND:${f(start + 3600000)}`, `SUMMARY:${e(title)}`, ...(place ? [`LOCATION:${e(place)}`] : []), ...(note ? [`DESCRIPTION:${e(note)}`] : []), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

export function AttachmentView({ m, p2p, onVote }: { m: Message; p2p: boolean; onVote: (choices: number[]) => void }) {
  const { t, size, date } = useI18n(); const { mgr, snap } = useP2P();
  const a = m.att; const file = useBlob(a?.t === "file" ? m.id : "");
  if (!a) return null;
  const chip = "inline-flex items-center gap-2 rounded-full bg-black/10 px-4 py-2 text-sm font-medium";

  if (a.t === "file") {
    if (!file) return <p className="mt-1 text-sm opacity-80">{a.name} · {t("file.receiving")}</p>;
    if (a.kind === "image") return /* eslint-disable-next-line @next/next/no-img-element */ <img src={file.url} alt={a.name} className="max-h-72 w-full rounded-2xl object-contain" />;
    return (
      <div className="flex items-center gap-3"><FileText size={26} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{a.name}</p><p className="text-xs opacity-80">{size(a.size)}</p></div>
        <button onClick={() => save(file.url, a.name)} aria-label={t("c.save")} className="rounded-full bg-black/10 p-2.5"><Download size={18} /></button></div>
    );
  }
  if (a.t === "location") {
    const u = `https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lon}#map=16/${a.lat}/${a.lon}`;
    return <div className="space-y-2"><p className="flex items-center gap-2 text-sm font-medium"><MapPin size={18} />{a.lat}, {a.lon}</p><a href={u} target="_blank" rel="noopener noreferrer nofollow" className={chip}><ExternalLink size={14} />{t("loc.open")}</a></div>;
  }
  if (a.t === "contact") {
    const known = snap.contacts.some((c) => c.pub === a.pub) || snap.pub === a.pub;
    return (
      <div className="flex items-center gap-3"><UserPlus size={22} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{a.name}</p><p className="text-xs tabular-nums opacity-80">{formatCode(a.code)}</p></div>
        {!known && <button onClick={() => void mgr.connectToPub(a.pub)} className={chip}>{t("thread.connect")}</button>}</div>
    );
  }
  if (a.t === "poll") {
    const me = p2p ? snap.fp : "local", mine = a.votes[me] ?? [], total = Object.keys(a.votes).length;
    const count = (i: number) => Object.values(a.votes).filter((v) => v.includes(i)).length;
    const toggle = (i: number) => onVote(a.multi ? (mine.includes(i) ? mine.filter((x) => x !== i) : [...mine, i]) : [i]);
    return (
      <div className="min-w-56 space-y-2"><p className="text-sm font-semibold">{a.q}</p>
        {a.opts.map((o, i) => (
          <button key={i} onClick={() => toggle(i)} aria-pressed={mine.includes(i)} className="relative block w-full overflow-hidden rounded-2xl bg-black/10 px-4 py-2.5 text-start text-sm">
            <span className="absolute inset-y-0 start-0 bg-black/15" style={{ width: total ? `${(count(i) / total) * 100}%` : 0 }} aria-hidden />
            <span className="relative flex justify-between gap-3"><span className={cn(mine.includes(i) && "font-semibold")}>{mine.includes(i) ? "✓ " : ""}{o}</span><span className="tabular-nums">{count(i)}</span></span>
          </button>
        ))}
        <p className="text-xs opacity-80">{t("poll.votes", { n: total })}</p></div>
    );
  }
  return (
    <div className="space-y-1"><p className="text-sm font-semibold">{a.title}</p><p className="text-sm">{date(a.start)}</p>
      {a.place && <p className="flex items-center gap-1 text-sm"><MapPin size={14} />{a.place}</p>}{a.note && <p className="text-sm opacity-90">{a.note}</p>}
      <button className={chip} onClick={() => { const u = URL.createObjectURL(new Blob([ics(a.title, a.start, a.place, a.note)], { type: "text/calendar" })); save(u, "event.ics"); setTimeout(() => URL.revokeObjectURL(u), 1000); }}><CalendarPlus size={14} />{t("ev.cal")}</button></div>
  );
}
