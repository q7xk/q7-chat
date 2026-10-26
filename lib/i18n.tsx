"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "../langs/en.json";

export type K = keyof typeof en;
export type Dict = Record<string, string>;
export const LANGS = [
  { code: "en", name: "English" }, { code: "tr", name: "Türkçe" }, { code: "de", name: "Deutsch" }, { code: "zh", name: "中文（普通话）" },
  { code: "ja", name: "日本語" }, { code: "ko", name: "한국어" }, { code: "fr", name: "Français" }, { code: "es", name: "Español" },
  { code: "pt", name: "Português" }, { code: "ru", name: "Русский" }, { code: "pl", name: "Polski" }, { code: "uk", name: "Українська" },
  { code: "hi", name: "हिन्दी" }, { code: "id", name: "Bahasa Indonesia" }, { code: "it", name: "Italiano" }, { code: "nl", name: "Nederlands" }, { code: "ar", name: "العربية" },
] as const;
const CODES: string[] = LANGS.map((l) => l.code);

const loaders: Record<string, () => Promise<{ default: Dict }>> = {
  tr: () => import("../langs/tr.json"), de: () => import("../langs/de.json"), zh: () => import("../langs/zh.json"), ja: () => import("../langs/ja.json"),
  ko: () => import("../langs/ko.json"), fr: () => import("../langs/fr.json"), es: () => import("../langs/es.json"), pt: () => import("../langs/pt.json"),
  ru: () => import("../langs/ru.json"), pl: () => import("../langs/pl.json"), uk: () => import("../langs/uk.json"), hi: () => import("../langs/hi.json"),
  id: () => import("../langs/id.json"), it: () => import("../langs/it.json"), nl: () => import("../langs/nl.json"), ar: () => import("../langs/ar.json"),
};

/** First browser language we support, else English. */
export function detectLang(list: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]): string {
  for (const l of list) {
    let base = l.toLowerCase().split("-")[0]!; if (base === "in") base = "id";
    if (CODES.includes(base)) return base;
  }
  return "en";
}

interface I18n {
  t: (key: K, vars?: Record<string, string | number>) => string;
  tk: (key: string, vars?: Record<string, string | number>) => string; // for keys held in data (error codes)
  lang: string; pref: string; setPref: (p: string) => void; dir: "ltr" | "rtl";
  dur: (ms: number) => string; size: (bytes: number) => string; clock: (ts: number, now: number) => string; date: (ts: number) => string;
}
const Ctx = createContext<I18n | null>(null);
export const useI18n = () => { const c = useContext(Ctx); if (!c) throw new Error("I18nProvider missing"); return c; };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState("auto");
  const [lang, setLang] = useState("en");
  const [dict, setDict] = useState<Dict>({});

  useEffect(() => { try { const p = localStorage.getItem("q7.lang"); if (p) setPrefState(p); } catch {} }, []);
  useEffect(() => {
    const l = pref === "auto" ? detectLang() : CODES.includes(pref) ? pref : "en";
    setLang(l);
    if (l === "en") setDict({}); else loaders[l]!().then((m) => setDict(m.default)).catch(() => setDict({}));
  }, [pref]);
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"; }, [lang]);

  const setPref = useCallback((p: string) => { setPrefState(p); try { localStorage.setItem("q7.lang", p); } catch {} }, []);
  const value = useMemo<I18n>(() => {
    const tk = (key: string, vars?: Record<string, string | number>) => {
      let s = dict[key] ?? (en as Dict)[key] ?? (en as Dict)["err.generic"] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    };
    const unit = (n: number, u: string) => new Intl.NumberFormat(lang, { style: "unit", unit: u, unitDisplay: "long" }).format(n);
    return {
      t: tk as I18n["t"], tk, lang, pref, setPref, dir: lang === "ar" ? "rtl" : "ltr",
      dur: (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)); return m < 60 ? unit(m, "minute") : unit(Math.floor(ms / 3600000), "hour"); },
      size: (b) => (b < 1048576 ? unit(Math.max(1, Math.round(b / 1024)), "kilobyte") : unit(Math.round((b / 1048576) * 10) / 10, "megabyte")),
      clock: (ts, now) => { const d = new Date(ts), n = new Date(now); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString(lang, { weekday: "short" }); },
      date: (ts) => new Date(ts).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" }),
    };
  }, [lang, dict, pref, setPref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
