/** Accent colour system. The stylesheet default is blue; any other choice overrides a fixed set of
    M3-ish roles as inline CSS variables on :root, recomputed whenever the accent or theme changes. */

export interface AccentPreset { id: string; hue: number }
export const ACCENTS: AccentPreset[] = [
  { id: "blue", hue: 222 }, { id: "indigo", hue: 243 }, { id: "violet", hue: 268 }, { id: "purple", hue: 285 },
  { id: "fuchsia", hue: 305 }, { id: "pink", hue: 330 }, { id: "rose", hue: 348 }, { id: "red", hue: 4 },
  { id: "orange", hue: 26 }, { id: "amber", hue: 45 }, { id: "green", hue: 142 }, { id: "teal", hue: 172 }, { id: "cyan", hue: 195 },
];

const hueToRgb = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)).join(" ");
};

const roles = (h: number, dark: boolean): Record<string, string> => dark
  ? { accent: hueToRgb(h, 1, 0.85), pc: hueToRgb(h, 0.51, 0.35), onpc: hueToRgb(h, 1, 0.92), sc: hueToRgb(h, 0.19, 0.3), onsc: hueToRgb(h, 0.72, 0.92) }
  : { accent: hueToRgb(h, 0.43, 0.46), pc: hueToRgb(h, 1, 0.92), onpc: hueToRgb(h, 1, 0.2), sc: hueToRgb(h, 0.72, 0.92), onsc: hueToRgb(h, 0.64, 0.12) };

const hexToHue = (hex: string): number | null => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (d === 0) return null;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
};

/** accent = "" (stylesheet default) | preset id | "#rrggbb" */
export function applyAccent(accent: string, theme: "dark" | "light") {
  const el = document.documentElement;
  const keys = ["accent", "pc", "onpc", "sc", "onsc"];
  const clear = () => keys.forEach((k) => el.style.removeProperty(`--${k}`));
  try {
    if (!accent || accent === "blue") return clear();
    const preset = ACCENTS.find((a) => a.id === accent);
    const hue = preset ? preset.hue : hexToHue(accent);
    if (hue === null) return clear();
    for (const [k, v] of Object.entries(roles(hue, theme === "dark"))) el.style.setProperty(`--${k}`, v);
  } catch { clear(); }
}
