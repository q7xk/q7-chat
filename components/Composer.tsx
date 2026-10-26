"use client";
import { useEffect, useRef, useState } from "react";
import { Calendar, Camera, FileText, Image as ImageIcon, MapPin, Mic, Paperclip, Send, Smile, Trash2, User, X, BarChart3 } from "lucide-react";
import type { Attachment, Message } from "@/lib/types";
import { pickVoiceMime, prepareDocument, prepareImage, prepareVoice } from "@/lib/attach";
import { useI18n, type K } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { formatCode } from "@/lib/p2p/crypto";
import { cn } from "@/lib/cn";
import { EmojiPicker } from "./Emoji";
import { GifPicker } from "./Gif";

const MAX = 4000;
const field = "w-full rounded-2xl bg-container px-4 py-3 text-sm";
const btn = "rounded-full px-5 py-2 text-sm font-medium";
type Panel = null | "emoji" | "gif" | "attach" | "location" | "contact" | "poll" | "event";
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Rec { mr: MediaRecorder; stream: MediaStream; startedAt: number; mime: string }

export function Composer({ replyTo, onCancelReply, onSend, onAttach }: {
  replyTo?: Message; onCancelReply: () => void; onSend: (body: string) => void; onAttach: (att: Attachment, blob?: Blob) => void;
}) {
  const { t, tk } = useI18n(); const { snap } = useP2P();
  const [text, setText] = useState(""); const [panel, setPanel] = useState<Panel>(null); const [err, setErr] = useState("");
  const [loc, setLoc] = useState<{ lat: number; lon: number } | null>(null); const [locState, setLocState] = useState<"idle" | "wait" | "denied">("idle");
  const [q, setQ] = useState(""); const [opts, setOpts] = useState(["", ""]); const [multi, setMulti] = useState(false);
  const [evT, setEvT] = useState(""); const [evW, setEvW] = useState(""); const [evP, setEvP] = useState(""); const [evN, setEvN] = useState("");
  const [rec, setRec] = useState<Rec | null>(null); const [elapsed, setElapsed] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null); const gal = useRef<HTMLInputElement>(null), cam = useRef<HTMLInputElement>(null), doc = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!rec) return;
    const h = setInterval(() => setElapsed((Date.now() - rec.startedAt) / 1000), 250);
    return () => clearInterval(h);
  }, [rec]);

  const done = (att: Attachment, blob?: Blob) => { onAttach(att, blob); setPanel(null); setErr(""); };
  const send = () => { const b = text.trim(); if (b) { onSend(b.slice(0, MAX)); setText(""); setPanel(null); } };
  const files = async (list: FileList | null, kind: "image" | "document") => {
    for (const f of Array.from(list ?? []).slice(0, 10)) {
      try { const r = kind === "image" ? await prepareImage(f) : prepareDocument(f); onAttach(r.att, r.blob); setPanel(null); setErr(""); }
      catch (e) { setErr(tk(e instanceof Error ? e.message : "err.generic")); }
    }
  };
  const locate = () => {
    setPanel("location"); setLoc(null); setLocState("wait");
    if (!navigator.geolocation) { setLocState("denied"); return; }
    navigator.geolocation.getCurrentPosition((p) => { setLoc({ lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5) }); setLocState("idle"); }, () => setLocState("denied"), { timeout: 15000 });
  };
  const startRec = async () => {
    const mime = pickVoiceMime();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const startedAt = Date.now();
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        const dur = (Date.now() - startedAt) / 1000;
        stream.getTracks().forEach((tr) => tr.stop());
        setRec(null);
        const blob = new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" });
        if (dur < 1 || blob.size === 0) return;
        const r = prepareVoice(blob, dur);
        onAttach(r.att, r.blob);
      };
      mr.start(250);
      setRec({ mr, stream, startedAt, mime: mr.mimeType || mime });
    } catch { setErr(tk("err.noMedia")); }
  };
  const stopRec = (keep: boolean) => {
    const r = rec; if (!r) return;
    if (!keep) r.mr.onstop = () => { r.stream.getTracks().forEach((tr) => tr.stop()); setRec(null); };
    r.mr.stop();
    setElapsed(0);
  };
  const items: { icon: typeof Camera; label: K; run: () => void }[] = [
    { icon: ImageIcon, label: "attach.gallery", run: () => gal.current?.click() }, { icon: Camera, label: "attach.camera", run: () => cam.current?.click() },
    { icon: MapPin, label: "attach.location", run: locate }, { icon: User, label: "attach.contact", run: () => setPanel("contact") },
    { icon: FileText, label: "attach.document", run: () => doc.current?.click() }, { icon: BarChart3, label: "attach.poll", run: () => setPanel("poll") },
    { icon: Calendar, label: "attach.event", run: () => setPanel("event") },
  ];
  const cleanOpts = opts.map((o) => o.trim()).filter(Boolean);
  const tgl = (p: Panel) => setPanel(panel === p ? null : p);

  return (
    <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl border-s-4 border-accent bg-sc px-4 py-2 text-xs text-onsc">
          <span className="min-w-0 flex-1 truncate">{t("thread.replyingTo", { text: replyTo.body || replyTo.link?.title || t("chats.link") })}</span>
          <button onClick={onCancelReply} aria-label={t("c.cancel")}><X size={14} /></button>
        </div>
      )}
      {panel === "emoji" && <EmojiPicker onPick={(e) => { setText((x) => x + e); ref.current?.focus(); }} />}
      {panel === "gif" && <GifPicker onPick={(g) => done({ t: "gif", ...g })} />}
      {panel === "attach" && (
        <div className="mb-2 grid grid-cols-4 gap-2 rounded-3xl bg-highest p-3" role="menu">
          {items.map(({ icon: I, label, run }) => (
            <button key={label} role="menuitem" onClick={run} className="flex flex-col items-center gap-1.5 rounded-2xl p-2 text-xs transition-colors hover:bg-container">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pc text-onpc transition-[filter] hover:brightness-110"><I size={22} /></span>{t(label)}
            </button>
          ))}
        </div>
      )}
      {panel === "location" && (
        <div className="mb-2 space-y-3 rounded-3xl bg-highest p-4"><p className="text-sm font-medium">{t("loc.title")}</p>
          {locState === "wait" && <p className="text-sm text-muted">{t("loc.getting")}</p>}
          {locState === "denied" && <p role="alert" className="text-sm text-danger">{t("loc.denied")}</p>}
          {loc && <><p className="text-sm tabular-nums">{loc.lat}, {loc.lon}</p><button onClick={() => done({ t: "location", ...loc })} className={cn(btn, "bg-accent text-bg transition-[filter] hover:brightness-110")}>{t("loc.share")}</button></>}
        </div>
      )}
      {panel === "contact" && (
        <div className="mb-2 space-y-2 rounded-3xl bg-highest p-4"><p className="text-sm font-medium">{t("ctc.title")}</p>
          {snap.contacts.length === 0 && <p className="text-sm text-muted">{t("ctc.none")}</p>}
          {snap.contacts.map((c) => <button key={c.id} onClick={() => done({ t: "contact", name: c.name, code: c.code, pub: c.pub })} className="flex w-full items-center justify-between rounded-2xl bg-container px-4 py-3 text-start text-sm transition-colors hover:bg-raised"><span>{c.name}</span><span className="tabular-nums text-muted">{formatCode(c.code)}</span></button>)}
        </div>
      )}
      {panel === "poll" && (
        <div className="mb-2 space-y-2 rounded-3xl bg-highest p-4"><p className="text-sm font-medium">{t("poll.title")}</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} placeholder={t("poll.q")} aria-label={t("poll.q")} className={field} />
          {opts.map((o, i) => <input key={i} value={o} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} maxLength={100} placeholder={t("poll.opt", { n: i + 1 })} aria-label={t("poll.opt", { n: i + 1 })} className={field} />)}
          <div className="flex flex-wrap items-center gap-3">
            {opts.length < 6 && <button onClick={() => setOpts([...opts, ""])} className={cn(btn, "bg-sc text-onsc transition-[filter] hover:brightness-110")}>{t("poll.add")}</button>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="accent-[rgb(var(--accent))]" />{t("poll.multi")}</label>
          </div>
          <button disabled={!q.trim() || cleanOpts.length < 2} onClick={() => { done({ t: "poll", q: q.trim(), opts: cleanOpts, multi, votes: {} }); setQ(""); setOpts(["", ""]); }} className={cn(btn, "bg-accent text-bg transition-[filter] hover:brightness-110 disabled:opacity-40")}>{t("poll.send")}</button>
        </div>
      )}
      {panel === "event" && (
        <div className="mb-2 space-y-2 rounded-3xl bg-highest p-4"><p className="text-sm font-medium">{t("ev.title")}</p>
          <input value={evT} onChange={(e) => setEvT(e.target.value)} maxLength={100} placeholder={t("ev.name")} aria-label={t("ev.name")} className={field} />
          <input type="datetime-local" value={evW} onChange={(e) => setEvW(e.target.value)} aria-label={t("ev.when")} className={field} />
          <input value={evP} onChange={(e) => setEvP(e.target.value)} maxLength={100} placeholder={t("ev.where")} aria-label={t("ev.where")} className={field} />
          <input value={evN} onChange={(e) => setEvN(e.target.value)} maxLength={300} placeholder={t("ev.note")} aria-label={t("ev.note")} className={field} />
          <button disabled={!evT.trim() || !evW} onClick={() => { done({ t: "event", title: evT.trim(), start: new Date(evW).getTime(), place: evP.trim() || undefined, note: evN.trim() || undefined }); setEvT(""); setEvW(""); setEvP(""); setEvN(""); }} className={cn(btn, "bg-accent text-bg transition-[filter] hover:brightness-110 disabled:opacity-40")}>{t("ev.send")}</button>
        </div>
      )}
      {err && <p role="alert" className="mb-2 px-2 text-sm text-danger">{err}</p>}
      <input ref={gal} type="file" accept="image/*" multiple hidden onChange={(e) => { void files(e.target.files, "image"); e.target.value = ""; }} />
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void files(e.target.files, "image"); e.target.value = ""; }} />
      <input ref={doc} type="file" multiple hidden onChange={(e) => { void files(e.target.files, "document"); e.target.value = ""; }} />
      {rec ? (
        <div className="flex items-center gap-3 rounded-[28px] bg-highest p-2 ps-4">
          <span className="relative flex h-3 w-3 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-danger" /></span>
          <span className="min-w-0 flex-1 text-sm tabular-nums">{t("voice.rec")} <span dir="ltr" className="opacity-80">{mmss(elapsed)}</span></span>
          <button onClick={() => stopRec(false)} aria-label={t("voice.cancel")} className="rounded-full bg-danger/15 p-2.5 text-danger transition-colors hover:bg-danger/25"><Trash2 size={18} /></button>
          <button onClick={() => stopRec(true)} aria-label={t("voice.send")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-bg transition-[filter] hover:brightness-110"><Send size={18} className="rtl:-scale-x-100" /></button>
        </div>
      ) : (
        <div className="flex items-end gap-1 rounded-[28px] bg-highest p-1.5">
          <button onClick={() => tgl("attach")} aria-label={t("composer.attach")} aria-pressed={panel === "attach"} className="rounded-full p-2.5 text-muted transition-colors hover:bg-container hover:text-ink"><Paperclip size={19} /></button>
          <button onClick={() => tgl("emoji")} aria-label={t("composer.emoji")} aria-pressed={panel === "emoji"} className="rounded-full p-2.5 text-muted transition-colors hover:bg-container hover:text-ink"><Smile size={19} /></button>
          <button onClick={() => tgl("gif")} aria-label={t("composer.gif")} aria-pressed={panel === "gif"} className="rounded-full px-2 py-2.5 text-xs font-bold text-muted transition-colors hover:bg-container hover:text-ink">GIF</button>
          <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={MAX} aria-label={t("composer.ph")} placeholder={t("composer.ph")}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            className="max-h-40 min-h-[42px] flex-1 resize-none bg-transparent px-2 py-3 text-sm focus-visible:outline-none" />
          {text.trim() ? (
            <button onClick={send} aria-label={t("c.send")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-bg transition-[filter] hover:brightness-110"><Send size={18} className="rtl:-scale-x-100" /></button>
          ) : (
            <button onClick={() => void startRec()} aria-label={t("composer.voice")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-bg transition-[filter] hover:brightness-110"><Mic size={18} /></button>
          )}
        </div>
      )}
    </div>
  );
}
