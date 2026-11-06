"use client";
import { useEffect, useState } from "react";

export function InstallPrompt() {
  const [evt, setEvt] = useState<any>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setEvt(e); setShow(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  if (!show || !evt) return null;
  return (
    <div className="fixed bottom-4 inset-x-4 z-50 flex items-center gap-3 rounded-2xl bg-panel p-3 shadow-lg border border-border">
      <span className="text-sm flex-1">Install Q7 Chat</span>
      <button onClick={() => { evt.prompt(); setShow(false); }} className="rounded-full bg-accent text-bg px-4 py-2 text-sm">Install</button>
      <button onClick={() => setShow(false)} className="text-sm opacity-70">Dismiss</button>
    </div>
  );
}
