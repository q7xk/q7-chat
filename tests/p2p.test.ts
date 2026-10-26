import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { checkEnvelope, codeFromFp, createStoredIdentity, finishHandshake, formatCode, loadIdentity, parseCode, safetyNumber, seal, signEnvelope, startHandshake, unseal, topicFor, sha256 } from "../lib/p2p/crypto";
import { packEnvelope, unpackEnvelope } from "../lib/p2p/pack";
import { connectPacket, parsePackets, parsePublish, publishPacket, subscribePacket } from "../lib/p2p/mqtt";

const mkId = async () => loadIdentity(await createStoredIdentity());
const rid = "a".repeat(32);

describe("identity and code", () => {
  it("derives a stable 12-digit code", async () => {
    const stored = await createStoredIdentity();
    const a = await loadIdentity(stored), b = await loadIdentity(stored);
    expect(a.code).toMatch(/^\d{12}$/); expect(a.code).toBe(b.code);
    expect(parseCode(formatCode(a.code))).toBe(a.code); expect(parseCode("123")).toBeNull();
    expect(codeFromFp(await sha256(a.pub))).toBe(a.code);
  });
  it("gives both sides the same safety number", async () => {
    const a = await mkId(), b = await mkId();
    expect(await safetyNumber(a.pub, b.pub)).toBe(await safetyNumber(b.pub, a.pub));
    expect(await safetyNumber(a.pub, b.pub)).toMatch(/^(\d{5} ){5}\d{5}$/);
  });
});

describe("signed envelopes", () => {
  it("verifies, and rejects tampering, staleness and bad shapes", async () => {
    const id = await mkId(), now = Date.now();
    const env = await signEnvelope(id, { t: "offer", rid, to: "123456789012", name: "Ayşe", sdp: "v=0", ts: now });
    expect((await checkEnvelope(env, now))?.name).toBe("Ayşe");
    expect(await checkEnvelope({ ...env, sdp: "v=1" }, now)).toBeNull();
    expect(await checkEnvelope({ ...env, to: "999999999999" }, now)).toBeNull();
    expect(await checkEnvelope(env, now + 11 * 60_000)).toBeNull();
    expect(await checkEnvelope({ ...env, rid: "x" }, now)).toBeNull();
    expect(await checkEnvelope("nope", now)).toBeNull();
  });
  it("strips control characters from names after verification", async () => {
    const id = await mkId(), now = Date.now();
    const env = await signEnvelope(id, { t: "answer", rid, name: "A\u202eB\u0007", sdp: "v=0", ts: now });
    expect((await checkEnvelope(env, now))?.name).toBe("AB");
  });
  it("round-trips through the compact invitation format", async () => {
    const id = await mkId(), env = await signEnvelope(id, { t: "offer", rid, name: "x", sdp: "v=0\r\n".repeat(200), ts: Date.now() });
    const text = await packEnvelope(env);
    expect(text.startsWith("Q7:")).toBe(true); expect(text.length).toBeLessThan(JSON.stringify(env).length);
    expect(await unpackEnvelope(text)).toEqual(env);
    await expect(unpackEnvelope("hello")).rejects.toThrow();
    await expect(unpackEnvelope("Q7:@@@")).rejects.toThrow();
  });
});

describe("relay sealing", () => {
  it("only opens with the right secret and hides topics behind hashes", async () => {
    const sealed = await seal("123456789012", { hi: 1 });
    expect(await unseal("123456789012", sealed)).toEqual({ hi: 1 });
    expect(await unseal("000000000000", sealed)).toBeNull();
    expect(await unseal("123456789012", sealed.slice(0, 20))).toBeNull();
    expect(await topicFor("k", "123456789012")).toMatch(/^q7\/v1\/k\/[0-9a-f]{32}$/);
  });
});

describe("secure session", () => {
  const pair = async () => {
    const a = await mkId(), b = await mkId(), sa = await startHandshake(a), sb = await startHandshake(b);
    return { a, b, sa, sb, A: await finishHandshake(sa, sb.hello), B: await finishHandshake(sb, sa.hello) };
  };
  it("encrypts in both directions and identifies the peer", async () => {
    const { a, b, A, B } = await pair();
    expect(A && B).toBeTruthy();
    expect(Array.from(A!.peerPub)).toEqual(Array.from(b.pub)); expect(Array.from(B!.peerPub)).toEqual(Array.from(a.pub));
    expect(await B!.decrypt(await A!.encrypt({ n: 1 }))).toEqual({ n: 1 });
    expect(await A!.decrypt(await B!.encrypt({ n: 2 }))).toEqual({ n: 2 });
    expect(await B!.decrypt(await A!.encrypt({ n: 3 }))).toEqual({ n: 3 });
  });
  it("rejects replayed, reordered and tampered frames", async () => {
    const { A, B } = await pair();
    const f1 = await A!.encrypt({ n: 1 }), f2 = await A!.encrypt({ n: 2 });
    await expect(B!.decrypt(f2)).rejects.toThrow();            // out of order
    expect(await B!.decrypt(f1)).toEqual({ n: 1 });
    await expect(B!.decrypt(f1)).rejects.toThrow();            // replay
    const f3 = new Uint8Array(await A!.encrypt({ n: 3 })); f3[0] = f3[0]! ^ 1;
    await expect(B!.decrypt(f3.buffer)).rejects.toThrow();     // tampered
  });
  it("rejects a hello with a forged signature or swapped key", async () => {
    const { sa, sb } = await pair(), evil = await mkId(), se = await startHandshake(evil);
    expect(await finishHandshake(sa, { ...sb.hello, sig: se.hello.sig })).toBeNull();
    expect(await finishHandshake(sa, { ...sb.hello, pub: evil.pubB64 })).toBeNull();
    expect(await finishHandshake(sa, { k: "x" })).toBeNull();
  });
});

describe("mqtt codec", () => {
  it("round-trips publish packets, including split and concatenated frames", () => {
    const p1 = publishPacket("q7/v1/k/abc", new Uint8Array(300).fill(7)), p2 = publishPacket("t", Uint8Array.of(1, 2, 3));
    const all = new Uint8Array(p1.length + p2.length); all.set(p1); all.set(p2, p1.length);
    const cut = parsePackets(all.slice(0, p1.length + 2));
    expect(cut.packets).toHaveLength(1);
    const { packets } = parsePackets(all); expect(packets).toHaveLength(2);
    const m = parsePublish(packets[0]!); expect(m.topic).toBe("q7/v1/k/abc"); expect(m.payload).toHaveLength(300);
    expect(parsePublish(packets[1]!).payload).toEqual(Uint8Array.of(1, 2, 3));
  });
  it("builds well-formed connect and subscribe packets", () => {
    expect(connectPacket("c")[0]).toBe(0x10); expect(subscribePacket(1, "a/b")[0]).toBe(0x82);
    expect(parsePackets(connectPacket("client")).packets[0]!.type).toBe(1);
  });
});

import { cleanAtt, prepareDocument, safeName, validAvatar, validVote } from "../lib/attach";
describe("attachments from peers", () => {
  it("accepts valid shapes and rejects bad ones", async () => {
    expect(await cleanAtt({ t: "location", lat: 41.01, lon: 28.97 })).toMatchObject({ t: "location" });
    expect(await cleanAtt({ t: "location", lat: 999, lon: 0 })).toBeNull();
    expect(await cleanAtt({ t: "poll", q: "Tea?", opts: ["yes", "no"], multi: false, votes: { evil: [0] } })).toEqual({ t: "poll", q: "Tea?", opts: ["yes", "no"], multi: false, votes: {} });
    expect(await cleanAtt({ t: "poll", q: "x", opts: ["only one"] })).toBeNull();
    expect(await cleanAtt({ t: "file", kind: "document", name: "../../etc/passwd", size: 10, mime: "text/html" })).toMatchObject({ name: "_.._etc_passwd", mime: "application/octet-stream" });
    expect(await cleanAtt({ t: "file", kind: "image", name: "a.svg", size: 10, mime: "image/svg+xml" })).toMatchObject({ mime: "application/octet-stream" });
    expect(await cleanAtt({ t: "file", kind: "document", name: "big", size: 99_000_000 })).toBeNull();
    expect(await cleanAtt({ t: "event", title: "Party", start: Date.now() })).toMatchObject({ t: "event" });
    expect(await cleanAtt({ t: "script" })).toBeNull();
  });
  it("only accepts a contact card whose code matches its key", async () => {
    const id = await mkId();
    expect(await cleanAtt({ t: "contact", name: "A", pub: id.pubB64, code: id.code })).toMatchObject({ t: "contact" });
    expect(await cleanAtt({ t: "contact", name: "A", pub: id.pubB64, code: "000000000000" })).toBeNull();
  });
  it("validates votes and avatars", () => {
    expect(validVote([1], 3, false)).toBe(true); expect(validVote([0, 1], 3, false)).toBe(false); expect(validVote([0, 1], 3, true)).toBe(true);
    expect(validVote([3], 3, true)).toBe(false); expect(validVote([1, 1], 3, true)).toBe(false);
    expect(validAvatar("data:image/jpeg;base64,/9j/4AAQ")).toBe(true); expect(validAvatar("data:image/svg+xml;base64,AAAA")).toBe(false); expect(validAvatar("javascript:1")).toBe(false);
  });
  it("sanitises names and rejects oversized or empty documents", () => {
    expect(safeName("a/b\\c:d")).toBe("a_b_c_d");
    expect(() => prepareDocument(new File([new Uint8Array(11 * 1024 * 1024)], "x.bin"))).toThrow("attach.tooBig");
    expect(() => prepareDocument(new File([], "empty"))).toThrow();
  });
});
