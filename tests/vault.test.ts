import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { createStoredIdentity, fromB64, utf8 } from "../lib/p2p/crypto";
import * as db from "../lib/db";
import * as vault from "../lib/vault";

/**
 * The vault: password → PBKDF2 → KEK → wrapped master → sealed identity, plus
 * RFC 6238 TOTP for authenticator apps. Node 22 provides WebCrypto globally.
 */

let stored: Awaited<ReturnType<typeof createStoredIdentity>>;

beforeAll(async () => {
  stored = await createStoredIdentity();
});

describe("TOTP (RFC 6238 test vectors, SHA-1 / 30 s / 6 digits)", () => {
  const secret = utf8("12345678901234567890"); // the RFC's ASCII secret
  // 8-digit RFC values truncated to 6: 94287082→287082, 07081804→081804, 14050403→140504, 89005924→890059, 69279037→279037, 65353130→353130
  const cases: [number, string][] = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]];
  it.each(cases)("T=%i → %s", async (tSec, code) => {
    expect(await vault.totpNow(secret, tSec * 1000)).toBe(code);
  });
  it("accepts ±1 step of skew and rejects the rest", async () => {
    expect(await vault.verifyTotp(secret, "287082", 59_000)).toBe(true);
    expect(await vault.verifyTotp(secret, "287082", 59_000 + 29_000)).toBe(true);  // same step
    expect(await vault.verifyTotp(secret, "287082", 59_000 - 31_000)).toBe(true);  // previous step
    expect(await vault.verifyTotp(secret, "287082", 59_000 + 120_000)).toBe(false);
    expect(await vault.verifyTotp(secret, "28708", 59_000)).toBe(false);           // wrong length
    expect(await vault.verifyTotp(secret, "o0o0o0", 59_000)).toBe(false);
  });
  it("round-trips base32", () => {
    for (let i = 0; i < 3; i++) {
      const raw = crypto.getRandomValues(new Uint8Array(20));
      expect(vault.unb32(vault.b32(raw))).toEqual(raw);
    }
    expect(vault.b32(utf8("foobar"))).toBe("MZXW6YTBOI======");
  });
});

describe("vault", () => {
  it("seals the identity, opens with the right password only, rotates and removes", async () => {
    await vault.createVault("correct horse", stored);
    const v = await vault.getVault();
    expect(v && v.v === 1 && typeof v.wrap === "string").toBe(true);
    expect(await db.getIdentity()).toBeUndefined();                 // no plaintext identity while the vault exists

    expect(await vault.openVault("wrong horse")).toBeNull();
    const opened = await vault.openVault("correct horse");
    expect(opened).toBeTruthy();
    const id = await vault.vaultIdentity(opened!.master);
    expect(id).toBeTruthy();
    expect(id!.pub).toBe(stored.pub);
    expect(id!.privJwk).toEqual(stored.privJwk);

    expect(await vault.rotateVault("wrong horse", "new pass")).toBe(false);
    expect(await vault.rotateVault("correct horse", "new pass")).toBe(true);
    expect(await vault.openVault("correct horse")).toBeNull();      // old password dead
    const re = await vault.openVault("new pass");
    expect(re).toBeTruthy();
    expect((await vault.vaultIdentity(re!.master))!.pub).toBe(stored.pub);

    expect(await vault.removeVault("wrong pass")).toBe(false);
    expect(await vault.removeVault("new pass")).toBe(true);
    expect(await vault.getVault()).toBeNull();
    const back = await db.getIdentity();
    expect(back?.pub).toBe(stored.pub);                             // restored to plaintext storage
  }, 30_000);

  it("stores the authenticator secret sealed under the master", async () => {
    await vault.createVault("pw", stored);
    const { master } = (await vault.openVault("pw"))!;
    const secret = vault.genTotpSecret();
    await vault.storeTotp(master, secret);
    const round = await vault.loadTotp(master);
    expect(round).toEqual(secret);
    expect(await vault.verifyTotp(round!, await vault.totpNow(secret))).toBe(true);
    await vault.clearTotp(master);
    expect(await vault.loadTotp(master)).toBeNull();
    const v = await vault.getVault();
    expect(v && "totp" in v).toBe(false);                           // the flag disappears entirely
    await vault.removeVault("pw");
  }, 30_000);

  it("rejects tampered ciphertexts", async () => {
    await vault.createVault("pw2", stored);
    const raw = ((await db.getFlag(vault.VAULT_ID_FLAG)) as string);
    const bytes = fromB64(raw); bytes[bytes.length - 1]! ^= 0x01;    // flip the last ciphertext byte
    await db.setFlag(vault.VAULT_ID_FLAG, (await import("../lib/p2p/crypto")).toB64(bytes));
    const { master } = (await vault.openVault("pw2"))!;
    expect(await vault.vaultIdentity(master)).toBeNull();
    await vault.removeVault("pw2");
    await db.putIdentity(stored);                                   // leave a clean slate for later suites
  }, 30_000);
});
