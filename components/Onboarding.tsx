"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, PlusCircle, QrCode, Smartphone } from "lucide-react";
import { useP2P } from "@/lib/p2p/context";
import { useI18n, type K } from "@/lib/i18n";
import { createVault } from "@/lib/vault";
import { prepareAvatar } from "@/lib/attach";
import { Avatar, clipShape, type M3Shape } from "./Badges";
import { btn, field, QR } from "./Connect";
import { cn } from "@/lib/cn";



/**
 * First-run setup, shown only when this browser just booted a brand-new identity:
 * path choice (fresh start or adopt from another device) → name → photo → password.
 * The password seals the identity right away and later travels with device adoption,
 * so every device opens with the same secret.
 */
export function Onboarding({ onAdopt }: { onAdopt?: () => void }) {
  const { t } = useI18n(); const { mgr, snap } = useP2P();
  const [step, setStep] = useState<number | "adopt">(0);            // 0 choice · 1 name · 2 photo · 3 password · adopt QR
  const [name, setName] = useState(snap.settings.name);
  const [photo, setPhoto] = useState<string | undefined>(undefined); // undefined = untouched
  const [p1, setP1] = useState(""), [p2, setP2] = useState("");
  const [err, setErr] = useState<K | "">(""); const [busy, setBusy] = useState(false);
  const [qrData, setQrData] = useState<{ qrText: string; code: string; pin: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "adopt") {
      void mgr.beginDeviceSetupReceive().then(setQrData);
    }
  }, [step, mgr]);

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

  if (step === "adopt") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-6">
        <div className="m3-fade flex w-full max-w-md flex-col items-center gap-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pc text-onpc">
            <QrCode size={28} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-ink">Cihazı Hesaba Bağla</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Hesabınızın açık olduğu cihazdan sol alttaki <span className="font-semibold text-ink">Cihazlarım</span> menüsünü açın ve <span className="font-semibold text-accent">QR Kodu Tara</span> ile bu kodu okutun.
            </p>
          </div>

          <div className="space-y-3 rounded-3xl bg-highest p-4">
            {qrData ? (
              <QR text={qrData.qrText} />
            ) : (
              <div className="mx-auto flex h-72 w-72 items-center justify-center rounded-2xl bg-container">
                <Loader2 size={32} className="animate-spin text-muted" />
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-xs text-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="h-2 w-2 rounded-full bg-accent" />
              </span>
              Diğer cihazınızdan taranması bekleniyor…
            </div>
          </div>

          <button
            onClick={() => {
              void mgr.cancelDevicePairing();
              setStep(0);
            }}
            className={cn(btn, "bg-sc text-onsc")}
          >
            <ChevronLeft size={15} />
            {t("ob.back")}
          </button>
        </div>
      </div>
    );
  }

  if (step === 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-6">
        <div className="m3-fade flex w-full max-w-md flex-col items-center gap-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Q7 Chat"
            width={84}
            height={84}
            className="h-20 w-20 object-contain drop-shadow"
          />
          <p className="text-2xl font-semibold text-ink">{t("ob.startTitle")}</p>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <button onClick={() => setStep(1)} className="m3-press flex flex-col items-center gap-2 rounded-3xl bg-sc p-6 text-center hover:brightness-110">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pc text-onpc"><PlusCircle size={20} /></span>
              <span className="text-sm font-medium text-ink">{t("ob.startFresh")}</span>
              <span className="text-xs leading-relaxed text-muted">{t("ob.startFreshNote")}</span>
            </button>
            <button onClick={() => setStep("adopt")} className="m3-press flex flex-col items-center gap-2 rounded-3xl bg-sc p-6 text-center hover:brightness-110">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pc text-onpc"><Smartphone size={20} /></span>
              <span className="text-sm font-medium text-ink">{t("ob.haveAccount")}</span>
              <span className="text-xs leading-relaxed text-muted">QR kod ile mevcut hesabınıza bu cihazı ekleyin</span>
            </button>
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
          <p className="text-2xl font-semibold text-ink">{titles[step - 1]}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t((["ob.nameNote", "ob.photoNote", "ob.passNote"] as const)[step - 1])}</p>
        </div>

        {step === 1 && (
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ob.namePh")} maxLength={40}
            className={cn(field, "text-center text-lg")} onKeyDown={(e) => { if (e.key === "Enter") setStep(2); }} />
        )}
        {step === 2 && (
          <button onClick={() => file.current?.click()} className={cn(btn, "bg-pc text-onpc")}>
            {photo ? <ImagePlus size={15} /> : <Camera size={15} />}{t("ob.photoPick")}
          </button>
        )}
        {step === 3 && (
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
            {[1, 2, 3].map((i) => <span key={i} className={cn("h-1.5 w-6 rounded-full transition-colors", i <= step ? "bg-accent" : "bg-line")} />)}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(step - 1)} className={cn(btn, "bg-sc text-onsc")}><ChevronLeft size={15} />{t("ob.back")}</button>
            {step === 2 && <button onClick={() => setStep(3)} className={cn(btn, "bg-sc text-onsc")}>{t("ob.skip")}</button>}
            {step === 1 && <button onClick={() => setStep(2)} disabled={!name.trim()} className={cn(btn, "bg-accent text-bg disabled:opacity-40")}>{t("ob.next")}<ChevronRight size={15} /></button>}
            {step === 2 && <button onClick={() => setStep(3)} className={cn(btn, "bg-accent text-bg")}>{t("ob.next")}<ChevronRight size={15} /></button>}
            {step === 3 && (
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
