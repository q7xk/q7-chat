/** Web Crypto helpers for Q7 P2P: identity, 12-digit code, signed envelopes, session encryption. */
export const B = (u: Uint8Array) => u as unknown as BufferSource;
const enc = new TextEncoder();
const dec = new TextDecoder();
export const utf8 = (s: string) => enc.encode(s);

export const toB64 = (u: Uint8Array) => { let s = ""; u.forEach((b) => (s += String.fromCharCode(b))); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u;
};
export const concat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
export const cmp = (a: Uint8Array, b: Uint8Array) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!; return a.length - b.length; };
export const sha256 = async (d: Uint8Array | string) => new Uint8Array(await crypto.subtle.digest("SHA-256", B(typeof d === "string" ? enc.encode(d) : d)));
export const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
export const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));

/* ----- identity: an ECDSA P-256 key pair kept on the device ----- */
export interface StoredIdentity { key: "identity"; privJwk: JsonWebKey; pub: string }
export interface Identity { pub: Uint8Array; pubB64: string; fp: Uint8Array; code: string; sign: (d: Uint8Array) => Promise<Uint8Array> }

export async function createStoredIdentity(): Promise<StoredIdentity> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { key: "identity", privJwk: await crypto.subtle.exportKey("jwk", kp.privateKey), pub: toB64(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey))) };
}
/** 12-digit address derived from the public key. About 40 bits: an address, not a secret. */
export function codeFromFp(fp: Uint8Array) { let n = 0n; for (let i = 0; i < 6; i++) n = (n << 8n) | BigInt(fp[i]!); return (n % 1_000_000_000_000n).toString().padStart(12, "0"); }
export const codeOfPub = async (pubB64: string) => codeFromFp(await sha256(fromB64(pubB64)));
export const formatCode = (c: string) => c.replace(/(\d{4})(?=\d)/g, "$1 ");
export const parseCode = (s: string) => { const d = s.replace(/\D/g, ""); return d.length === 12 ? d : null; };

export async function loadIdentity(s: StoredIdentity): Promise<Identity> {
  const priv = await crypto.subtle.importKey("jwk", s.privJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const pub = fromB64(s.pub); const fp = await sha256(pub);
  return { pub, pubB64: s.pub, fp, code: codeFromFp(fp), sign: async (d) => new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, B(d))) };
}
export async function verify(pub: Uint8Array, sig: Uint8Array, data: Uint8Array) {
  try {
    const k = await crypto.subtle.importKey("raw", B(pub), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, B(sig), B(data));
  } catch { return false; }
}
/** 30 digits both people can compare out loud or side by side. */
export async function safetyNumber(a: Uint8Array, b: Uint8Array) {
  const [x, y] = cmp(a, b) <= 0 ? [a, b] : [b, a];
  const h = await sha256(concat(utf8("q7-safety-v1"), x, y));
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) groups.push((new DataView(h.buffer).getUint32(i * 4) % 100000).toString().padStart(5, "0"));
  return groups.join(" ");
}

/* ----- relay sealing: hides signaling content from the relay (key derives from the code) ----- */
async function hkdfKey(ikm: string, info: string, usage: KeyUsage[]) {
  const base = await crypto.subtle.importKey("raw", B(utf8(ikm)), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: B(utf8("q7-salt-v1")), info: B(utf8(info)) }, base, { name: "AES-GCM", length: 256 }, false, usage);
}
export async function seal(secret: string, obj: unknown) {
  const k = await hkdfKey(secret, "relay-v1", ["encrypt"]); const iv = crypto.getRandomValues(new Uint8Array(12));
  return concat(iv, new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: B(iv) }, k, B(utf8(JSON.stringify(obj))))));
}
export async function unseal(secret: string, data: Uint8Array): Promise<unknown | null> {
  try {
    if (data.length < 29) return null;
    const k = await hkdfKey(secret, "relay-v1", ["decrypt"]);
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: B(data.slice(0, 12)) }, k, B(data.slice(12)))));
  } catch { return null; }
}
export async function topicFor(kind: "k" | "r", id: string) { return `q7/v1/${kind}/${hex(await sha256(`${kind}|${id}`)).slice(0, 32)}`; }

/* ----- signed offer/answer envelopes (authenticate the SDP, including its DTLS fingerprint) ----- */
export interface Envelope { t: "offer" | "answer"; rid: string; pub: string; name: string; sdp: string; ts: number; sig: string; to?: string }
const envBytes = (e: Omit<Envelope, "sig">) => utf8(JSON.stringify(["q7-env-v1", e.t, e.rid, e.pub, e.name, e.ts, e.to ?? null, e.sdp]));
export const cleanName = (n: string) => n.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 40) || "Unknown";

export async function signEnvelope(id: Identity, e: { t: "offer" | "answer"; rid: string; name: string; sdp: string; ts: number; to?: string }): Promise<Envelope> {
  const body = { ...e, pub: id.pubB64 };
  return { ...body, sig: toB64(await id.sign(envBytes(body))) };
}
export async function checkEnvelope(raw: unknown, now: number, maxAgeMs = 600_000): Promise<Envelope | null> {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if ((e.t !== "offer" && e.t !== "answer") || typeof e.rid !== "string" || !/^[0-9a-f]{32}$/.test(e.rid) || typeof e.pub !== "string" || typeof e.name !== "string"
    || typeof e.sdp !== "string" || typeof e.ts !== "number" || typeof e.sig !== "string" || (e.to !== undefined && typeof e.to !== "string")) return null;
  if (e.sdp.length > 12000 || e.name.length > 80 || Math.abs(now - e.ts) > maxAgeMs) return null;
  let pub: Uint8Array, sig: Uint8Array;
  try { pub = fromB64(e.pub); sig = fromB64(e.sig); } catch { return null; }
  if (pub.length !== 65) return null;
  const env = e as unknown as Envelope;
  if (!(await verify(pub, sig, envBytes(env)))) return null;
  return { ...env, name: cleanName(env.name) };
}

/* ----- session: ephemeral ECDH signed by the identity key, then AES-GCM with counter nonces ----- */
export interface Hello { k: "hello"; pub: string; eph: string; nonce: string; sig: string }
export interface HandshakeState { eph: CryptoKeyPair; ephRaw: Uint8Array; nonce: Uint8Array; hello: Hello }
export interface Session { peerPub: Uint8Array; encrypt: (o: unknown) => Promise<ArrayBuffer>; decrypt: (b: ArrayBuffer) => Promise<unknown> }
const helloBytes = (eph: string, nonce: string) => utf8(JSON.stringify(["q7-hello-v1", eph, nonce]));

export async function startHandshake(id: Identity): Promise<HandshakeState> {
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const ephRaw = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const sig = toB64(await id.sign(helloBytes(toB64(ephRaw), toB64(nonce))));
  return { eph, ephRaw, nonce, hello: { k: "hello", pub: id.pubB64, eph: toB64(ephRaw), nonce: toB64(nonce), sig } };
}

export async function finishHandshake(st: HandshakeState, peer: unknown): Promise<Session | null> {
  try {
    if (!peer || typeof peer !== "object") return null;
    const p = peer as Record<string, unknown>;
    if (p.k !== "hello" || typeof p.pub !== "string" || typeof p.eph !== "string" || typeof p.nonce !== "string" || typeof p.sig !== "string") return null;
    const peerPub = fromB64(p.pub), peerEph = fromB64(p.eph), peerNonce = fromB64(p.nonce);
    if (peerPub.length !== 65 || peerEph.length !== 65 || peerNonce.length !== 16) return null;
    if (!(await verify(peerPub, fromB64(p.sig), helloBytes(p.eph, p.nonce)))) return null;
    const pk = await crypto.subtle.importKey("raw", B(peerEph), { name: "ECDH", namedCurve: "P-256" }, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pk }, st.eph.privateKey, 256);
    const salt = await sha256(concat(...[st.nonce, peerNonce].sort(cmp)));
    const base = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: B(salt), info: B(utf8("q7-session-v1")) }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const mine = cmp(st.ephRaw, peerEph) < 0 ? 0 : 1;
    let tx = 0n, rx = 0n;
    const iv = (dir: number, seq: bigint) => { const b = new Uint8Array(12); b[0] = dir; new DataView(b.buffer).setBigUint64(4, seq); return b; };
    return {
      peerPub,
      encrypt: async (o) => { const n = iv(mine, tx++); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: B(n) }, key, B(utf8(JSON.stringify(o)))); return ct; },
      decrypt: async (buf) => { const n = iv(1 - mine, rx); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: B(n) }, key, buf); rx++; return JSON.parse(dec.decode(pt)); },
    };
  } catch { return null; }
}
