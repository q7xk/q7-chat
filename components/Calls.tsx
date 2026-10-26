"use client";
import { useEffect, useState } from "react";
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Trash2, Video } from "lucide-react";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { clearCallLog, getCallLog, type CallEntry } from "@/lib/calllog";
import { cn } from "@/lib/cn";
import { Box, Page } from "./ui";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Call history built from locally logged attempts; rows offer a one-tap callback. */
export function CallsPanel({ onOpenChat }: { onOpenChat: (id: string) => void }) {
  const { t, date } = useI18n(); const { snap, mgr } = useP2P(); const { conversations } = useStore();
  const [log, setLog] = useState<CallEntry[]>([]);
  useEffect(() => {
    setLog(getCallLog());
    const h = setInterval(() => setLog(getCallLog()), 2500); // picks up entries while a call runs
    return () => clearInterval(h);
  }, []);
  const back = "rounded-full p-2 text-muted transition-colors hover:bg-raised hover:text-ink";

  return (
    <Page title={t("calls.title")}>
      <Box className="space-y-3">
        {log.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t("call.logEmpty")}</p>
        ) : (
          <>
            <ul className="space-y-1">
              {log.map((e) => {
                const conv = conversations.find((c) => c.contactId === e.cid);
                const online = snap.status[e.cid] === "online";
                const Icon = e.missed ? PhoneMissed : e.dir === "in" ? PhoneIncoming : PhoneOutgoing;
                return (
                  <li key={e.id + e.at} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-container">
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", e.missed ? "bg-danger/15 text-danger" : "bg-sc text-onsc")}><Icon size={16} /></span>
                    <button className="min-w-0 flex-1 text-start" onClick={() => conv && onOpenChat(conv.id)}>
                      <span className="block truncate text-sm font-medium">{e.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {e.missed ? t("call.missed") : e.video ? t("call.video") : t("call.audio")} · {date(e.at)}{!e.missed && e.dur > 0 ? ` · ${mmss(e.dur)}` : ""}
                      </span>
                    </button>
                    <button disabled={!online} onClick={() => void mgr.placeCall(e.cid, false)} aria-label={t("call.audio")} className={cn(back, !online && "opacity-40")}><Phone size={16} /></button>
                    <button disabled={!online} onClick={() => void mgr.placeCall(e.cid, true)} aria-label={t("call.video")} className={cn(back, !online && "opacity-40")}><Video size={16} /></button>
                  </li>
                );
              })}
            </ul>
            <button onClick={() => { clearCallLog(); setLog([]); }} className="mx-auto flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-muted transition-colors hover:bg-container hover:text-ink">
              <Trash2 size={14} />{t("call.logClear")}
            </button>
          </>
        )}
      </Box>
    </Page>
  );
}
