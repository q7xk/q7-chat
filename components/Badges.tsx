import { HardDrive, Radio } from "lucide-react";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";

/** Material You style scalloped shapes, built once and used as CSS clip-paths. */
function lobed(n: number, amp: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 120; i++) {
    const t = (i / 120) * Math.PI * 2;
    const r = 0.5 * (1 - (amp * (1 - Math.cos(n * t))) / 2);
    pts.push(`${i ? "L" : "M"}${(0.5 + r * Math.cos(t)).toFixed(4)},${(0.5 + r * Math.sin(t)).toFixed(4)}`);
  }
  return pts.join("") + "Z";
}
export function ShapeDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <clipPath id="shape-cookie" clipPathUnits="objectBoundingBox"><path d={lobed(9, 0.1)} /></clipPath>
        <clipPath id="shape-clover" clipPathUnits="objectBoundingBox"><path d={lobed(4, 0.2)} /></clipPath>
      </defs>
    </svg>
  );
}

export function ModeBadge({ mode, long }: { mode: Mode; long?: boolean }) {
  const { t } = useI18n(); const local = mode === "local"; const Icon = local ? HardDrive : Radio;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", local ? "bg-tc text-ontc" : "bg-pc text-onpc")}>
      <Icon size={12} aria-hidden /> {local ? (long ? t("mode.localLong") : t("mode.local")) : t("mode.p2p")}
    </span>
  );
}

export function Avatar({ title, mode, photo, size = 48 }: { title: string; mode: Mode; photo?: string; size?: number }) {
  const initials = title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  const style = { clipPath: `url(#shape-${mode === "local" ? "cookie" : "clover"})`, width: size, height: size };
  if (photo) return /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo} alt="" style={style} className="shrink-0 object-cover" />;
  return <span aria-hidden style={style} className={cn("flex shrink-0 items-center justify-center font-semibold", mode === "local" ? "bg-tc text-ontc" : "bg-pc text-onpc")}>{initials}</span>;
}
