"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The first-run greeting: a script "hello" drawn in one rainbow stroke, held, then
 * softly faded — the macOS setup nod. Reduced-motion users get a plain text greeting.
 */
export function Hello({ onDone }: { onDone: () => void }) {
  const [leave, setLeave] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLeave(true), 2500);                // draw ≈1.5 s, hold ≈1 s, then fade
    const t2 = setTimeout(onDone, 3050);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);
  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-bg", leave && "hello-leave")}>
      <svg viewBox="0 0 340 190" className="hello-svg w-80 max-w-[75vw]" role="img" aria-label="hello">
        <defs>
          <linearGradient id="hello-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3b82f6" /><stop offset=".24" stopColor="#06b6d4" />
            <stop offset=".48" stopColor="#22c55e" /><stop offset=".7" stopColor="#eab308" />
            <stop offset=".87" stopColor="#ec4899" /><stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <path pathLength={1} className="hello-stroke" fill="none" stroke="url(#hello-g)" strokeWidth="9.5" strokeLinecap="round" strokeLinejoin="round"
          d="M40 148 C44 112 52 66 66 40 C71 31 78 33 76 44 C71 72 68 104 78 126 C86 144 100 142 108 126 C114 114 118 104 127 104 C135 104 138 118 134 134 C131 144 130 148 133 151
             C144 161 162 157 168 141 C172 129 166 122 157 127 C146 133 143 152 152 163 C157 169 166 170 173 164
             C175 150 183 102 189 76 C192 64 200 62 202 73 C204 88 196 122 194 141 C193 151 196 157 203 157
             C211 157 216 112 224 82 C228 68 236 66 238 78 C240 94 232 126 230 143 C229 153 232 159 239 158
             C250 157 259 148 263 136 C266 126 262 117 253 122 C242 128 239 147 248 161 C255 172 270 173 280 163 C288 155 292 144 295 130" />
      </svg>
    </div>
  );
}
