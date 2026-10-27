"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import * as vault from "@/lib/vault";
import { cn } from "@/lib/cn";
import { clipShape } from "./Badges";
import { btn, field } from "./Connect";
import { Logo } from "./Logo";

/** The lock screen: password (+ authenticator code when enabled) boots the identity back into memory. */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t, tk } = useI18n();
  const [pw, setPw] = useState(""); const [code, setCode] = useState("");
  const [hasTotp, setHasTotp] = useState(false); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(""); const [fails, setFails] = useState(0); const [cool, setCool] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { void vault.getVault().then((v) => setHasTotp(!!v?.totp)); ref.current?.focus(); }, []);
  useEffect(() => { if (cool <= 0) return; const iv = setInterval(() => setCool((c) => Math.max(0, c - 1)), 1000); return () => clearInterval(iv); }, [cool]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy || cool > 0) return;
    setBusy(true); setErr("");
    try {
      const opened = await vault.openVault(pw);
      if (!opened) throw new Error("lock.wrong");
      if (hasTotp) {
        const secret = await vault.loadTotp(opened.master);
        if (!secret || !(await vault.verifyTotp(secret, code))) throw new Error("lock.totpWrong");
      }
      const id = await vault.vaultIdentity(opened.master);
      if (!id) throw new Error("err.generic");
      vault.setRuntimeIdentity(id);
      onUnlock();
    } catch (ex) {
      setErr(tk(ex instanceof Error ? ex.message : "lock.wrong"));
      const n = fails + 1; setFails(n);
      if (n >= 3) { setCool(10); setFails(0); }
      setPw(""); setCode("");
    } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-[28px] bg-container p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center bg-pc text-onpc" style={clipShape("cookie9")}><KeyRound size={26} /></span>
          <Logo />
          <p className="text-sm text-muted">{t("lock.intro")}</p>
        </div>
        <input ref={ref} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("lock.enterPw")} aria-label={t("lock.enterPw")} autoComplete="current-password" className={field} />
        {hasTotp && <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={t("lock.enterCode")} aria-label={t("lock.enterCode")} inputMode="numeric" autoComplete="one-time-code" dir="ltr" className={cn(field, "text-center tracking-[0.3em]")} />}
        {err && <p className="text-sm text-danger">{err}</p>}
        <button type="submit" disabled={busy || cool > 0 || !pw || (hasTotp && code.length !== 6)} className={cn(btn, "w-full justify-center bg-accent text-bg disabled:opacity-40")}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}{cool > 0 ? `${cool} s` : t("lock.unlock")}
        </button>
        <p className="text-center text-xs text-muted">{t("lock.note")}</p>
      </form>
    </div>
  );
}

/** Boots the app only after the vault (if any) is opened; idle timeout re-locks by remounting. */
export function LockGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "locked" | "open">("loading");
  const [session, setSession] = useState(0);
  useEffect(() => { void vault.getVault().then((v) => setState(v ? "locked" : "open")); }, []);
  useEffect(() => {
    if (state !== "open") return;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const evs: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const iv = setInterval(() => void vault.getVault().then((v) => {
      if (v?.idleMin && Date.now() - last > v.idleMin * 60_000) { setSession((s) => s + 1); setState("locked"); }
    }), 15_000);
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); clearInterval(iv); };
  }, [state]);
  if (state === "loading") return <div className="flex min-h-dvh items-center justify-center"><Logo /></div>;
  if (state === "locked") return <LockScreen onUnlock={() => { setSession((s) => s + 1); setState("open"); }} />;
  return <div key={session} className="contents">{children}</div>;
}
