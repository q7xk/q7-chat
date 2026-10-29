"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Laptop, MonitorSmartphone, QrCode, Smartphone, Trash2, X } from "lucide-react";
import { useP2P } from "@/lib/p2p/context";
import { useI18n } from "@/lib/i18n";
import type { LinkedDevice } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Scanner } from "./Scanner";
import { btn, field } from "./Connect";
import { Box, Page } from "./ui";

export function DevicesPanel() {
  const { t } = useI18n();
  const { mgr, snap } = useP2P();
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualPin, setManualPin] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const loadDevices = async () => {
    try {
      const list = await mgr.getLinkedDevices();
      setDevices(list);
    } catch {}
  };

  useEffect(() => {
    void loadDevices();
  }, []);

  const handleQrResult = async (result: string) => {
    setScanning(false);
    setLoading(true);
    setMsg(null);
    try {
      const res = await mgr.addDeviceByQr(result);
      if (res.ok) {
        setMsg({ ok: true, text: "Yeni cihaz başarıyla bağlandı!" });
        await loadDevices();
      } else {
        setMsg({ ok: false, text: "Cihaz eklenemedi. QR kodun geçerli olduğundan emin olun." });
      }
    } catch {
      setMsg({ ok: false, text: "Bir hata oluştu. Lütfen tekrar deneyin." });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualCode.trim() || !manualPin.trim()) return;
    const qrText = `Q7DEV:${manualCode.trim()}:${manualPin.trim()}`;
    await handleQrResult(qrText);
    setManual(false);
    setManualCode("");
    setManualPin("");
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { default: jsQR } = await import("jsqr");
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((res) => { img.onload = res; });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, canvas.width, canvas.height);
        if (code && code.data) {
          await handleQrResult(code.data);
        } else {
          setMsg({ ok: false, text: "Görselde geçerli bir QR kod bulunamadı." });
        }
      }
    } catch {
      setMsg({ ok: false, text: "Görsel işlenirken hata oluştu." });
    }
    e.target.value = "";
  };

  const removeDevice = async (id: string) => {
    await mgr.removeLinkedDevice(id);
    await loadDevices();
  };

  return (
    <Page title="Cihazlarım" className="stagger">
      {/* Cihaz Ekle & QR Tarama */}
      <Box className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-base font-semibold text-ink">
              <MonitorSmartphone size={18} className="text-accent" />
              Cihaz Ekle
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Kurulum ekranındaki QR kodu tarayarak hesabınızı başka bir cihaza bağlayın.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setScanning((v) => !v)}
              className={cn(btn, "bg-accent text-bg shadow-sm")}
            >
              <Camera size={16} />
              QR Kodu Tara
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              className={cn(btn, "bg-sc text-onsc")}
            >
              <QrCode size={16} />
              Görselden Oku
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void handleFileScan(e)}
            />
          </div>
        </div>

        {/* Canlı Kamera Tarayıcı */}
        {scanning && (
          <div className="space-y-2 rounded-3xl bg-highest p-3">
            <div className="flex items-center justify-between px-2 pt-1">
              <span className="text-xs font-semibold text-ink">QR Kodunu Kameraya Hizalayın</span>
              <button
                onClick={() => setScanning(false)}
                className="rounded-full p-1 text-muted hover:bg-container"
              >
                <X size={16} />
              </button>
            </div>
            <Scanner
              prefixes={["Q7DEV:"]}
              onResult={(res) => void handleQrResult(res)}
              onClose={() => setScanning(false)}
            />
          </div>
        )}

        {/* Manuel Kod Girişi Toggle */}
        <div className="pt-1">
          {!manual ? (
            <button
              onClick={() => setManual(true)}
              className="text-xs text-muted underline underline-offset-4 hover:text-ink"
            >
              Kameranız çalışmıyor mu? Kod ile bağlayın
            </button>
          ) : (
            <div className="space-y-3 rounded-2xl bg-highest p-4">
              <p className="text-xs font-semibold text-ink">Manuel Cihaz Kodu Girişi</p>
              <div className="flex flex-wrap gap-2">
                <input
                  dir="ltr"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="12 Haneli Kod"
                  className={cn(field, "flex-1 font-mono text-sm tabular-nums")}
                />
                <input
                  dir="ltr"
                  value={manualPin}
                  onChange={(e) => setManualPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6 Haneli PIN"
                  className={cn(field, "w-32 font-mono text-sm tabular-nums")}
                />
                <button
                  onClick={() => void handleManualSubmit()}
                  disabled={manualCode.length !== 12 || manualPin.length !== 6 || loading}
                  className={cn(btn, "bg-accent text-bg disabled:opacity-40")}
                >
                  {loading ? "Bağlanıyor…" : "Bağla"}
                </button>
                <button
                  onClick={() => setManual(false)}
                  className={cn(btn, "bg-sc text-onsc")}
                >
                  İptal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bildirim Mesajı */}
        {msg && (
          <div
            role="alert"
            className={cn(
              "flex items-center gap-2 rounded-2xl p-3 text-sm font-medium",
              msg.ok ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger"
            )}
          >
            {msg.ok && <Check size={16} />}
            {msg.text}
          </div>
        )}
      </Box>

      {/* Bu Cihaz (Aktif) */}
      <Box className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Mevcut Cihaz</p>
        <div className="flex items-center justify-between rounded-2xl bg-highest p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pc text-onpc">
              <Laptop size={22} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">Bu Tarayıcı</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-medium text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  Aktif
                </span>
              </div>
              <p className="text-xs text-muted">
                Kimlik Parmak İzi: {snap.fp ? `${snap.fp.slice(0, 16)}…` : "—"}
              </p>
            </div>
          </div>
        </div>
      </Box>

      {/* Bağlı Cihazlar Listesi */}
      <Box className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Bağlı Diğer Cihazlar ({devices.length})
        </p>

        {devices.length === 0 ? (
          <div className="rounded-2xl bg-highest/50 p-6 text-center">
            <Smartphone size={32} className="mx-auto text-muted/50" />
            <p className="mt-2 text-sm font-medium text-ink">Henüz başka bir cihaz eklenmedi</p>
            <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
              Yeni bir telefonda, tablette veya bilgisayarda Q7 açın; kurulumda &ldquo;Zaten hesabım var&rdquo;ı seçip beliren QR kodu buradan tarayın.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((dev) => (
              <div
                key={dev.id}
                className="flex items-center justify-between rounded-2xl bg-highest p-4 transition-colors hover:bg-highest/80"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-container text-ink">
                    <Smartphone size={20} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{dev.name}</p>
                    <p className="text-xs text-muted">
                      Eklendi: {new Date(dev.addedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => void removeDevice(dev.id)}
                  title="Cihazı Kaldır"
                  className="rounded-full p-2 text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Box>
    </Page>
  );
}
