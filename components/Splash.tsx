"use client";
import { useEffect } from "react";

/** First-run splash: a Material-style indeterminate ring while the setup gets ready. */
export function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1700);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg">
      <svg viewBox="0 0 48 48" className="m3-loader-rot h-12 w-12 text-accent" role="progressbar">
        <circle cx="24" cy="24" r="20" pathLength={100} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className="m3-loader-arc" />
      </svg>
      <p className="text-sm font-medium text-muted">Q7 Chat</p>
    </div>
  );
}
