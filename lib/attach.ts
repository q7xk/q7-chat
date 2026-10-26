import type { Attachment } from "./types";
import { cleanName, codeOfPub, fromB64 } from "./p2p/crypto";

export const MAX_FILE = 10 * 1024 * 1024;
export const CHUNK = 16 * 1024;
const IMG = /^image\/(png|jpeg|gif|webp|avif)$/;

export const safeName = (n: string) => n.replace(/[\\/:*?"<>|\u0000-\u001f\u202a-\u202e]/g, "_").replace(/^\.+/, "").trim().slice(0, 100) || "file";

/** Re-encodes still images to JPEG (drops EXIF/GPS) and caps the size. Animated GIFs are sent as they are. */
export async function prepareImage(file: File): Promise<{ att: Attachment; blob: Blob }> {
  if (file.size > MAX_FILE) throw new Error("attach.tooBig");
  if (!IMG.test(file.type)) throw new Error("attach.badImage");
  if (file.type === "image/gif") return { att: { t: "file", kind: "image", name: safeName(file.name), mime: file.type, size: file.size }, blob: file };
  try {
    const bmp = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.85));
    return { att: { t: "file", kind: "image", name: safeName(file.name).replace(/\.\w+$/, "") + ".jpg", mime: "image/jpeg", size: blob.size }, blob };
  } catch { throw new Error("attach.badImage"); }
}
export function prepareDocument(file: File): { att: Attachment; blob: Blob } {
  if (file.size > MAX_FILE) throw new Error("attach.tooBig");
  if (file.size === 0) throw new Error("err.generic");
  return { att: { t: "file", kind: "document", name: safeName(file.name), mime: "application/octet-stream", size: file.size }, blob: file };
}
/** Square 160px JPEG data URL for profile photos. */
export async function prepareAvatar(file: File): Promise<string> {
  const bmp = await createImageBitmap(file); const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas"); c.width = c.height = 160;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 160, 160);
  return c.toDataURL("image/jpeg", 0.8);
}
export const validAvatar = (v: unknown): v is string => typeof v === "string" && v.length < 60_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v);

const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v: unknown, max: number) => typeof v === "string" && v.length <= max;

/** Validates an attachment received from a peer. Votes are never accepted here; they arrive in their own frames. */
export async function cleanAtt(a: unknown): Promise<Attachment | null> {
  if (!a || typeof a !== "object") return null; const o = a as Record<string, unknown>;
  switch (o.t) {
    case "file":
      if ((o.kind !== "image" && o.kind !== "document") || !str(o.name, 100) || !num(o.size, 1, MAX_FILE)) return null;
      return { t: "file", kind: o.kind, name: safeName(o.name as string), size: o.size as number, mime: o.kind === "image" && typeof o.mime === "string" && IMG.test(o.mime) ? o.mime : "application/octet-stream" };
    case "location": return num(o.lat, -90, 90) && num(o.lon, -180, 180) ? { t: "location", lat: o.lat as number, lon: o.lon as number } : null;
    case "contact": {
      if (!str(o.name, 80) || typeof o.pub !== "string" || typeof o.code !== "string") return null;
      try { if (fromB64(o.pub).length !== 65 || (await codeOfPub(o.pub)) !== o.code) return null; } catch { return null; }
      return { t: "contact", name: cleanName(o.name as string), code: o.code, pub: o.pub };
    }
    case "poll":
      if (!str(o.q, 200) || !Array.isArray(o.opts) || o.opts.length < 2 || o.opts.length > 6 || !o.opts.every((x) => str(x, 100) && x)) return null;
      return { t: "poll", q: o.q as string, opts: o.opts as string[], multi: o.multi === true, votes: {} };
    case "event":
      if (!str(o.title, 100) || !num(o.start, 0, 8.64e15) || (o.place !== undefined && !str(o.place, 100)) || (o.note !== undefined && !str(o.note, 300))) return null;
      return { t: "event", title: o.title as string, start: o.start as number, place: o.place as string | undefined, note: o.note as string | undefined };
    default: return null;
  }
}
export const validVote = (c: unknown, n: number, multi: boolean): c is number[] =>
  Array.isArray(c) && c.length <= (multi ? n : 1) && c.every((i) => Number.isInteger(i) && i >= 0 && i < n) && new Set(c).size === c.length;
