import { describe, expect, it } from "vitest";
import { createStoredIdentity, fromB64, hex, loadIdentity, utf8 } from "../lib/p2p/crypto";
import { ackRoot, liveTopic, mailRoot, makeRFrame, openFrom, openRFrame, pairKey, SeqWindow, sealTo, unHex } from "../lib/p2p/q7rp";

const mkId = async () => loadIdentity(await createStoredIdentity());
const hexOf = (fp: Uint8Array) => hex(fp);

describe("q7rp pairwise key", () => {
  it("gives both sides the same secret without any online handshake", async () => {
    const a = await mkId(), b = await mkId();
    const A = await pairKey(a.ecdh!, fromB64(b.spk), a.fp, b.fp);
    const B = await pairKey(b.ecdh!, fromB64(a.spk), b.fp, a.fp);
    expect(A && B).toBeTruthy();
    const s1 = await sealTo(A!, { hello: "offline world" });
    expect(await openFrom(B!, s1.iv, s1.ct)).toEqual({ hello: "offline world" });
    const s2 = await sealTo(B!, { n: 7 });
    expect(await openFrom(A!, s2.iv, s2.ct)).toEqual({ n: 7 });
  });
  it("never derives anything from a wrong key length", async () => {
    const a = await mkId(), b = await mkId();
    expect(await pairKey(a.ecdh!, new Uint8Array(64), a.fp, b.fp)).toBeNull();
    expect(await pairKey(a.ecdh!, fromB64(b.spk), a.fp, b.fp)).not.toBeNull();
  });
});

describe("q7rp relay frames", () => {
  const mk = async () => {
    const a = await mkId(), b = await mkId();
    const { iv, ct } = await sealTo((await pairKey(a.ecdh!, fromB64(b.spk), a.fp, b.fp))!, { k: "msg", body: "hi" });
    const bytes = await makeRFrame({ to: hexOf(b.fp), seq: 42, iv, ct, id: a });
    return { a, b, bytes, iv, ct };
  };
  it("round-trips: verifies, reveals only direction, hands the sealed payload over", async () => {
    const { a, b, bytes } = await mk();
    expect(bytes).toBeTruthy();
    const opened = await openRFrame(JSON.parse(new TextDecoder().decode(bytes!)));
    expect(opened).toMatchObject({ fp: hexOf(a.fp), to: hexOf(b.fp), seq: 42 });
    const key = await pairKey(b.ecdh!, fromB64(a.spk), b.fp, a.fp);
    expect(await openFrom(key!, opened!.iv, opened!.ct)).toEqual({ k: "msg", body: "hi" });
  });
  it("rejects tampered, forged and mismarked frames", async () => {
    const { bytes, a } = await mk();
    const r = JSON.parse(new TextDecoder().decode(bytes!)) as Record<string, unknown>;
    const cycle = async (o: unknown) => await openRFrame(JSON.parse(JSON.stringify(o)));
    expect(await cycle({ ...r, ct: (r.ct as string).slice(2) })).toBeNull();   // body edited
    expect(await cycle({ ...r, from: hexOf((await mkId()).fp) })).toBeNull();  // from ≠ fp(pub)
    expect(await cycle({ ...r, to: hexOf(a.fp) })).toBeNull();                 // destination swapped
    expect(await cycle({ ...r, v: 1 })).toBeNull();
    expect(await cycle({ ...r, seq: "42" })).toBeNull();
    expect(await cycle({ ...r, iv: "AAAA" })).toBeNull();
    expect(await cycle({ ...r, sig: "" })).toBeNull();
    expect(await cycle(JSON.parse(new TextDecoder().decode(bytes!)))).toBeTruthy(); // untouched copy is fine
  });
  it("keeps the sequence window: only unseen frames pass", () => {
    const w = new SeqWindow();
    expect(w.allow(1)).toBe(true); expect(w.allow(1)).toBe(false); expect(w.allow(2)).toBe(true);
    for (let i = 3; i <= 516; i++) w.allow(i);
    expect(w.allow(1)).toBe(true);  // evicted long ago — an ancient stale copy may legally return
    expect(w.allow(500)).toBe(false); // a recent frame replayed within the window is refused
  });
  it("names the mail, live and receipt topics", async () => {
    const a = await mkId(), fpHex = hexOf(a.fp);
    expect(mailRoot(fpHex)).toMatch(/^q7rp\/v2\/m\/[0-9a-f]{64}$/);
    expect(liveTopic(fpHex)).toMatch(/^q7rp\/v2\/l\/[0-9a-f]{64}$/);
    expect(ackRoot(fpHex)).toMatch(/^q7rp\/v2\/a\/[0-9a-f]{64}$/);
    expect(hex(unHex(fpHex))).toBe(fpHex); // hex → bytes → hex is lossless
  });
});
