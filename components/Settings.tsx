"use client";
import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Moon, Palette, Sun, Trash2, Upload } from "lucide-react";
import * as db from "@/lib/db";
import { useStore } from "@/lib/store";
import { useI18n, LANGS } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { prepareAvatar } from "@/lib/attach";
import { ACCENTS } from "@/lib/theme";
import type { PreviewPolicy } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Avatar, clipShape } from "./Badges";
import { btn, field } from "./Connect";
import { Box, Page } from "./ui";

export function SettingsPanel() {
  const { t, tk, pref, setPref, size } = useI18n(); const { settings, setSettings, wipeLocal, exportLocal, importLocal } = useStore(); const { mgr, snap } = useP2P();
  const [name, setName] = useState(snap.settings.name), [relays, setRelays] = useState(snap.settings.customRelays.join("\n")), [turn, setTurn] = useState(snap.settings.turn?.urls ?? "");
  const [tu, setTu] = useState(snap.settings.turn?.username ?? ""), [tp, setTp] = useState(snap.settings.turn?.credential ?? "");
  const [warn, setWarn] = useState(false), [confirm, setConfirm] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [usage, setUsage] = useState(0);
  const file = useRef<HTMLInputElement>(null), photo = useRef<HTMLInputElement>(null);
  useEffect(() => { setName(snap.settings.name); }, [snap.settings.name]);
  useEffect(() => { void db.storageUsage().then(setUsage); }, [msg]);

  const download = async () => {
    try { const url = URL.createObjectURL(new Blob([await exportLocal()], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `q7-local-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setWarn(false); }
    catch { setMsg({ ok: false, text: t("err.generic") }); }
  };
  const onImport = async (f?: File) => {
    if (!f) return;
    try { if (f.size > 10_000_000) throw new Error("err.import"); const r = await importLocal(await f.text()); setMsg({ ok: true, text: t("set.imported", { m: r.messages, s: r.skipped }) }); }
    catch (e) { setMsg({ ok: false, text: tk(e instanceof Error ? e.message : "err.import") }); }
    if (file.current) file.current.value = "";
  };
  const prev: { v: PreviewPolicy; k: "set.prevAsk" | "set.prevNever" | "set.prevAlways" }[] = [{ v: "ask", k: "set.prevAsk" }, { v: "block", k: "set.prevNever" }, { v: "allow", k: "set.prevAlways" }];
  const fp = snap.fp.slice(0, 32).toUpperCase().replace(/(.{4})/g, "$1 ").trim();

  return (
    <Page title={t("set.title")}>
      <Box className="space-y-4"><p className="text-sm font-medium">{t("set.profile")}</p>
        <div className="flex items-center gap-4"><Avatar title={snap.settings.name} mode="p2p" photo={snap.settings.photo} size={72} shape="clover8" />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => photo.current?.click()} className={cn(btn, "bg-sc text-onsc")}><ImagePlus size={15} />{t("set.photo")}</button>
            {snap.settings.photo && <button onClick={() => void mgr.setPhoto(undefined)} className={cn(btn, "bg-sc text-onsc")}>{t("set.photoRemove")}</button>}
          </div>
          <input ref={photo} type="file" accept="image/*" hidden aria-label={t("set.photo")} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { await mgr.setPhoto(await prepareAvatar(f)); } catch {} } e.target.value = ""; }} /></div>
        <div className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label={t("set.name")} placeholder={t("set.name")} className={field} /><button onClick={() => void mgr.setName(name)} className={cn(btn, "bg-sc text-onsc")}>{t("c.save")}</button></div>
      </Box>

      <Box className="space-y-3"><p className="text-sm font-medium">{t("set.privacy")}</p><p className="text-xs text-muted">{t("set.prev")}</p>
        <div role="radiogroup" aria-label={t("set.prev")} className="flex flex-wrap gap-2">
          {prev.map((o) => <button key={o.v} role="radio" aria-checked={settings.previews === o.v} onClick={() => setSettings({ previews: o.v })} className={cn("rounded-xl border px-4 py-2 text-sm font-medium transition-colors", settings.previews === o.v ? "border-transparent bg-sc text-onsc" : "border-line text-muted hover:bg-container")}>{t(o.k)}</button>)}
        </div>
      </Box>

      <Box className="space-y-3"><p className="text-sm font-medium">{t("set.enc")}</p><p className="text-xs leading-relaxed text-muted">{t("set.encNote")}</p>
        <p className="text-xs text-muted">{t("set.fp")}</p><p className="rounded-2xl bg-highest px-4 py-3 text-center text-sm tabular-nums tracking-wide" dir="ltr">{fp || "…"}</p></Box>

      <Box className="space-y-4"><p className="text-sm font-medium">{t("set.relay")}</p>
        <label className="flex cursor-pointer gap-3 text-sm"><input type="checkbox" checked={snap.settings.relayEnabled} onChange={(e) => void mgr.setRelayEnabled(e.target.checked)} className="mt-1 accent-[rgb(var(--accent))]" />
          <span><span className="block">{t("set.relayOn")}</span><span className="block text-xs text-muted">{t("set.relayNote")}</span></span></label>
        <p className="text-xs text-muted">{t("set.relays")}</p>
        <textarea dir="ltr" value={relays} onChange={(e) => setRelays(e.target.value)} rows={2} placeholder="wss://relay.example.com:8084/mqtt" aria-label={t("set.relays")} className={cn(field, "resize-none font-mono text-xs")} />
        <button onClick={() => void mgr.setCustomRelays(relays.split(/\s+/).filter(Boolean))} className={cn(btn, "bg-sc text-onsc")}>{t("c.save")}</button>
        <p className="text-xs text-muted">{t("set.turn")}</p>
        <input dir="ltr" value={turn} onChange={(e) => setTurn(e.target.value)} placeholder="turn:turn.example.com:3478" aria-label={t("set.turn")} className={field} />
        <div className="flex gap-2"><input dir="ltr" value={tu} onChange={(e) => setTu(e.target.value)} placeholder="user" aria-label="TURN user" className={field} /><input dir="ltr" value={tp} onChange={(e) => setTp(e.target.value)} type="password" placeholder="password" aria-label="TURN password" className={field} /></div>
        <button onClick={() => void mgr.setTurn(turn.trim() ? { urls: turn.trim(), username: tu || undefined, credential: tp || undefined } : undefined)} className={cn(btn, "bg-sc text-onsc")}>{t("c.save")}</button>
      </Box>

      <Box className="space-y-4"><p className="text-sm font-medium">{t("set.look")}</p>
        <div className="inline-flex rounded-full bg-highest p-1" role="group">
          {(["dark", "light"] as const).map((x) => <button key={x} onClick={() => setSettings({ theme: x })} aria-pressed={settings.theme === x} className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm", settings.theme === x ? "bg-pc text-onpc" : "text-muted")}>{x === "dark" ? <Moon size={14} /> : <Sun size={14} />}{t(x === "dark" ? "set.dark" : "set.light")}</button>)}
        </div>
        <div className="space-y-2"><p className="text-xs text-muted">{t("set.themeColor")}</p>
          <div role="radiogroup" aria-label={t("set.themeColor")} className="flex flex-wrap items-center gap-3 pb-1">
            {ACCENTS.map((a) => (
              <span key={a.id} className="relative">
                <button role="radio" aria-checked={settings.accent === a.id} onClick={() => setSettings({ accent: a.id })} title={t("set.themeColor")}
                  className="block h-9 w-9 transition-[filter,transform] duration-200 ease-spring hover:scale-110 active:scale-95"
                  style={{ ...clipShape("cookie12"), backgroundColor: `hsl(${a.hue} 60% 55%)` }} />
                {settings.accent === a.id && <span className="absolute inset-x-0 -bottom-1.5 mx-auto h-1 w-1 rounded-full bg-ink" />}
              </span>
            ))}
            <span className="relative">
              <label className="flex h-9 w-9 cursor-pointer items-center justify-center text-white transition-[filter,transform] duration-200 ease-spring hover:scale-110 active:scale-95"
                title={t("set.themeCustom")} style={{ ...clipShape("cookie12"), background: settings.accent.startsWith("#") ? settings.accent : "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
                {!settings.accent.startsWith("#") && <Palette size={14} />}
                <input type="color" value={settings.accent.startsWith("#") ? settings.accent : "#435dff"} onChange={(e) => setSettings({ accent: e.target.value })} aria-label={t("set.themeCustom")} className="absolute h-0 w-0 opacity-0" />
              </label>
              {settings.accent.startsWith("#") && <span className="absolute inset-x-0 -bottom-1.5 mx-auto h-1 w-1 rounded-full bg-ink" />}
            </span>
          </div>
        </div>
        <label className="block space-y-2"><span className="text-xs text-muted">{t("set.lang")}</span>
          <select value={pref} onChange={(e) => setPref(e.target.value)} className={field}><option value="auto">{t("set.langAuto")}</option>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
      </Box>

      <Box className="space-y-4"><p className="text-sm font-medium">{t("set.storage")}</p>
        <p className="text-xs text-muted">{t("set.usage", { size: size(usage) })}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setWarn(true); setMsg(null); }} className={cn(btn, "bg-sc text-onsc")}><Download size={15} />{t("set.export")}</button>
          <button onClick={() => file.current?.click()} className={cn(btn, "bg-sc text-onsc")}><Upload size={15} />{t("set.import")}</button>
          <input ref={file} type="file" accept="application/json,.json" hidden aria-label={t("set.import")} onChange={(e) => void onImport(e.target.files?.[0])} />
        </div>
        {warn && <div role="alertdialog" className="space-y-3 rounded-3xl bg-tc p-4 text-ontc"><p className="text-sm">{t("set.exportWarn")}</p>
          <div className="flex gap-2"><button onClick={download} className={cn(btn, "bg-accent text-bg")}>{t("set.export")}</button><button onClick={() => setWarn(false)} className="rounded-full px-4 py-2 text-sm">{t("c.cancel")}</button></div></div>}
        {msg && <p role="status" className={cn("text-sm", msg.ok ? "text-muted" : "text-danger")}>{msg.text}</p>}
        {!confirm ? <button onClick={() => setConfirm(true)} className="inline-flex items-center gap-2 rounded-full border border-danger/50 px-4 py-2 text-sm text-danger"><Trash2 size={14} />{t("set.wipe")}</button>
          : <div role="alertdialog" className="space-y-3 rounded-3xl bg-danger/10 p-4"><p className="text-sm">{t("set.wipeAsk")}</p>
            <div className="flex gap-2"><button onClick={() => { void mgr.wipe(wipeLocal); setConfirm(false); setMsg(null); }} className="rounded-full bg-danger px-5 py-2 text-sm font-medium text-bg">{t("set.wipe")}</button><button onClick={() => setConfirm(false)} className="rounded-full px-4 py-2 text-sm text-muted">{t("c.cancel")}</button></div></div>}
        <p className="text-xs leading-relaxed text-muted">{t("set.expiry")}</p>
      </Box>
    </Page>
  );
}
