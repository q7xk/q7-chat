import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { detectLang, LANGS } from "../lib/i18n";

const dir = new URL("../langs/", import.meta.url);
const load = (c: string) => JSON.parse(readFileSync(new URL(`${c}.json`, dir), "utf8")) as Record<string, string>;
const en = load("en");
const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

describe("translations", () => {
  it("has a file for each of the 17 languages and nothing else", () => {
    expect(LANGS).toHaveLength(17);
    expect(readdirSync(dir).map((f) => f.replace(".json", "")).sort()).toEqual(LANGS.map((l) => l.code).sort());
  });
  for (const { code } of LANGS) {
    it(`${code} translates every key with the same placeholders`, () => {
      const d = load(code);
      expect(Object.keys(d)).toEqual(Object.keys(en));
      for (const k of Object.keys(en)) { expect(d[k]!.trim(), `${code}:${k}`).not.toBe(""); expect(ph(d[k]!), `${code}:${k}`).toBe(ph(en[k]!)); }
    });
  }
});

describe("language detection", () => {
  it("picks the first supported browser language, else English", () => {
    expect(detectLang(["tr-TR", "en"])).toBe("tr");
    expect(detectLang(["pt-BR"])).toBe("pt");
    expect(detectLang(["zh-Hans-CN"])).toBe("zh");
    expect(detectLang(["in"])).toBe("id");
    expect(detectLang(["sv-SE", "uk-UA"])).toBe("uk");
    expect(detectLang(["sv-SE", "fi"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});
