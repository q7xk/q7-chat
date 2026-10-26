"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useP2P } from "@/lib/p2p/context";
import { cn } from "@/lib/cn";
import { Avatar } from "./Badges";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Full-screen call overlay: incoming ring, outgoing ring, active call with local PiP. */
export function CallOverlay() {
  const { t } = useI18n(); const { snap, mgr } = useP2P();
  const call = snap.call;
  const [muted, setMuted] = useState(false); const [camOff, setCamOff] = useState(false); const [elapsed, setElapsed] = useState(0);
  const remote = useRef<HTMLVideoElement>(null); const local = useRef<HTMLVideoElement>(null);
  const contact = call ? snap.contacts.find((c) => c.id === call.cid) : undefined;

  useEffect(() => { setMuted(false); setCamOff(false); setElapsed(0); }, [call?.id]);
  useEffect(() => {
    if (!call?.startedAt) { setElapsed(0); return; }
    const h = setInterval(() => setElapsed(Math.floor((Date.now() - (call.startedAt as number)) / 1000)), 500);
    return () => clearInterval(h);
  }, [call?.startedAt, call?.state]);
  useEffect(() => {
    if (remote.current) remote.current.srcObject = call?.remote ?? null;
    if (local.current) local.current.srcObject = call?.local ?? null;
  });

  if (!call) return null;
  const ringingIn = call.state === "ringing" && call.dir === "in";
  const ringingOut = call.state === "ringing" && call.dir === "out";
  const active = call.state === "active" || call.state === "connecting";
  const stateText = ringingIn ? t("call.incoming") : ringingOut ? t("call.outgoing") : call.state === "connecting" ? t("call.connecting") : mmss(elapsed);
  const ctrl = "flex h-14 w-14 items-center justify-center rounded-full transition-[filter] hover:brightness-110";

  const toggleMute = () => {
    const next = !muted; setMuted(next);
    call.local?.getAudioTracks().forEach((tr) => (tr.enabled = !next));
  };
  const toggleCam = () => {
    const next = !camOff; setCamOff(next);
    call.local?.getVideoTracks().forEach((tr) => (tr.enabled = !next));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-black/85 via-black/80 to-black/90 text-white backdrop-blur-md" role="dialog" aria-label={t("call.audio")}>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pt-16">
        {call.video ? (
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-black/60">
            <video ref={remote} autoPlay playsInline className={cn("h-[50dvh] w-full bg-black object-cover", !call.remote && "opacity-0")} />
            {!call.remote && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">{stateText}</div>}
            {call.local && <video ref={local} autoPlay playsInline muted className="absolute end-3 top-3 h-28 w-20 rounded-2xl border border-white/20 bg-black object-cover md:h-36 md:w-24" style={{ transform: "scaleX(-1)" }} />}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Avatar title={contact?.name ?? "?"} mode="p2p" photo={contact?.photo} size={120} />
            {(muted || camOff) && active && <p className="text-xs text-white/60">{muted ? t("call.mute") : ""}{muted && camOff ? " · " : ""}{camOff && call.video ? t("call.cameraOff") : ""}</p>}
          </div>
        )}
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-2xl font-semibold tracking-tight">{contact?.name ?? t("chats.you")}</p>
          <p className="text-sm tabular-nums text-white/70">{stateText}</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 p-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {ringingIn ? (
          <>
            <button onClick={() => mgr.declineCall()} aria-label={t("call.decline")} title={t("call.decline")} className={cn(ctrl, "bg-danger text-white")}><PhoneOff size={24} /></button>
            <button onClick={() => void mgr.acceptCall()} aria-label={t("call.accept")} title={t("call.accept")} className={cn(ctrl, "bg-green-600 text-white")}><Phone size={24} /></button>
          </>
        ) : (
          <>
            {active && (
              <button onClick={toggleMute} aria-pressed={muted} aria-label={muted ? t("call.unmute") : t("call.mute")} title={muted ? t("call.unmute") : t("call.mute")} className={cn(ctrl, muted ? "bg-white text-black" : "bg-white/15 text-white")}>{muted ? <MicOff size={22} /> : <Mic size={22} />}</button>
            )}
            {active && call.video && (
              <button onClick={toggleCam} aria-pressed={camOff} aria-label={camOff ? t("call.cameraOn") : t("call.cameraOff")} title={camOff ? t("call.cameraOn") : t("call.cameraOff")} className={cn(ctrl, camOff ? "bg-white text-black" : "bg-white/15 text-white")}>{camOff ? <VideoOff size={22} /> : <Video size={22} />}</button>
            )}
            <button onClick={() => mgr.endCall()} aria-label={t("call.hangup")} title={t("call.hangup")} className={cn(ctrl, "bg-danger text-white")}><PhoneOff size={24} /></button>
          </>
        )}
      </div>
    </div>
  );
}
