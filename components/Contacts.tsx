"use client";
import { useEffect, useState } from "react";
import { Camera, MessageSquare, QrCode, ShieldCheck, Trash2, UserPlus, Wifi } from "lucide-react";
import { useP2P } from "@/lib/p2p/context";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { formatCode, fromB64, safetyNumber } from "@/lib/p2p/crypto";
import type { Contact } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Avatar } from "./Badges";
import { Scanner } from "./Scanner";
import { btn, field, PairingStatus, QR } from "./Connect";
import { Box, Page } from "./ui";

function Row({ c, state, myPub, onOpen }: { c: Contact; state?: string; myPub: string; onOpen: () => void }) {
  const { t } = useI18n(); const { mgr } = useP2P();
  const [open, setOpen] = useState(false), [safety, setSafety] = useState(""), [name, setName] = useState(c.name), [del, setDel] = useState(false);
  useEffect(() => { if (open && myPub) void safetyNumber(fromB64(myPub), fromB64(c.pub)).then(setSafety); }, [open, myPub, c.pub]);
  const on = state === "online";
  return (
    <li className="rounded-3xl bg-container p-4">
      <div className="flex items-center gap-3">
        <Avatar title={c.name} mode="p2p" photo={c.photo} />
        <div className="min-w-0 flex-1"><p className="truncate font-medium">{c.name}</p><p className="text-xs tabular-nums text-muted" dir="ltr">{formatCode(c.code)}</p>
          <span className={cn("inline-flex items-center gap-1.5 text-xs", on ? "text-accent" : "text-muted")}><span className={cn("h-2 w-2 rounded-full", on ? "bg-accent" : state === "connecting" ? "animate-pulse bg-local" : "bg-line")} />{on ? t("thread.online") : state === "connecting" ? t("thread.connecting") : t("thread.offline")}</span></div>
        {c.verified && <ShieldCheck size={18} className="text-accent" aria-label={t("thread.verified")} />}
        <button onClick={onOpen} aria-label={c.name} className="rounded-full bg-pc p-3 text-onpc"><MessageSquare size={18} /></button>
      </div>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-3 text-xs text-muted underline underline-offset-2">{t("contacts.details")}</button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-relaxed text-muted">{t("contacts.safety")}</p>
          <p className="rounded-2xl bg-highest px-4 py-3 text-center text-lg font-medium tabular-nums tracking-wide" dir="ltr">{safety || "…"}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => mgr.setVerified(c.id, !c.verified)} aria-pressed={c.verified} className={cn(btn, c.verified ? "bg-pc text-onpc" : "bg-sc text-onsc")}><ShieldCheck size={15} />{t("contacts.verify")}</button>
            {!on && <button onClick={() => mgr.connectNow(c.id)} className={cn(btn, "bg-sc text-onsc")}><Wifi size={15} />{t("contacts.connectNow")}</button>}
          </div>
          <div className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label={t("contacts.rename")} className={field} /><button onClick={() => mgr.renameContact(c.id, name)} className={cn(btn, "bg-sc text-onsc")}>{t("contacts.rename")}</button></div>
          {!del ? <button onClick={() => setDel(true)} className="inline-flex items-center gap-2 text-sm text-danger"><Trash2 size={14} />{t("c.remove")}</button>
            : <div className="flex flex-wrap items-center gap-2 text-sm"><span>{t("contacts.removeAsk")}</span><button onClick={() => mgr.removeContact(c.id)} className="rounded-full bg-danger px-4 py-1.5 font-medium text-bg">{t("c.remove")}</button><button onClick={() => setDel(false)} className="text-muted">{t("c.cancel")}</button></div>}
        </div>
      )}
    </li>
  );
}

export function ContactsPanel({ onOpenChat, onAdd }: { onOpenChat: (convId: string) => void; onAdd: () => void }) {
  const { t } = useI18n(); const { mgr, snap } = useP2P(); const { createP2P } = useStore();
  const [showQr, setShowQr] = useState(false), [scan, setScan] = useState(false), [bad, setBad] = useState(false);
  return (
    <Page title={t("contacts.title")}>
      <div className="flex flex-wrap gap-2">
        <button onClick={onAdd} className={cn(btn, "bg-pc text-onpc")}><UserPlus size={15} />{t("chats.addContact")}</button>
        <button onClick={() => setShowQr(!showQr)} aria-pressed={showQr} className={cn(btn, "bg-sc text-onsc")}><QrCode size={15} />{t("contacts.shareQr")}</button>
        <button onClick={() => { setScan(!scan); setBad(false); }} className={cn(btn, "bg-sc text-onsc")}><Camera size={15} />{t("contacts.scanQr")}</button>
      </div>
      {showQr && snap.ready && !snap.error && <Box className="space-y-3"><QR text={mgr.myContactQr()} /><p className="text-xs leading-relaxed text-muted">{t("contacts.qrNote")}</p></Box>}
      {scan && <Scanner prefixes={["Q7C:"]} onClose={() => setScan(false)} onResult={(x) => { setScan(false); void mgr.connectByContactQr(x).then((ok) => setBad(!ok)); }} />}
      {bad && <p role="alert" className="text-sm text-danger">{t("contacts.qrBad")}</p>}
      <PairingStatus onOpenChat={onOpenChat} />
      {snap.contacts.length === 0 ? <Box className="py-8 text-center text-sm text-muted">{t("contacts.empty")}</Box> : (
        <ul className="space-y-3">{snap.contacts.map((c) => <Row key={c.id} c={c} state={snap.status[c.id]} myPub={snap.pub} onOpen={() => onOpenChat(createP2P(c.id, c.name))} />)}</ul>)}
    </Page>
  );
}
