import { HardDrive, Radio, Users } from "lucide-react";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";

/** Material 3 Expressive shape library, built once and used as CSS clip-paths. */
function lobed(n: number, amp: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 120; i++) {
    const t = (i / 120) * Math.PI * 2;
    const r = 0.5 * (1 - (amp * (1 - Math.cos(n * t))) / 2);
    pts.push(`${i ? "L" : "M"}${(0.5 + r * Math.cos(t)).toFixed(4)},${(0.5 + r * Math.sin(t)).toFixed(4)}`);
  }
  return pts.join("") + "Z";
}
export type M3Shape = "cookie9" | "cookie12" | "clover4" | "clover8" | "sunny";
const SHAPE_PATH: Record<M3Shape, string> = {
  cookie9: lobed(9, 0.1),   // scalloped cookie — FABs and chips
  cookie12: lobed(12, 0.07), // finer, softer cookie
  clover4: lobed(4, 0.2),   // four-leaf clover — avatars
  clover8: lobed(8, 0.16),  // denser clover — FAB accents
  sunny: lobed(6, 0.26),    // big-petaled flower — hero avatars
};
export function ShapeDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        {(Object.keys(SHAPE_PATH) as M3Shape[]).map((s) => (
          <clipPath key={s} id={`shape-${s}`} clipPathUnits="objectBoundingBox"><path d={SHAPE_PATH[s]} /></clipPath>
        ))}
      </defs>
    </svg>
  );
}
/** Style object applying an M3 Expressive shape to any element. */
export const clipShape = (s: M3Shape): { clipPath: string } => ({ clipPath: `url(#shape-${s})` });

export function ModeBadge({ mode, long }: { mode: Mode; long?: boolean }) {
  const { t } = useI18n(); const local = mode === "local"; const group = mode === "group";
  const Icon = local ? HardDrive : group ? Users : Radio;
  const text = local ? (long ? t("mode.localLong") : t("mode.local")) : group ? t("mode.group") : t("mode.p2p");
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", local ? "bg-tc text-ontc" : "bg-pc text-onpc")}>
      <Icon size={12} aria-hidden /> {text}
    </span>
  );
}

export function Avatar({ title, mode, photo, hue, size = 48, shape }: { title: string; mode: Mode; photo?: string; hue?: number; size?: number; shape?: M3Shape }) {
  const initials = title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  const style = { ...clipShape(shape ?? (mode === "local" ? "cookie9" : mode === "group" ? "sunny" : "clover4")), width: size, height: size, ...(mode === "group" && hue !== undefined && !photo ? { background: `hsl(${hue} 62% 46%)`, color: "#fff" } : {}) };
  if (photo) return /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo} alt="" style={style} className="shrink-0 object-cover" />;
  return <span aria-hidden style={style} className={cn("flex shrink-0 items-center justify-center font-semibold", mode === "local" ? "bg-tc text-ontc" : mode === "group" ? "" : "bg-pc text-onpc")}>{initials}</span>;
}
