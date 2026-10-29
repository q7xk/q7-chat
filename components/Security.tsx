"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import * as vault from "@/lib/vault";
import { cn } from "@/lib/cn";
import { btn, field, QR } from "./Connect";
import { Box } from "./ui";

/* ---------- Kilit: password + authenticator (TOTP) ---------- */

export function LockSection() {
  const { t, tk } = useI18n(); const { mgr, snap } = useP2P();
  const [v, setV] = useState<vault.Vault | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState(""), [pw2, setPw2] = useState("");
  const [cur, setCur] = useState(""), [npw, setNpw] = useState(""), [npw2, setNpw2] = useState("");
  const [setup, setSetup] = useState<{ uri: string; key: string; secret: Uint8Array } | null>(null);
  const [code, setCode] = useState(""), [totpPw, setTotpPw] = useState(""), [disCode, setDisCode] = useState("");
  const refresh = useCallback(() => { void vault.getVault().then(setV); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const say = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };

  const setPassword = async () => {
    if (pw.length < 4) return say(false, t("lock.short"));
    if (pw !== pw2) return say(false, t("lock.mismatch"));
    const stored = mgr.exportIdentity();
    if (!stored) return say(false, t("err.generic"));
    try { await vault.createVault(pw, stored); say(true, t("lock.on")); setPw(""); setPw2(""); refresh(); }
    catch { say(false, t("err.generic")); }
  };
  const changePassword = async () => {
    if (npw.length < 4) return say(false, t("lock.short"));
    if (npw !== npw2) return say(false, t("lock.mismatch"));
    const ok = await vault.rotateVault(cur, npw);
    say(ok, ok ? t("lock.on") : t("lock.wrong"));
    if (ok) { setCur(""); setNpw(""); setNpw2(""); refresh(); }
  };
  const removePassword = async () => {
    const ok = await vault.removeVault(cur);
    say(ok, ok ? t("lock.off") : t("lock.wrong"));
    if (ok) { setCur(""); refresh(); }
  };
  const beginTotp = () => {
    const secret = vault.genTotpSecret();
    setSetup({ secret, uri: vault.otpauthUri(secret, snap.settings.name || "Q7"), key: vault.b32(secret) });
  };
  const enableTotp = async () => {
    if (!setup) return;
    const opened = await vault.openVault(totpPw);
    if (!opened) return say(false, t("lock.wrong"));
    if (!(await vault.verifyTotp(setup.secret, code))) return say(false, t("lock.totpWrong"));
    await vault.storeTotp(opened.master, setup.secret);
    setSetup(null); setCode(""); setTotpPw(""); say(true, t("lock.totpOn")); refresh();
  };
  const disableTotp = async () => {
    const opened = await vault.openVault(totpPw);
    if (!opened) return say(false, t("lock.wrong"));
    const secret = await vault.loadTotp(opened.master);
    if (!secret || !(await vault.verifyTotp(secret, disCode))) return say(false, t("lock.totpWrong"));
    await vault.clearTotp(opened.master);
    setTotpPw(""); setDisCode(""); say(true, t("lock.off")); refresh();
  };
  const setIdle = async (idleMin: number) => { await vault.setVaultIdle(idleMin); refresh(); };

  return (
    <Box className="space-y-4">
      {!v ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted">{t("lock.intro")}</p>
          <div className="flex flex-wrap gap-2">
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("lock.pwNew")} aria-label={t("lock.pwNew")} autoComplete="new-password" className={field} />
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder={t("lock.pwConfirm")} aria-label={t("lock.pwConfirm")} autoComplete="new-password" className={field} />
          </div>
          <button onClick={() => void setPassword()} className={cn(btn, "bg-accent text-bg")}><KeyRound size={15} />{t("lock.set")}</button>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={16} className="text-accent" />{t("lock.on")}</p>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">{t("lock.change")}</p>
            <div className="flex flex-wrap gap-2">
              <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder={t("lock.pwCurrent")} aria-label={t("lock.pwCurrent")} autoComplete="current-password" className={field} />
              <input type="password" value={npw} onChange={(e) => setNpw(e.target.value)} placeholder={t("lock.pwNew")} aria-label={t("lock.pwNew")} autoComplete="new-password" className={field} />
              <input type="password" value={npw2} onChange={(e) => setNpw2(e.target.value)} placeholder={t("lock.pwConfirm")} aria-label={t("lock.pwConfirm")} autoComplete="new-password" className={field} />
            </div>
            <button onClick={() => void changePassword()} className={cn(btn, "bg-sc text-onsc")}>{t("lock.change")}</button>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">{t("lock.remove")}</p>
            <div className="flex flex-wrap gap-2">
              <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder={t("lock.pwCurrent")} aria-label={t("lock.pwCurrent")} autoComplete="current-password" className={field} />
              <button onClick={() => void removePassword()} className={cn(btn, "bg-danger/10 text-danger")}>{t("lock.remove")}</button>
            </div>
            <p className="text-xs text-muted">{t("lock.removeAsk")}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">{t("lock.idle")}</p>
            <select value={v.idleMin} onChange={(e) => void setIdle(Number(e.target.value))} aria-label={t("lock.idle")} className={field}>
              <option value={0}>{t("lock.idleOff")}</option>
              {[1, 5, 15, 60].map((m) => <option key={m} value={m}>{t("lock.idleMin", { m })}</option>)}
            </select>
          </div>
          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-sm font-medium">{t("lock.totpTitle")}</p>
            <p className="text-xs leading-relaxed text-muted">{t("lock.totpIntro")}</p>
            {!v.totp && !setup && <button onClick={beginTotp} className={cn(btn, "bg-sc text-onsc")}>{t("lock.totpEnable")}</button>}
            {setup && (
              <div className="space-y-3 rounded-2xl bg-highest p-4">
                <p className="text-xs font-medium text-muted">{t("lock.totpScan")}</p>
                <QR text={setup.uri} />
                <p dir="ltr" className="break-all text-center font-mono text-xs">{setup.key.match(/.{1,4}/g)?.join(" ")}</p>
                <input type="password" value={totpPw} onChange={(e) => setTotpPw(e.target.value)} placeholder={t("lock.pwCurrent")} aria-label={t("lock.pwCurrent")} autoComplete="current-password" className={field} />
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={t("lock.totpCode")} aria-label={t("lock.totpCode")} inputMode="numeric" dir="ltr" className={cn(field, "text-center tracking-[0.3em]")} />
                <div className="flex gap-2">
                  <button onClick={() => void enableTotp()} className={cn(btn, "bg-accent text-bg")}>{t("lock.totpVerify")}</button>
                  <button onClick={() => setSetup(null)} className={cn(btn, "bg-sc text-onsc")}>{t("c.cancel")}</button>
                </div>
              </div>
            )}
            {v.totp && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">{t("lock.totpOn")}</span>
                <input type="password" value={totpPw} onChange={(e) => setTotpPw(e.target.value)} placeholder={t("lock.pwCurrent")} aria-label={t("lock.pwCurrent")} autoComplete="current-password" className={field} />
                <input value={disCode} onChange={(e) => setDisCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={t("lock.totpCode")} aria-label={t("lock.totpCode")} inputMode="numeric" dir="ltr" className={cn(field, "text-center tracking-[0.3em]")} />
                <button onClick={() => void disableTotp()} className={cn(btn, "bg-danger/10 text-danger")}>{t("lock.totpDisable")}</button>
              </div>
            )}
          </div>
        </div>
      )}
      {msg && <p className={cn("text-sm", msg.ok ? "text-accent" : "text-danger")}>{msg.text}</p>}
      <p className="text-xs leading-relaxed text-muted">{t("lock.note")}</p>
    </Box>
  );
}
