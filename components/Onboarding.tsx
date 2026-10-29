"use client";
import { useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, PlusCircle, Smartphone } from "lucide-react";
import { useP2P } from "@/lib/p2p/context";
import { useI18n, type K } from "@/lib/i18n";
import { createVault } from "@/lib/vault";
import { prepareAvatar } from "@/lib/attach";
import { Avatar } from "./Badges";
import { btn, field } from "./Connect";
import { cn } from "@/lib/cn";
import { Splash } from "./Splash";

/**
 * First-run setup, shown only when this browser just booted a brand-new identity:
 * splash → path choice (fresh start or adopt from another device) → name → photo →
 * password. The password seals the identity right away and later travels with device
 * adoption, so every device opens with the same secret.
 */
export function Onboarding({ onAdopt }: { onAdopt?: () => void }) {
  const { t } = useI18n(); const { mgr, snap } = useP2P();
  const [step, setStep] = useState(0);                              // 0 splash · 1 choice · 2 name · 3 photo · 4 password
  const [name, setName] = useState(snap.settings.name);
  const [photo, setPhoto] = useState<string | undefined>(undefined); // undefined = untouched
  const [p1, setP1] = useState(""), [p2, setP2] = useState("");
  const [err, setErr] = useState<K | "">(""); const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const finish = async () => {
    if (p1.length < 6) { setErr("ob.passShort"); return; }
    if (p1 !== p2) { setErr("ob.passMismatch"); return; }
    setErr(""); setBusy(true);
    try {
      await mgr.setName(name.trim() || snap.settings.name);
      if (photo) await mgr.setPhoto(photo);
      const stored = mgr.exportIdentity();
      if (stored) await createVault(p1, stored);
      await mgr.completeOnboarding();
    } catch { setErr("err.generic"); setBusy(false); return; }
  };

  if (step === 0) return <Splash onDone={() => setStep(1)} />;
  if (step === 1) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-6">
        <div className="m3-fade flex w-full max-w-md flex-col items-center gap-8 text-center">
          <p className="text-2xl font-semibold text-ink">{t("ob.startTitle")}</p>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <button onClick={() => setStep(2)} className="m3-press flex flex-col items-center gap-2 rounded-3xl bg-sc p-6 text-center hover:brightness-110">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pc text-onpc"><PlusCircle size={20} /></span>
              <span className="text-sm font-medium text-ink">{t("ob.startFresh")}</span>
              <span className="text-xs leading-relaxed text-muted">{t("ob.startFreshNote")}</span>
            </button>
            {onAdopt && (
              <button onClick={onAdopt} className="m3-press flex flex-col items-center gap-2 rounded-3xl bg-sc p-6 text-center hover:brightness-110">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pc text-onpc"><Smartphone size={20} /></span>
                <span className="text-sm font-medium text-ink">{t("ob.haveAccount")}</span>
                <span className="text-xs leading-relaxed text-muted">{t("ob.haveAccountNote")}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  const titles = [t("ob.nameTitle"), t("ob.photoTitle"), t("ob.passTitle")];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-6">
      <div key={step} className="m3-fade flex w-full max-w-md flex-col items-center gap-6">
        <Avatar title={name || "Q7"} mode="p2p" photo={photo} size={96} shape="clover8" />
        <div className="text-center">
          <p className="text-2xl font-semibold text-ink">{titles[step - 2]}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t((["ob.nameNote", "ob.photoNote", "ob.passNote"] as const)[step - 2])}</p>
        </div>

        {step === 2 && (
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ob.namePh")} maxLength={40}
            className={cn(field, "text-center text-lg")} onKeyDown={(e) => { if (e.key === "Enter") setStep(3); }} />
        )}
        {step === 3 && (
          <button onClick={() => file.current?.click()} className={cn(btn, "bg-pc text-onpc")}>
            {photo ? <ImagePlus size={15} /> : <Camera size={15} />}{t("ob.photoPick")}
          </button>
        )}
        {step === 4 && (
          <div className="w-full space-y-2">
            <input autoFocus type="password" value={p1} onChange={(e) => setP1(e.target.value)} placeholder={t("ob.passPh")} className={field} />
            <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} placeholder={t("ob.passConfirmPh")} className={field}
              onKeyDown={(e) => { if (e.key === "Enter") void finish(); }} />
          </div>
        )}
        <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setPhoto(await prepareAvatar(f)); } catch { /* keep the previous picture */ } } e.target.value = ""; }} />
        {err && <p role="alert" className="text-sm text-danger">{t(err)}</p>}

        <div className="flex w-full items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>
            {[1, 2, 3].map((i) => <span key={i} className={cn("h-1.5 w-6 rounded-full transition-colors", i <= step - 1 ? "bg-accent" : "bg-line")} />)}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(step - 1)} className={cn(btn, "bg-sc text-onsc")}><ChevronLeft size={15} />{t("ob.back")}</button>
            {step === 3 && <button onClick={() => setStep(4)} className={cn(btn, "bg-sc text-onsc")}>{t("ob.skip")}</button>}
            {step === 2 && <button onClick={() => setStep(3)} disabled={!name.trim()} className={cn(btn, "bg-accent text-bg disabled:opacity-40")}>{t("ob.next")}<ChevronRight size={15} /></button>}
            {step === 3 && <button onClick={() => setStep(4)} className={cn(btn, "bg-accent text-bg")}>{t("ob.next")}<ChevronRight size={15} /></button>}
            {step === 4 && (
              <button onClick={() => void finish()} disabled={busy} className={cn(btn, "bg-accent text-bg disabled:opacity-40")}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{busy ? t("ob.settingUp") : t("ob.finish")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
