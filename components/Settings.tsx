"use client";
import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Moon, Palette, Sun, Trash2, Upload } from "lucide-react";
import * as db from "@/lib/db";
import { useStore } from "@/lib/store";
import { useI18n, LANGS } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { prepareAvatar } from "@/lib/attach";
import { MIN_PASSWORD } from "@/lib/backup";
import { ACCENTS } from "@/lib/theme";
import type { PreviewPolicy, SettingsSection } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Avatar, clipShape } from "./Badges";
import { btn, field } from "./Connect";
import { SETTINGS_SECTIONS } from "./TopBar";
import { LockSection } from "./Security";
import { Box, Page } from "./ui";

export function SettingsPanel({ section, onContacts, onSectionSeen }: { section?: SettingsSection | null; onContacts?: () => void; onSectionSeen?: () => void }) {
  const { t, tk, pref, setPref, size } = useI18n(); const { settings, setSettings, wipeLocal, exportBackup, importBackup } = useStore(); const { mgr, snap } = useP2P();
  const [name, setName] = useState(snap.settings.name), [relays, setRelays] = useState(snap.settings.customRelays.join("\n")), [turn, setTurn] = useState(snap.settings.turn?.urls ?? "");
  const [tu, setTu] = useState(snap.settings.turn?.username ?? ""), [tp, setTp] = useState(snap.settings.turn?.credential ?? "");
  const [confirm, setConfirm] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [usage, setUsage] = useState(0);
  const [backupPass, setBackupPass] = useState(""), [backupPass2, setBackupPass2] = useState(""), [backupBusy, setBackupBusy] = useState(false);
  const [importText, setImportText] = useState<string | null>(null), [importPass, setImportPass] = useState(""), [replaceId, setReplaceId] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null), photo = useRef<HTMLInputElement>(null);
  const refs = useRef<Partial<Record<SettingsSection, HTMLElement | null>>>({});
  useEffect(() => { setName(snap.settings.name); }, [snap.settings.name]);
  useEffect(() => { void db.storageUsage().then(setUsage); }, [msg]);
  /* the gear menu navigates here: scroll to the chosen category */
  useEffect(() => { if (section) { refs.current[section]?.scrollIntoView({ behavior: "smooth", block: "start" }); onSectionSeen?.(); } }, [section, onSectionSeen]);

  const enableNotif = async (v: boolean) => {
    setSettings({ notify: v });
    if (v && typeof Notification !== "undefined" && Notification.permission === "default") {
      const r = await Notification.requestPermission();
      if (r !== "granted") setSettings({ notify: false });
    }
  };
  const download = async () => {
    if (backupPass.length < MIN_PASSWORD) { setBackupMsg({ ok: false, text: t("set.backup.short") }); return; }
    if (backupPass !== backupPass2) { setBackupMsg({ ok: false, text: t("set.backup.mismatch") }); return; }
    setBackupBusy(true); setBackupMsg(null);
    try {
      const text = await exportBackup(backupPass);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `q7-backup-${new Date().toISOString().slice(0, 10)}.q7b`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupPass(""); setBackupPass2(""); setBackupMsg({ ok: true, text: t("set.backup.ready") });
    } catch (e) { setBackupMsg({ ok: false, text: tk(e instanceof Error ? e.message : "err.backup.file") }); }
    finally { setBackupBusy(false); }
  };
  const onPickImport = async (f?: File) => {
    if (!f) return;
    if (f.size > 25_000_000) { setBackupMsg({ ok: false, text: t("err.backup.big") }); return; }
    try { setImportText(await f.text()); setImportPass(""); setBackupMsg(null); }
    catch { setBackupMsg({ ok: false, text: t("err.backup.file") }); }
    finally { if (file.current) file.current.value = ""; }
  };
  const onImport = async () => {
    if (!importText) return;
    setBackupBusy(true);
    try {
      const r = await importBackup(importText, importPass, replaceId);
      setBackupMsg({ ok: true, text: t(r.legacy ? "set.backup.legacyDone" : "set.backup.done", { m: r.messages, c: r.contacts, s: r.skipped }) });
      setImportText(null); setImportPass(""); setReplaceId(false);
      // Identity, vault metadata and relay settings are read once by the manager on boot.
      // A reload makes the restored account take effect instead of mixing it with the old one.
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) { setBackupMsg({ ok: false, text: tk(e instanceof Error ? e.message : "err.backup.file") }); }
    finally { setBackupBusy(false); }
  };
  const prev: { v: PreviewPolicy; k: "set.prevAsk" | "set.prevNever" | "set.prevAlways" }[] = [{ v: "ask", k: "set.prevAsk" }, { v: "block", k: "set.prevNever" }, { v: "allow", k: "set.prevAlways" }];
  const fp = snap.fp.slice(0, 32).toUpperCase().replace(/(.{4})/g, "$1 ").trim();
  const blocked = snap.contacts.filter((c) => c.blocked).length;
  const notifDenied = settings.notify && typeof Notification !== "undefined" && Notification.permission === "denied";
  const scale = settings.textScale ?? "m";
  const Sec = ({ id }: { id: SettingsSection }) => {
    const s = SETTINGS_SECTIONS.find((x) => x.id === id)!; const Icon = s.icon;
    return <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted"><Icon size={16} className="text-accent" />{t(s.label)}</h2>;
  };

  return (
    <Page title={t("set.title")} className="stagger">
      {/* Genel: profil, dil, röle/ağ */}
      <section ref={(el) => { refs.current.general = el; }} className="scroll-mt-6 space-y-3"><Sec id="general" />
        <Box className="space-y-4"><p className="text-sm font-medium">{t("set.profile")}</p>
          <div className="flex items-center gap-4"><Avatar title={snap.settings.name} mode="p2p" photo={snap.settings.photo} size={72} shape="clover8" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => photo.current?.click()} className={cn(btn, "bg-sc text-onsc")}><ImagePlus size={15} />{t("set.photo")}</button>
              {snap.settings.photo && <button onClick={() => void mgr.setPhoto(undefined)} className={cn(btn, "bg-sc text-onsc")}>{t("set.photoRemove")}</button>}
            </div>
            <input ref={photo} type="file" accept="image/*" hidden aria-label={t("set.photo")} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { await mgr.setPhoto(await prepareAvatar(f)); } catch {} } e.target.value = ""; }} /></div>
          <div className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label={t("set.name")} placeholder={t("set.name")} className={field} /><button onClick={() => void mgr.setName(name)} className={cn(btn, "bg-sc text-onsc")}>{t("c.save")}</button></div>
          <label className="block space-y-2"><span className="text-xs text-muted">{t("set.lang")}</span>
            <select value={pref} onChange={(e) => setPref(e.target.value)} className={field}><option value="auto">{t("set.langAuto")}</option>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
        </Box>
        <Box className="space-y-4"><p className="text-sm font-medium">{t("set.relay")}</p>
          <label className="flex cursor-pointer gap-3 text-sm"><input type="checkbox" checked={snap.settings.relayEnabled} onChange={(e) => void mgr.setRelayEnabled(e.target.checked)} className="mt-1 accent-[rgb(var(--accent))]" />
            <span><span className="block">{t("set.relayOn")}</span><span className="block text-xs text-muted">{t("set.relayNote")}</span></span></label>
          <p className="text-xs text-muted">{t("set.relays")}</p>
          <textarea dir="ltr" value={relays} onChange={(e) => setRelays(e.target.value)} rows={2} placeholder="wss://relay.example.com:8084/mqtt" aria-label={t("set.relays")} className={cn(field, "resize-none font-mono text-xs")} />
          <button onClick={() => void mgr.setCustomRelays(relays.split(/\s+/).filter(Boolean))} className={cn(btn, "bg-sc text-onsc")}>{t("c.save")}</button>
          {snap.relay.enabled && !!snap.relay.relays?.length && <ul className="space-y-1 text-xs" aria-label={t("set.relays")}>
            {snap.relay.relays.map((r) => <li key={r.url} className="flex items-center gap-2">
              <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", r.connected ? "bg-accent" : "bg-danger")} />
              <span dir="ltr" className="truncate font-mono text-muted">{r.url}</span>
              <span className={cn("ml-auto shrink-0", r.connected ? "text-muted" : "text-danger")}>{t(r.connected ? "thread.online" : "thread.offline")}</span>
            </li>)}
          </ul>}
          <p className="text-xs text-muted">{t("set.turn")}</p>
          <input dir="ltr" value={turn} onChange={(e) => setTurn(e.target.value)} placeholder="turn:turn.example.com:3478" aria-label={t("set.turn")} className={field} />
          <div className="flex gap-2"><input dir="ltr" value={tu} onChange={(e) => setTu(e.target.value)} placeholder="user" aria-label="TURN user" className={field} /><input dir="ltr" value={tp} onChange={(e) => setTp(e.target.value)} type="password" placeholder="password" aria-label="TURN password" className={field} /></div>
          <button onClick={() => void mgr.setTurn(turn.trim() ? { urls: turn.trim(), username: tu || undefined, credential: tp || undefined } : undefined)} className={cn(btn, "bg-sc text-onsc")}>{t("c.save")}</button>
        </Box>
      </section>

      {/* Bildirimler */}
      <section ref={(el) => { refs.current.notifications = el; }} className="scroll-mt-6 space-y-3"><Sec id="notifications" />
        <Box className="space-y-3">
          <label className="flex cursor-pointer gap-3 text-sm"><input type="checkbox" checked={!!settings.notify} onChange={(e) => void enableNotif(e.target.checked)} className="mt-1 accent-[rgb(var(--accent))]" />
            <span><span className="block">{t("set.notif.enable")}</span><span className="block text-xs text-muted">{t("set.notif.note")}</span></span></label>
          {settings.notify && <>
            <label className="flex cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={settings.notifySound !== false} onChange={(e) => setSettings({ notifySound: e.target.checked })} className="accent-[rgb(var(--accent))]" /><span>{t("set.notif.sound")}</span></label>
            <label className="flex cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={settings.notifyPreview !== false} onChange={(e) => setSettings({ notifyPreview: e.target.checked })} className="accent-[rgb(var(--accent))]" /><span>{t("set.notif.preview")}</span></label>
            {notifDenied && <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-xs leading-relaxed text-danger">{t("set.notif.denied")}</p>}
          </>}
        </Box>
      </section>

      {/* Mesaj ve medya: harici görseller + mesaj ömrü */}
      <section ref={(el) => { refs.current.media = el; }} className="scroll-mt-6 space-y-3"><Sec id="media" />
        <Box className="space-y-3"><p className="text-sm font-medium">{t("set.sec.media")}</p><p className="text-xs text-muted">{t("set.prev")}</p>
          <div role="radiogroup" aria-label={t("set.prev")} className="flex flex-wrap gap-2">
            {prev.map((o) => <button key={o.v} role="radio" aria-checked={settings.previews === o.v} onClick={() => setSettings({ previews: o.v })} className={cn("rounded-xl border px-4 py-2 text-sm font-medium transition-colors", settings.previews === o.v ? "border-transparent bg-sc text-onsc" : "border-line text-muted hover:bg-container")}>{t(o.k)}</button>)}
          </div>
          <p className="text-xs leading-relaxed text-muted">{t("set.expiry")}</p>
        </Box>
      </section>

      {/* Görünüm: tema + vurgu rengi */}
      <section ref={(el) => { refs.current.look = el; }} className="scroll-mt-6 space-y-3"><Sec id="look" />
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
        </Box>
      </section>

      {/* Erişilebilirlik: animasyon + yazı boyutu */}
      <section ref={(el) => { refs.current.a11y = el; }} className="scroll-mt-6 space-y-3"><Sec id="a11y" />
        <Box className="space-y-4">
          <label className="flex cursor-pointer gap-3 text-sm"><input type="checkbox" checked={!!settings.reduceMotion} onChange={(e) => setSettings({ reduceMotion: e.target.checked })} className="mt-1 accent-[rgb(var(--accent))]" />
            <span><span className="block">{t("set.a11y.motion")}</span><span className="block text-xs text-muted">{t("set.a11y.motionNote")}</span></span></label>
          <div className="space-y-2"><p className="text-xs text-muted">{t("set.a11y.text")}</p>
            <div className="inline-flex rounded-full bg-highest p-1" role="group" aria-label={t("set.a11y.text")}>
              {(["s", "m", "l"] as const).map((x) => <button key={x} onClick={() => setSettings({ textScale: x })} aria-pressed={scale === x} className={cn("rounded-full px-4 py-2 text-sm", scale === x ? "bg-pc text-onpc" : "text-muted")}>{t(`set.a11y.${x}`)}</button>)}
            </div>
          </div>
        </Box>
      </section>

      {/* Erişim kısıtlamaları: yalnızca kişiler + engellenenler */}
      <section ref={(el) => { refs.current.restrict = el; }} className="scroll-mt-6 space-y-3"><Sec id="restrict" />
        <Box className="space-y-3">
          <label className="flex cursor-pointer gap-3 text-sm"><input type="checkbox" checked={!!snap.settings.onlyContacts} onChange={(e) => void mgr.setOnlyContacts(e.target.checked)} className="mt-1 accent-[rgb(var(--accent))]" />
            <span><span className="block">{t("set.restrict.only")}</span><span className="block text-xs text-muted">{t("set.restrict.note")}</span></span></label>
          {blocked > 0 && <p className="text-xs text-muted">{t("set.restrict.blocked", { n: blocked })}</p>}
          {blocked > 0 && onContacts && <button onClick={onContacts} className={cn(btn, "bg-sc text-onsc")}>{t("nav.contacts")}</button>}
        </Box>
      </section>

      {/* Veri gizliliği: şifreleme + depolama */}
      <section ref={(el) => { refs.current.privacy = el; }} className="scroll-mt-6 space-y-3"><Sec id="privacy" />
        <Box className="space-y-3"><p className="text-sm font-medium">{t("set.enc")}</p><p className="text-xs leading-relaxed text-muted">{t("set.encNote")}</p>
          <p className="text-xs text-muted">{t("set.fp")}</p><p className="rounded-2xl bg-highest px-4 py-3 text-center text-sm tabular-nums tracking-wide" dir="ltr">{fp || "…"}</p></Box>
        <Box className="space-y-4"><p className="text-sm font-medium">{t("set.storage")}</p>
          <p className="text-xs text-muted">{t("set.usage", { size: size(usage) })}</p>
          <p className="text-xs leading-relaxed text-muted">{t("set.backup.hint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="password" value={backupPass} onChange={(e) => setBackupPass(e.target.value)} placeholder={t("set.backup.pass")} aria-label={t("set.backup.pass")} autoComplete="new-password" className={field} />
            <input type="password" value={backupPass2} onChange={(e) => setBackupPass2(e.target.value)} placeholder={t("set.backup.pass2")} aria-label={t("set.backup.pass2")} autoComplete="new-password" className={field} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void download()} disabled={backupBusy} className={cn(btn, "bg-sc text-onsc disabled:opacity-50")}><Download size={15} />{t("set.export")}</button>
            <button onClick={() => file.current?.click()} className={cn(btn, "bg-sc text-onsc")}><Upload size={15} />{t("set.import")}</button>
            <input ref={file} type="file" accept=".q7b,.json,application/json" hidden aria-label={t("set.import")} onChange={(e) => void onPickImport(e.target.files?.[0])} />
          </div>
          {importText && <div role="alertdialog" className="space-y-3 rounded-3xl bg-tc p-4 text-ontc">
            <p className="text-sm">{t("set.backup.restore")}</p>
            <input type="password" value={importPass} onChange={(e) => setImportPass(e.target.value)} placeholder={t("set.backup.pass")} aria-label={t("set.backup.pass")} autoComplete="current-password" className={cn(field, "bg-bg/10 text-ontc placeholder:text-ontc/60")} />
            <label className="flex cursor-pointer gap-2 text-xs"><input type="checkbox" checked={replaceId} onChange={(e) => setReplaceId(e.target.checked)} className="mt-0.5 accent-[rgb(var(--accent))]" /><span>{t("set.backup.replace")}</span></label>
            <div className="flex gap-2"><button onClick={() => void onImport()} disabled={backupBusy} className={cn(btn, "bg-accent text-bg disabled:opacity-50")}>{t("set.backup.restore")}</button><button onClick={() => { setImportText(null); setImportPass(""); setReplaceId(false); }} className="rounded-full px-4 py-2 text-sm">{t("c.cancel")}</button></div>
          </div>}
          {backupMsg && <p role="status" className={cn("text-sm", backupMsg.ok ? "text-muted" : "text-danger")}>{backupMsg.text}</p>}
          <p className="text-xs leading-relaxed text-muted">{t("set.backup.noblobs")}</p>
          {msg && <p role="status" className={cn("text-sm", msg.ok ? "text-muted" : "text-danger")}>{msg.text}</p>}
          {!confirm ? <button onClick={() => setConfirm(true)} className="inline-flex items-center gap-2 rounded-full border border-danger/50 px-4 py-2 text-sm text-danger"><Trash2 size={14} />{t("set.wipe")}</button>
            : <div role="alertdialog" className="space-y-3 rounded-3xl bg-danger/10 p-4"><p className="text-sm">{t("set.wipeAsk")}</p>
              <div className="flex gap-2"><button onClick={() => { void mgr.wipe(wipeLocal); setConfirm(false); setMsg(null); }} className="rounded-full bg-danger px-5 py-2 text-sm font-medium text-bg">{t("set.wipe")}</button><button onClick={() => setConfirm(false)} className="rounded-full px-4 py-2 text-sm text-muted">{t("c.cancel")}</button></div></div>}
        </Box>
      </section>
      <section ref={(el) => { refs.current.lock = el; }} className="scroll-mt-6 space-y-3"><Sec id="lock" />
        <LockSection />
      </section>
    </Page>
  );
}
