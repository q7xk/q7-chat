"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Copy, FileUp, Save, UserPlus, Wifi, WifiOff } from "lucide-react";
import { useP2P } from "@/lib/p2p/context";
import { useI18n } from "@/lib/i18n";
import { formatCode, parseCode } from "@/lib/p2p/crypto";
import { cn } from "@/lib/cn";
import { Avatar } from "./Badges";
import { Scanner } from "./Scanner";
import { Box, Page } from "./ui";

export const btn = "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-[filter] hover:brightness-110";
export const field = "w-full rounded-2xl bg-highest px-4 py-3 text-sm";

export function CopyBtn({ text, label }: { text: string; label: string }) {
  const { t } = useI18n(); const [ok, setOk] = useState(false);
  return <button onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch {} }} className={cn(btn, "bg-sc text-onsc")}>{ok ? <Check size={15} /> : <Copy size={15} />}{ok ? t("c.copied") : label}</button>;
}
export function QR({ text }: { text: string }) {
  const { t, tk } = useI18n(); const [url, setUrl] = useState<string | null>(null); const [fail, setFail] = useState(false);
  useEffect(() => {
    let live = true; setUrl(null); setFail(false);
    import("qrcode").then((q) => q.toDataURL(text, { errorCorrectionLevel: "L", margin: 2, width: 360 })).then((u) => live && setUrl(u)).catch(() => live && setFail(true));
    return () => { live = false; };
  }, [text]);
  void t;
  if (fail) return <p className="text-sm text-muted">{tk("err.generic")}</p>;
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="QR" className="mx-auto h-72 w-72 rounded-2xl bg-white p-2" /> : <div className="mx-auto h-72 w-72 animate-pulse rounded-2xl bg-highest" />;
}
export function PairingStatus({ onOpenChat }: { onOpenChat: (convId: string) => void }) {
  const { t, tk } = useI18n(); const { mgr, snap } = useP2P(); const p = snap.pairing;
  if (p.kind === "code") return <p role="status" className={cn("text-sm", p.phase === "failed" && "text-danger")}>{p.phase === "waiting" ? t("connect.waiting") : tk(p.detail ?? "err.generic")}</p>;
  if (p.kind === "connecting") return <p role="status" className="text-sm">{t("connect.connecting")}</p>;
  if (p.kind === "error") return <p role="alert" className="text-sm text-danger">{tk(p.message)}</p>;
  if (p.kind === "done") return <Box className="flex items-center gap-3 bg-pc text-onpc"><Check size={20} /><p className="flex-1 text-sm">{t("connect.done", { name: p.name })}</p><button onClick={() => { const id = p.convId; mgr.clearPairing(); onOpenChat(id); }} className={cn(btn, "bg-accent text-bg")}>{t("connect.open")}</button></Box>;
  return null;
}

export function ConnectPanel({ onOpenChat }: { onOpenChat: (convId: string) => void }) {
  const { t, tk } = useI18n(); const { mgr, snap } = useP2P();
  const [codeIn, setCodeIn] = useState(""), [paste, setPaste] = useState(""), [scan, setScan] = useState(false);
  const file = useRef<HTMLInputElement>(null); const p = snap.pairing;
  const submit = (x: string) => { setScan(false); setPaste(""); void mgr.acceptManual(x); };
  const saveInvite = () => {
    if (p.kind !== "manual-offer" && p.kind !== "manual-answer") return;
    const url = URL.createObjectURL(new Blob([p.text], { type: "text/plain" })); const a = document.createElement("a");
    a.href = url; a.download = `q7-${p.kind === "manual-offer" ? "invite" : "reply"}.q7invite`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!snap.ready) return <Page title={t("connect.title")}><div className="h-40 animate-pulse rounded-3xl bg-container" /></Page>;
  if (snap.error) return <Page title={t("connect.title")}><Box className="bg-danger/10"><p role="alert" className="text-sm text-danger">{tk(snap.error)}</p></Box></Page>;
  return (
    <Page title={t("connect.title")}>
      <Box className="space-y-4">
        <div className="flex items-center gap-3"><Avatar title={snap.settings.name} mode="p2p" photo={snap.settings.photo} /><div><p className="text-sm font-medium">{snap.settings.name}</p><p className="text-xs text-muted">{t("connect.yourCode")}</p></div></div>
        <p className="text-center text-[34px] font-semibold tabular-nums tracking-wider" dir="ltr">{formatCode(snap.code)}</p>
        <p className="text-xs leading-relaxed text-muted">{t("connect.codeNote")}</p>
        <div className="flex flex-wrap items-center gap-2"><CopyBtn text={formatCode(snap.code)} label={t("connect.copyCode")} />
          <span className={cn("inline-flex items-center gap-1.5 text-xs", snap.relay.connected ? "text-muted" : "text-danger")}>{snap.relay.enabled && snap.relay.connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {snap.relay.enabled ? t("connect.relay", { n: snap.relay.connected, total: snap.relay.total }) : t("connect.relayOff")}</span></div>
      </Box>
      {snap.requests.length > 0 && (
        <Box className="space-y-3 bg-tc text-ontc"><p className="text-sm font-medium">{t("connect.requests")}</p>
          {snap.requests.map((r) => (
            <div key={r.rid} className="space-y-2 rounded-2xl bg-bg/40 p-3">
              <p className="text-sm">{t("connect.request", { name: r.name, code: formatCode(r.code) })}</p><p className="text-xs tabular-nums opacity-80" dir="ltr">{r.safety}</p>
              <div className="flex gap-2"><button onClick={() => mgr.acceptRequest(r.rid)} className={cn(btn, "bg-accent text-bg")}>{t("c.accept")}</button><button onClick={() => mgr.declineRequest(r.rid)} className={cn(btn, "bg-bg/40")}>{t("c.decline")}</button></div>
            </div>))}
        </Box>
      )}
      <Box className="space-y-3"><p className="text-sm font-medium">{t("connect.byCode")}</p>
        <div className="flex gap-2">
          <input dir="ltr" value={codeIn} onChange={(e) => setCodeIn(formatCode(e.target.value.replace(/\D/g, "").slice(0, 12)))} inputMode="numeric" placeholder="0000 0000 0000" aria-label={t("connect.codeLabel")} className={cn(field, "tabular-nums")} />
          <button onClick={() => mgr.connectByCode(codeIn)} disabled={!parseCode(codeIn)} className={cn(btn, "bg-accent text-bg disabled:opacity-40")}><UserPlus size={15} />{t("connect.go")}</button>
        </div>
      </Box>
      <Box className="space-y-4"><p className="text-sm font-medium">{t("connect.qrTitle")}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setScan(false); void mgr.createManualOffer(); }} className={cn(btn, "bg-pc text-onpc")}>{t("connect.create")}</button>
          <button onClick={() => setScan(true)} className={cn(btn, "bg-sc text-onsc")}><Camera size={15} />{t("connect.scan")}</button>
          <button onClick={() => file.current?.click()} className={cn(btn, "bg-sc text-onsc")}><FileUp size={15} />{t("connect.importFile")}</button>
          <input ref={file} type="file" accept=".q7invite,text/plain" hidden aria-label={t("connect.importFile")} onChange={async (e) => { const f = e.target.files?.[0]; if (f && f.size < 100_000) submit(await f.text()); e.target.value = ""; }} />
        </div>
        {scan && <Scanner prefixes={["Q7:"]} onResult={submit} onClose={() => setScan(false)} />}
        {(p.kind === "manual-offer" || p.kind === "manual-answer") && (
          <div className="space-y-3"><p className="text-sm">{t("connect.hint")}</p><QR text={p.text} />
            <div className="flex flex-wrap gap-2"><CopyBtn text={p.text} label={t("connect.copyText")} /><button onClick={saveInvite} className={cn(btn, "bg-sc text-onsc")}><Save size={15} />{t("connect.saveFile")}</button></div></div>
        )}
        <div className="space-y-2"><textarea dir="ltr" value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder={t("connect.pastePh")} aria-label={t("connect.pastePh")} className={cn(field, "resize-none font-mono text-xs")} />
          <button onClick={() => submit(paste)} disabled={!paste.trim()} className={cn(btn, "bg-sc text-onsc disabled:opacity-40")}>{t("connect.paste")}</button></div>
      </Box>
      <PairingStatus onOpenChat={onOpenChat} />
    </Page>
  );
}
