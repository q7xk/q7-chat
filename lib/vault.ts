import type { StoredIdentity } from "./p2p/crypto";
import { fromB64, hex, randomHex, seal, toB64, unseal, utf8 } from "./p2p/crypto";
import * as db from "./db";

/**
 * The local vault: a password protects the identity keys at rest.
 *
 * PBKDF2-SHA256 (310k iterations) stretches the password into a KEK; the KEK wraps a
 * random master key; the master seals the identity (and optionally the authenticator
 * secret). No plaintext identity is left on disk while a vault exists, and the password
 * never leaves the device — there is no server to leak it from.
 */

export interface Vault { v: 1; salt: string; wrap: string; check: string; totp?: string; idleMin: number }
export const VAULT_FLAG = "q7.vault";
export const VAULT_ID_FLAG = "q7.vault.id";
const ITERS = 310_000;

export const getVault = async (): Promise<Vault | null> => ((await db.getFlag(VAULT_FLAG)) as Vault | undefined) ?? null;

const kekHex = async (password: string, salt: Uint8Array) => {
  const base = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERS }, base, 256)));
};

/** Creates the vault around a stored identity; the plaintext copy is erased afterwards. */
export async function createVault(password: string, stored: StoredIdentity, idleMin = 0): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const master = randomHex(32);
  const wrap = toB64(await seal(await kekHex(password, salt), master, "q7-kek-v1"));
  const check = toB64(await seal(master, "q7-vault-ok", "q7-check-v1"));
  const v: Vault = { v: 1, salt: toB64(salt), wrap, check, idleMin };
  await db.setFlag(VAULT_FLAG, v);
  await db.setFlag(VAULT_ID_FLAG, toB64(await seal(master, stored, "q7-id-v1")));
  await db.delIdentity();
}

/** Verifies the password and returns the unsealed master key. Null means wrong password. */
export async function openVault(password: string): Promise<{ vault: Vault; master: string } | null> {
  const vault = await getVault(); if (!vault) return null;
  let master: unknown = null;
  try { master = await unseal(await kekHex(password, fromB64(vault.salt)), fromB64(vault.wrap), "q7-kek-v1"); } catch { return null; }
  if (typeof master !== "string") return null;
  if ((await unseal(master, fromB64(vault.check), "q7-check-v1")) !== "q7-vault-ok") return null;
  return { vault, master };
}

/** Changes the password: fresh salt, same master, every sealed payload stays valid. */
export async function rotateVault(oldPassword: string, newPassword: string): Promise<boolean> {
  const opened = await openVault(oldPassword); if (!opened) return false;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrap = toB64(await seal(await kekHex(newPassword, salt), opened.master, "q7-kek-v1"));
  await db.setFlag(VAULT_FLAG, { ...opened.vault, salt: toB64(salt), wrap });
  return true;
}

/** Removes the lock: the identity goes back to plaintext storage (the default, unlocked state). */
export async function removeVault(password: string): Promise<boolean> {
  const opened = await openVault(password); if (!opened) return false;
  const id = await vaultIdentity(opened.master); if (!id) return false;
  await db.putIdentity(id);
  await db.delFlag(VAULT_ID_FLAG); await db.delFlag(VAULT_FLAG);
  return true;
}

/** Decrypts the identity sealed inside the vault (call after openVault). */
export async function vaultIdentity(master: string): Promise<StoredIdentity | null> {
  const raw = (await db.getFlag(VAULT_ID_FLAG)) as string | undefined; if (!raw) return null;
  try {
    const id = await unseal(master, fromB64(raw), "q7-id-v1");
    return id && typeof id === "object" && (id as StoredIdentity).key === "identity" ? (id as StoredIdentity) : null;
  } catch { return null; }
}

export async function setVaultIdle(idleMin: number) { const v = await getVault(); if (v) await db.setFlag(VAULT_FLAG, { ...v, idleMin }); }

/* ---------- TOTP (RFC 6238): SHA-1, 30 s steps, 6 digits — works with any authenticator app ---------- */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const b32 = (u: Uint8Array) => { let bits = 0, val = 0, out = ""; for (const b of u) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; while (out.length % 8) out += "="; return out; };
export const unb32 = (s: string) => { const out: number[] = []; let bits = 0, val = 0; for (const c of s.toUpperCase().replace(/=+$/g, "")) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); };
export const genTotpSecret = () => crypto.getRandomValues(new Uint8Array(20));
/** The URI authenticator apps scan; equivalent to Google Authenticator's "time based" entry. */
export const otpauthUri = (secret: Uint8Array, name: string) => `otpauth://totp/${encodeURIComponent(`Q7 Chat:${name}`)}?secret=${b32(secret)}&issuer=Q7%20Chat&algorithm=SHA1&digits=6&period=30`;
export async function totpNow(secret: Uint8Array, at = Date.now()): Promise<string> {
  const buf = new ArrayBuffer(8); new DataView(buf).setUint32(4, Math.floor(at / 30_000)); // counter, big-endian
  const key = await crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const o = h[19]! & 15;
  return String((((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!) % 1_000_000).padStart(6, "0");
}
/** ±1 step of clock skew, as the RFC suggests. */
export async function verifyTotp(secret: Uint8Array, code: string, at = Date.now()): Promise<boolean> {
  const c = code.replace(/\D/g, ""); if (c.length !== 6) return false;
  for (const d of [0, -30_000, 30_000]) if ((await totpNow(secret, at + d)) === c) return true;
  return false;
}

export async function storeTotp(master: string, secret: Uint8Array) {
  const v = await getVault(); if (!v) return;
  await db.setFlag(VAULT_FLAG, { ...v, totp: toB64(await seal(master, toB64(secret), "q7-totp-v1")) });
}
export async function clearTotp(master: string) {
  const v = await getVault(); if (!v) return;
  const { totp: _drop, ...rest } = v; void _drop;
  await db.setFlag(VAULT_FLAG, rest);
}
export async function loadTotp(master: string): Promise<Uint8Array | null> {
  const v = await getVault(); if (!v?.totp) return null;
  try { const s = await unseal(master, fromB64(v.totp), "q7-totp-v1"); return typeof s === "string" ? fromB64(s) : null; } catch { return null; }
}

/* ---------- unlocked identity hand-off: the manager reads this instead of the plaintext flag ---------- */

let runtime: StoredIdentity | null = null;
export const setRuntimeIdentity = (s: StoredIdentity) => { runtime = s; };
export const takeRuntimeIdentity = () => { const s = runtime; runtime = null; return s; };
