const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif)$/i; // SVG is deliberately excluded

function isPrivateHost(h: string): boolean {
  if (h.startsWith("[")) return true; // no IPv6 literals
  if (!h.includes(".")) return true; // localhost, single-label hosts
  if (/\.(local|internal|localhost|lan)$/.test(h)) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Returns a URL only for plain HTTPS links to public-looking hosts. */
export function parseHttpsUrl(input: string): URL | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== "https:" || u.username || u.password) return null;
    if (isPrivateHost(u.hostname.toLowerCase())) return null;
    return u;
  } catch { return null; }
}

export const isDirectImageUrl = (u: URL) => IMG_EXT.test(u.pathname);
export const domainOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

const clean = (s: string) => s.replace(/[.,;:!?)\]]+$/, "");

export function extractUrls(text: string, max = 3): string[] {
  const out: string[] = [];
  for (const raw of text.match(URL_RE) ?? []) {
    const u = parseHttpsUrl(clean(raw));
    if (u && !out.includes(u.href)) out.push(u.href);
    if (out.length >= max) break;
  }
  return out;
}

export type Segment = { type: "text" | "url"; value: string };
export function splitBody(text: string): Segment[] {
  const segs: Segment[] = []; let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const raw = clean(m[0]); const idx = m.index ?? 0;
    if (idx > last) segs.push({ type: "text", value: text.slice(last, idx) });
    segs.push({ type: parseHttpsUrl(raw) ? "url" : "text", value: raw });
    last = idx + raw.length;
  }
  if (last < text.length) segs.push({ type: "text", value: text.slice(last) });
  return segs;
}
