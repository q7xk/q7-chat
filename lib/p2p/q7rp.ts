import { B, cmp, concat, fromB64, hex, sha256, toB64, utf8, verify, type Identity } from "./crypto";

/**
 * Q7RP v2 — the relay layers of Q7. Where the v1 signalling layer only punches a hole,
 * these frames keep a conversation alive when a direct WebRTC link cannot exist
 * (symmetric NAT, UDP blocked, one side offline) or has not been established yet.
 *
 * No server we control is involved: frames travel over the same dumb public MQTT relays
 * as the signalling. Every frame is
 *   - sealed with a pairwise key derived from static ECDH keys (exchanged in signed
 *     envelopes/hellos, so both sides hold the same secret even without a session), and
 *   - signed by the sender's identity key, so a relay can neither read nor forge messages,
 *     and offline copies ("mailbox") can be dropped long after both sides leave.
 */

/* ---------- pairwise key: ECDH(my static, peer static) → AES-256-GCM ---------- */
export const unHex = (s: string) => { const b = new Uint8Array(32); for (let i = 0; i < 32; i++) b[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16); return b; };
export async function pairKey(myEcdh: CryptoKey, peerEk: Uint8Array, myFp: Uint8Array, peerFp: Uint8Array): Promise<CryptoKey | null> {
  try {
    if (peerEk.length !== 65) return null;
    const pub = await crypto.subtle.importKey("raw", B(peerEk), { name: "ECDH", namedCurve: "P-256" }, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, myEcdh, 256);
    const [a, b] = cmp(myFp, peerFp) <= 0 ? [myFp, peerFp] : [peerFp, myFp];
    const salt = await sha256(concat(a, b));
    const base = await crypto.subtle.importKey("raw", B(new Uint8Array(bits)), "HKDF", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: B(salt), info: B(utf8("q7rp-pair-v2")) }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  } catch { return null; }
}
export async function sealTo(key: CryptoKey, obj: unknown): Promise<{ iv: Uint8Array; ct: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: B(iv) }, key, B(utf8(JSON.stringify(obj)))));
  return { iv, ct };
}
export async function openFrom(key: CryptoKey, iv: Uint8Array, ct: Uint8Array): Promise<unknown | null> {
  try { return JSON.parse(new TextDecoder().decode(new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: B(iv) }, key, B(ct))))); }
  catch { return null; }
}

/* ---------- signed relay frames ---------- */
export interface RFrame { v: 2; from: string; to: string; pub: string; ek?: string; seq: number; iv: string; ct: string; sig: string }
const HEX64 = /^[0-9a-f]{64}$/;
const rBytes = (r: Omit<RFrame, "sig">) => utf8(JSON.stringify(["q7rp-v2", r.from, r.to, r.pub, r.ek ?? null, r.seq, r.iv, r.ct]));

export interface FrameInput { to: string; seq: number; iv: Uint8Array; ct: Uint8Array; id: Identity }
/** Creates the exact bytes a relay stores and forwards. Signed, so relays can't alter anything. */
export async function makeRFrame(p: FrameInput): Promise<Uint8Array | null> {
  try {
    if (!p.id.spk || !HEX64.test(p.to)) return null;
    const r: Omit<RFrame, "sig"> = { v: 2, from: hex(p.id.fp), to: p.to, pub: p.id.pubB64, ek: p.id.spk, seq: p.seq, iv: toB64(p.iv), ct: toB64(p.ct) };
    return utf8(JSON.stringify({ ...r, sig: toB64(await p.id.sign(rBytes(r))) }));
  } catch { return null; }
}
export type OpenFrame = { fp: string; to: string; ek?: Uint8Array; seq: number; iv: Uint8Array; ct: Uint8Array };
/** Verifies signature and shape. Returns null for anything a relay could have mangled or forged. */
export async function openRFrame(raw: unknown): Promise<OpenFrame | null> {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (e.v !== 2 || typeof e.from !== "string" || !HEX64.test(e.from) || typeof e.to !== "string" || !HEX64.test(e.to)
    || typeof e.pub !== "string" || typeof e.seq !== "number" || !Number.isInteger(e.seq) || e.seq < 0 || e.seq > Number.MAX_SAFE_INTEGER
    || typeof e.iv !== "string" || typeof e.ct !== "string" || typeof e.sig !== "string"
    || (e.ek !== undefined && typeof e.ek !== "string")) return null;
  if (toB64(new Uint8Array(12)).length !== e.iv.length) return null;
  let pub, iv, ct, sig, ek: Uint8Array | undefined;
  try { pub = fromB64(e.pub); iv = fromB64(e.iv); ct = fromB64(e.ct); sig = fromB64(e.sig); if (e.ek !== undefined) ek = fromB64(e.ek); } catch { return null; }
  if (pub.length !== 65 || iv.length !== 12 || ct.length < 16 || ct.length > 220_000 || (ek && ek.length !== 65) || sig.length > 100) return null;
  if (hex(await sha256(pub)) !== e.from) return null; // "from" must be the fingerprint of the signing key
  if (!(await verify(pub, sig, rBytes(e as unknown as Omit<RFrame, "sig">)))) return null;
  return { fp: e.from, to: e.to, ...(ek ? { ek } : {}), seq: e.seq, iv, ct };
}
/** Sequences must be unique per direction; duplicates (stale retained copies) are refused. */
export class SeqWindow {
  private seen = new Set<number>(); private list: number[] = [];
  allow(seq: number): boolean {
    if (this.seen.has(seq)) return false;
    this.seen.add(seq); this.list.push(seq);
    if (this.list.length > 512) { const gone = this.list.shift()!; this.seen.delete(gone); }
    return true;
  }
}

/* ---------- relay topics ---------- */
export const mailRoot = (fp: string) => `q7rp/v2/m/${fp}`;      // + /<msgid>[/<part>]: retained, survives the peer going offline
export const liveTopic = (fp: string) => `q7rp/v2/l/${fp}`;     // fire-and-forget push for a peer that is online right now
export const ackRoot = (fp: string) => `q7rp/v2/a/${fp}`;       // + /<msgid>: signed delivery receipts
