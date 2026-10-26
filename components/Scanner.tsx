"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function Scanner({ prefixes, onResult, onClose }: { prefixes: string[]; onResult: (text: string) => void; onClose: () => void }) {
  const { t } = useI18n(); const video = useRef<HTMLVideoElement>(null);
  const cb = useRef(onResult); cb.current = onResult; const pre = useRef(prefixes); pre.current = prefixes;
  const [err, setErr] = useState("");
  useEffect(() => {
    let stop = false, raf = 0, stream: MediaStream | undefined;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setErr(t("scan.noCamera")); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = video.current!; v.srcObject = stream; await v.play();
        const { default: jsQR } = await import("jsqr");
        const c = document.createElement("canvas"), ctx = c.getContext("2d", { willReadFrequently: true })!;
        const tick = () => {
          if (stop) return;
          if (v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; ctx.drawImage(v, 0, 0); const r = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height); if (r && pre.current.some((p) => r.data.startsWith(p))) { cb.current(r.data); return; } }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setErr(t("scan.denied")); }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((x) => x.stop()); };
  }, [t]);
  return (
    <div className="space-y-3 rounded-3xl bg-highest p-3">
      {err ? <p role="alert" className="p-3 text-sm text-danger">{err}</p> : <video ref={video} playsInline muted className="aspect-square w-full rounded-2xl bg-black object-cover" />}
      <button onClick={onClose} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted hover:bg-container"><X size={14} />{t("c.close")}</button>
    </div>
  );
}
