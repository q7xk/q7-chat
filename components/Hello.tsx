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
      <svg viewBox="0 0 390 240" className="hello-svg w-80 max-w-[75vw]" role="img" aria-label="hello">
        <defs>
          <linearGradient id="hello-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3b82f6" /><stop offset=".24" stopColor="#06b6d4" />
            <stop offset=".48" stopColor="#22c55e" /><stop offset=".7" stopColor="#eab308" />
            <stop offset=".87" stopColor="#ec4899" /><stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <path pathLength={1} className="hello-stroke" fill="none" stroke="url(#hello-g)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"
          d="M45 188
             C52 140 68 78 84 40
             C88 31 95 31 94 42
             C90 90 92 145 96 178
             C97 189 102 192 106 188
             C110 160 118 138 128 136
             C139 134 144 146 142 160
             C140 174 138 184 144 188
             C152 172 162 152 168 142
             C171 132 162 126 155 132
             C148 141 148 158 154 174
             C158 184 168 189 180 188
             C186 187 191 186 196 185
             C202 180 212 150 220 112
             C224 88 228 52 234 40
             C240 34 246 40 244 54
             C240 92 232 148 228 172
             C226 184 228 192 236 189
             C248 184 258 150 266 112
             C270 88 274 52 280 40
             C286 34 292 40 290 54
             C286 92 278 148 274 172
             C272 184 274 192 282 189
             C290 182 302 162 308 146
             C312 133 302 126 293 133
             C283 141 282 158 290 172
             C298 184 314 184 323 172
             C332 160 332 142 324 135
             C318 130 312 133 310 139
             C320 146 324 162 324 176
             C324 185 328 192 338 190" />
      </svg>
    </div>
  );
}
