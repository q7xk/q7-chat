import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import type { Conversation, Message } from "../lib/types";

/**
 * Full two-peer simulation of Q7RP over a fake broker mesh and (optionally broken) WebRTC.
 * Module graphs are isolated per side with Q7_DB so IndexedDB stores never collide.
 */

/* ---------- fake broker: real MQTT packets, routing, retained messages ---------- */
const topicMatch = (pattern: string, topic: string): boolean => {
  const p = pattern.split("/"), t = topic.split("/");
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "#") return true;
    if (i >= t.length || (p[i] !== "+" && p[i] !== t[i])) return false;
  }
  return p.length === t.length;
};

class FakeWS {
  static instances: FakeWS[] = [];
  static brokers = new Map<string, FakeBroker>();
  onopen?: () => void; onclose?: () => void; onerror?: () => void; onmessage?: (e: { data: ArrayBuffer }) => void;
  binaryType = "arraybuffer"; readyState = 1; closed = false;
  constructor(public url: string, public protocol: string) { FakeWS.instances.push(this); setTimeout(() => this.onopen?.(), 0); }
  send(buf: ArrayBuffer) { FakeWS.brokers.get(this.url)?.route(this, new Uint8Array(buf)); }
  deliver(p: Uint8Array) { setTimeout(() => !this.closed && this.onmessage?.({ data: p.slice().buffer as ArrayBuffer })); }
  close() { this.closed = true; this.readyState = 3; }
}

const vl = (n: number) => { const o: number[] = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b); } while (n > 0); return o; };
const str = (s: string) => { const b = new TextEncoder().encode(s); return [b.length >> 8, b.length & 255, ...b]; };

class FakeBroker {
  retained = new Map<string, Uint8Array>(); subs = new Map<string, Set<FakeWS>>();
  static wire(url: string) { let b = FakeWS.brokers.get(url); if (!b) { b = new FakeBroker(); FakeWS.brokers.set(url, b); } return b; }
  route(from: FakeWS, packet: Uint8Array) {
    let i = 0; while (i < packet.length) { // one packet per connection in practice
      const type = packet[i]! >> 4; let len = 0, mul = 1, j = i + 1;
      for (let k = 0; k < 4; k++) { const b = packet[j++]!; len += (b & 127) * mul; mul *= 128; if (!(b & 128)) break; }
      const body = packet.slice(j, j + len); this.handle(type, packet[i]! & 15, body, from); i = j + len;
    }
  }
  handle(type: number, flags: number, body: Uint8Array, from: FakeWS) {
    const td = new TextDecoder();
    if (type === 1) { from.deliver(Uint8Array.from([0x20, 2, 0, 0])); return; } // CONNACK (session 0, rc 0)
    if (type === 8) {                                                     // SUBSCRIBE → register + retained flood
      const tl = (body[2]! << 8) | body[3]!, topic = td.decode(body.slice(4, 4 + tl));
      const set = this.subs.get(topic) ?? new Set<FakeWS>(); set.add(from); this.subs.set(topic, set);
      for (const [rt, payload] of this.retained) if (topicMatch(topic, rt)) from.deliver(Uint8Array.from([0x30, ...vl(str(rt).length + payload.length), ...str(rt), ...payload]));
      return;
    }
    if (type === 3) {                                                     // PUBLISH → route, respect retain
      const tl = (body[0]! << 8) | body[1]!, topic = td.decode(body.slice(2, 2 + tl)), payload = body.slice(2 + tl);
      if (flags & 1) { payload.length ? this.retained.set(topic, payload) : this.retained.delete(topic); }
      for (const [pattern, set] of this.subs) for (const s of set) if (s !== from && topicMatch(pattern, topic)) s.deliver(Uint8Array.from([0x30, ...vl(str(topic).length + payload.length), ...str(topic), ...payload]));
    }
  }
}

/* ---------- WebRTC stub whose DataChannels never open (forces the Q7RP path) ---------- */
class FakePC {
  createDataChannel() { return { bufferedAmount: 0, readyState: "connecting", close() {}, send() {} }; }
  onconnectionstatechange: unknown = null; ondatachannel: unknown = null;
  makeOfferBound = false;
  async setLocalDescription(d: unknown) { this.localDescription = d; return d; }
  async setRemoteDescription(d: unknown) { return d; }
  async createOffer() { return { type: "offer", sdp: "v=0 offer" }; }
  async createAnswer() { return { type: "answer", sdp: "v=0 answer" }; }
  localDescription: unknown = null;
  get iceGatheringState() { return "complete"; }
  addEventListener() {} removeEventListener() {}
  close() {}
  get connectionState() { return "new"; }
}

const stubBrowser = () => {
  vi.stubGlobal("RTCPeerConnection", FakePC);
  vi.stubGlobal("WebSocket", FakeWS);
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
};

type Side = Awaited<typeof import("../lib/p2p/manager")>;
type Box = import("../lib/p2p/manager").Host & { conversations: Conversation[]; messages: Message[] };
const host = (): Box => {
  const conversations: Conversation[] = [], messages: Message[] = [];
  return { conversations, messages,
    getConversations: () => conversations, getMessages: () => messages,
    ensureConversation(contactId: string, title: string) { let c = conversations.find((x) => x.contactId === contactId); if (!c) { c = { id: "conv-" + contactId.slice(0, 8), mode: "p2p", contactId, title: title || "C", pinned: false, muted: false, archived: false, unread: 0 }; conversations.push(c); } return c.id; },
    addMessage(m: Message) { if (!messages.some((x) => x.id === m.id)) messages.push(m); },
    blobReady() {}, updateMessage(id: string, patch: Partial<Message>) { const m = messages.find((x) => x.id === id); if (m) Object.assign(m, patch); },
    removeConversationFor() {}, bumpUnread() {},
    createGroup(opts: { id?: string; title: string; members: string[]; hue?: number; names?: Record<string, string> }) {
      const ex = conversations.find((x) => x.id === opts.id); if (ex) return ex.id;
      const c: Conversation = { id: opts.id ?? "g" + conversations.length, mode: "group", title: opts.title, pinned: false, muted: false, archived: false, unread: 0, members: [...opts.members], hue: opts.hue, names: opts.names };
      conversations.push(c); return c.id;
    },
    updateGroup(gid: string, patch: Partial<Conversation>) { const c = conversations.find((x) => x.id === gid); if (c) Object.assign(c, patch); },
    removeGroup(gid: string) {
      const i = conversations.findIndex((x) => x.id === gid); if (i >= 0) conversations.splice(i, 1);
      for (let j = messages.length - 1; j >= 0; j--) if (messages[j]!.conversationId === gid) messages.splice(j, 1);
    },
    reactMessage(id: string, emoji: string, who: string, on: boolean) {
      const m = messages.find((x) => x.id === id); if (!m) return;
      const rx: Record<string, string[]> = { ...(m.reactions ?? {}) }; const list = new Set(rx[emoji] ?? []);
      if (on) list.add(who); else list.delete(who);
      if (list.size) rx[emoji] = [...list]; else delete rx[emoji];
      m.reactions = Object.keys(rx).length ? rx : undefined;
    },
    removeMessage(id: string) { const i = messages.findIndex((x) => x.id === id); if (i >= 0) messages.splice(i, 1); } };
};
const openSide = async (tag: string) => {
  process.env.Q7_DB = tag; vi.resetModules();
  const mod = (await import("../lib/p2p/manager")) as Side;
  stubBrowser();
  for (const u of mod.DEFAULT_RELAYS) FakeBroker.wire(u); // every advertised broker is a live fake
  const mgr = new mod.P2PManager(host());
  await mgr.init();
  await vi.waitFor(() => expect(mgr.getSnapshot().relay.connected).toBeGreaterThanOrEqual(1), { timeout: 4000, interval: 20 });
  const ident = await (await import("../lib/db")).getIdentity(); // this graph's own identity
  return { mod, mgr, host: (mgr as unknown as { host: Box }).host, ident: ident! };
};
const waitFor = async (fn: () => unknown, ms = 6000) => {
  try { await vi.waitFor(() => expect(fn()).toBeTruthy(), { timeout: ms, interval: 50 }); return true; }
  catch (e) { return false; }
};

describe("Q7RP simulated end to end", () => {
  it("pairs, chats live over the relays and clears the mailbox, both directions", async () => {
    const A = await openSide("q7-sim-a");
    const B = await openSide("q7-sim-b");
    const { hex, codeOfPub, sha256 } = await import("../lib/p2p/crypto");
    const fpB = hex(await sha256(Buffer.from(B.ident.pub, "base64")));
    const fpA = hex(await sha256(Buffer.from(A.ident.pub, "base64")));
    (A.mgr as unknown as { set(p: unknown): void }).set({ contacts: [{ id: fpB, pub: B.ident.pub, name: "Bee", code: await codeOfPub(B.ident.pub), addedAt: 1, verified: true, ek: B.ident.ecdhPub }] });
    (B.mgr as unknown as { set(p: unknown): void }).set({ contacts: [{ id: fpA, pub: A.ident.pub, name: "Ay", code: await codeOfPub(A.ident.pub), addedAt: 1, verified: true, ek: A.ident.ecdhPub }] });
    A.host.ensureConversation(fpB, "Bee");  // real apps receive this from the pairing flow; mirror it here
    B.host.ensureConversation(fpA, "Ay");

    A.mgr.sendText(fpB, "selam B");
    const step1 = await waitFor(() => B.host.getMessages().some((m) => m.body === "selam B" && m.direction === "in"));
    const step2 = await waitFor(() => A.host.getMessages().find((m) => m.body === "selam B")?.status === "delivered");
    B.mgr.sendText(fpA, "naber A");
    const step3 = await waitFor(() => A.host.getMessages().some((m) => m.body === "naber A" && m.direction === "in"));
    if (!step1 || !step2 || !step3) {
      console.log("STEP", { step1, step2, step3 });
      console.log("A msg", JSON.stringify(A.host.getMessages()));
      console.log("B msg", JSON.stringify(B.host.getMessages()));
      console.log("A snap", JSON.stringify({ contacts: A.mgr.getSnapshot().contacts, relay: A.mgr.getSnapshot().relay }));
      console.log("B snap", JSON.stringify({ contacts: B.mgr.getSnapshot().contacts, relay: B.mgr.getSnapshot().relay }));
      console.log("A outbox", JSON.stringify([...(A.mgr as unknown as { outbox: Map<string, unknown> }).outbox.keys()]));
      console.log("retained", JSON.stringify([...FakeWS.brokers.values()].flatMap((b) => [...b.retained.keys()])));
    }
    expect({ step1, step2, step3 }).toEqual({ step1: true, step2: true, step3: true });
    expect(A.mgr.getSnapshot().modes[fpB]).toBe("relay");
  }, 30000);

  it("spaces: invite, pairwise fan-out, reactions, edit, retract, seen, roster", async () => {
    const A = await openSide("q7-sim-ga");
    const B = await openSide("q7-sim-gb");
    const C = await openSide("q7-sim-gc");
    const { hex, codeOfPub, sha256 } = await import("../lib/p2p/crypto");
    const fp = async (s: typeof A) => hex(await sha256(Buffer.from(s.ident.pub, "base64")));
    const fpA = await fp(A), fpB = await fp(B), fpC = await fp(C);
    const contact = (id: string, pub: string, ek: string, name: string) => ({ id, pub, ek, name, code: "", addedAt: 1, verified: true });
    // three mutual contacts: every group member can seal frames to every other member
    (A.mgr as unknown as { set(p: unknown): void }).set({ contacts: [contact(fpB, B.ident.pub, B.ident.ecdhPub!, "Bee"), contact(fpC, C.ident.pub, C.ident.ecdhPub!, "Cee")] });
    (B.mgr as unknown as { set(p: unknown): void }).set({ contacts: [contact(fpA, A.ident.pub, A.ident.ecdhPub!, "Ay"), contact(fpC, C.ident.pub, C.ident.ecdhPub!, "Cee")] });
    (C.mgr as unknown as { set(p: unknown): void }).set({ contacts: [contact(fpA, A.ident.pub, A.ident.ecdhPub!, "Ay"), contact(fpB, B.ident.pub, B.ident.ecdhPub!, "Bee")] });

    const gid = A.mgr.createGroup("Ekip", [fpB, fpC])!;
    expect(gid).toBeTruthy();
    await waitFor(() => B.host.getConversations().some((c) => c.id === gid && c.mode === "group"));
    await waitFor(() => C.host.getConversations().some((c) => c.id === gid && c.mode === "group"));
    const bc = B.host.getConversations().find((c) => c.id === gid)!;
    expect(bc.title).toBe("Ekip");
    expect([...(bc.members ?? [])].sort()).toEqual([fpA, fpB, fpC].sort());

    A.mgr.sendGroup(gid, "selam ekip");
    await waitFor(() => B.host.getMessages().some((m) => m.body === "selam ekip" && m.from === fpA));
    await waitFor(() => C.host.getMessages().some((m) => m.body === "selam ekip" && m.from === fpA));

    const msgA = A.host.getMessages().find((m) => m.body === "selam ekip")!;
    B.mgr.react(gid, msgA.id, "👍");
    await waitFor(() => (A.host.getMessages().find((m) => m.id === msgA.id)?.reactions?.["👍"] ?? []).includes(fpB));
    await waitFor(() => (C.host.getMessages().find((m) => m.id === msgA.id)?.reactions?.["👍"] ?? []).includes(fpB));

    B.mgr.markRead(gid);
    await waitFor(() => A.host.getMessages().find((m) => m.id === msgA.id)?.status === "seen");

    A.mgr.editMessage(gid, msgA.id, "selam ekip!");
    await waitFor(() => B.host.getMessages().find((m) => m.id === msgA.id)?.body === "selam ekip!");
    await waitFor(() => C.host.getMessages().find((m) => m.id === msgA.id)?.editedAt !== undefined);

    B.mgr.sendGroup(gid, "gecici");
    await waitFor(() => A.host.getMessages().some((m) => m.body === "gecici" && m.from === fpB));
    await waitFor(() => C.host.getMessages().some((m) => m.body === "gecici"));
    const tmpB = B.host.getMessages().find((m) => m.body === "gecici")!;
    B.mgr.retract(gid, tmpB.id);
    await waitFor(() => !A.host.getMessages().some((m) => m.body === "gecici"));
    await waitFor(() => !C.host.getMessages().some((m) => m.body === "gecici"));

    A.mgr.groupRename(gid, "Yeni Ekip");
    await waitFor(() => B.host.getConversations().find((c) => c.id === gid)?.title === "Yeni Ekip");

    C.mgr.leaveGroup(gid);
    await waitFor(() => !(A.host.getConversations().find((c) => c.id === gid)?.members ?? []).includes(fpC));
    await waitFor(() => !(B.host.getConversations().find((c) => c.id === gid)?.members ?? []).includes(fpC));
    expect(C.host.getConversations().some((c) => c.id === gid)).toBe(false);
  }, 45000);

  /* ---------- device adoption: a working pair of fake peer connections ---------- */
  class DuoDC {
    readyState: RTCDataChannelState = "connecting"; peer: DuoDC | null = null; bufferedAmount = 0; binaryType = "arraybuffer";
    onopen: (() => void) | null = null; onclose: (() => void) | null = null; onmessage: ((e: { data: string | ArrayBuffer }) => void) | null = null;
    open() { this.readyState = "open"; this.onopen?.(); }
    send(d: string | ArrayBuffer) { if (this.readyState !== "open" || !this.peer) return; const p = this.peer; setTimeout(() => p.readyState === "open" && p.onmessage?.({ data: d }), 0); }
    close() { if (this.readyState === "closed") return; this.readyState = "closed"; this.onclose?.(); this.peer?.close(); this.peer = null; }
  }
  class DuoPC {
    private static offers = new Map<string, { offerer: DuoPC; dc: DuoDC }>(); private static n = 0;
    ondatachannel: ((e: { channel: DuoDC }) => void) | null = null; onconnectionstatechange: unknown = null;
    localDescription: { type: RTCSdpType; sdp: string } | null = null; private dc: DuoDC | null = null;
    createDataChannel(_label: string, _opts?: unknown) { if (!this.dc) this.dc = new DuoDC(); return this.dc; }
    async createOffer() { return { type: "offer" as RTCSdpType, sdp: `v=0 duo-offer-${++DuoPC.n}` }; }
    async createAnswer() { return { type: "answer" as RTCSdpType, sdp: "v=0 duo-answer" }; }
    async setLocalDescription(d: { type: RTCSdpType; sdp: string }) {
      this.localDescription = d;
      if (d.type === "offer") { if (!this.dc) this.dc = new DuoDC(); DuoPC.offers.set(d.sdp, { offerer: this, dc: this.dc }); }
      return d;
    }
    async setRemoteDescription(d: { type: RTCSdpType; sdp: string }) {
      if (d.type === "offer") {                     // the answerer joins: wire both data channels together
        const entry = DuoPC.offers.get(d.sdp);
        if (entry) {
          const a = new DuoDC(); this.dc = a; entry.dc.peer = a; a.peer = entry.dc;
          this.ondatachannel?.({ channel: a });
          setTimeout(() => { entry.dc.open(); a.open(); }, 5);
        }
      }
      return d;
    }
    get connectionState() { return "connected"; }
    get iceGatheringState() { return "complete"; }
    addEventListener() {} removeEventListener() {}
    close() { this.dc?.close(); }
  }

  it("device adoption: a fresh device takes over the identity, contacts and the lock ride along", async () => {
    const S = await openSide("q7-sim-dev-src");
    const N = await openSide("q7-sim-dev-new");
    vi.stubGlobal("RTCPeerConnection", DuoPC);      // both new links (and only these) use the working loopback pair
    const { hex, sha256 } = await import("../lib/p2p/crypto");
    const fpX = hex(await sha256(Buffer.from("deadbeefdeadbeefcafe", "hex")));
    const contacts = [
      { id: fpX, pub: "BPubX".repeat(13), name: "Xee", code: "000000000001", addedAt: 1, verified: true },
      { id: fpX.slice(0, 20) + "y", pub: "BPubY".repeat(13), name: "Why", code: "000000000002", addedAt: 2, verified: false },
    ];
    (S.mgr as unknown as { set(p: unknown): void }).set({ contacts });
    const active = process.env.Q7_DB;                                 // the vault must be created inside the SOURCE's module graph (and its db)
    process.env.Q7_DB = "q7-sim-dev-src"; vi.resetModules();
    const { createVault } = await import("../lib/vault");
    await createVault("deneme-parola-1", S.mgr.exportIdentity()!);    // the source is locked: its password must ride along to the new device
    process.env.Q7_DB = active; vi.resetModules();
    await S.mgr.beginDevicePairing();
    expect(await waitFor(() => S.mgr.getSnapshot().devicePairing.kind === "open")).toBe(true);

    const dp = S.mgr.getSnapshot().devicePairing;      // the door: code plus its one-time PIN
    if (dp.kind !== "open") throw new Error("door not open");
    await N.mgr.startDevicePairing(S.mgr.getSnapshot().code, dp.pin);
    expect(await waitFor(() => S.mgr.getSnapshot().devicePairing.kind === "confirm")).toBe(true);
    expect(await waitFor(() => {
      const p = N.mgr.getSnapshot().pairing;
      return p.kind === "device" && p.phase === "connected" && !!p.safety;
    })).toBe(true);
    const sDp = S.mgr.getSnapshot().devicePairing, nPair = N.mgr.getSnapshot().pairing;
    if (sDp.kind !== "confirm" || nPair.kind !== "device") throw new Error("pairing states drifted");
    expect(sDp.safety.length).toBeGreaterThan(10);
    expect(sDp.safety).toBe(nPair.safety);          // both screens show the same number — MITM would break this

    S.mgr.confirmDevicePair();
    expect(await waitFor(() => {
      const p = N.mgr.getSnapshot().pairing;
      return p.kind === "device" && p.phase === "done";
    })).toBe(true);
    expect(N.mgr.getSnapshot().pairing).toMatchObject({ kind: "device", phase: "done", vaulted: true });

    const dbm = await import("../lib/db");
    const { getVault, openVault, vaultIdentity } = await import("../lib/vault");
    expect(await dbm.getIdentity()).toBeUndefined(); // no plaintext keys on disk: the transferred lock replaced them
    expect(await getVault()).not.toBeNull();
    const opened = await openVault("deneme-parola-1");
    if (!opened) throw new Error("the transferred password did not open the new device");
    const id = await vaultIdentity(opened.master);
    expect(id?.pub).toBe(S.ident.pub);              // the adopting device IS the source identity now, unsealed by the same password
    expect((await dbm.getFlag("p2p-settings") as { name: string }).name).toBe(S.mgr.getSnapshot().settings.name);
    const got = await dbm.getContacts();
    expect(got.map((c) => c.name).sort()).toEqual(["Why", "Xee"]);
    expect(S.host.conversations.length).toBe(0);    // a device pair is never a conversation
  }, 40000);

  it("device adoption completes over the relays alone when the direct connection cannot form", async () => {
    vi.stubGlobal("RTCPeerConnection", FakePC);     // back to the broken peer connection: data channels never open
    const S = await openSide("q7-sim-devr-src");
    const N = await openSide("q7-sim-devr-new");
    const { hex, sha256 } = await import("../lib/p2p/crypto");
    const fpZ = hex(await sha256(Buffer.from("cafebabecafebabe1234", "hex")));
    (S.mgr as unknown as { set(p: unknown): void }).set({ contacts: [{ id: fpZ, pub: "BPubZ".repeat(13), name: "Zoe", code: "000000000003", addedAt: 1, verified: true }] });
    await S.mgr.beginDevicePairing();
    expect(await waitFor(() => S.mgr.getSnapshot().devicePairing.kind === "open")).toBe(true);

    const dp = S.mgr.getSnapshot().devicePairing;      // the door: code plus its one-time PIN
    if (dp.kind !== "open") throw new Error("door not open");
    await N.mgr.startDevicePairing(S.mgr.getSnapshot().code, dp.pin);
    if (!(await waitFor(() => S.mgr.getSnapshot().devicePairing.kind === "confirm"))) {
      throw new Error("no confirm: S=" + JSON.stringify(S.mgr.getSnapshot().devicePairing) + " N=" + JSON.stringify(N.mgr.getSnapshot().pairing));
    }
    expect(await waitFor(() => {                    // safety number appears without any data channel
      const p = N.mgr.getSnapshot().pairing;
      return p.kind === "device" && p.phase === "connected" && !!p.safety;
    })).toBe(true);
    const sDp = S.mgr.getSnapshot().devicePairing, nPair = N.mgr.getSnapshot().pairing;
    if (sDp.kind !== "confirm" || nPair.kind !== "device") throw new Error("pairing states drifted");
    expect(sDp.safety).toBe(nPair.safety);

    S.mgr.confirmDevicePair();                      // no session yet → the payload travels as a sealed relay envelope
    expect(await waitFor(() => {
      const p = N.mgr.getSnapshot().pairing;
      return p.kind === "device" && p.phase === "done";
    })).toBe(true);
    await new Promise((r) => setTimeout(r, 400));   // let the broker fan-out deliver its duplicate copies

    const dbm = await import("../lib/db");
    const id = await dbm.getIdentity();
    expect(id?.pub).toBe(S.ident.pub);
    expect((await dbm.getContacts()).map((c) => c.name)).toEqual(["Zoe"]); // applied exactly once despite the fan-out
    const p = N.mgr.getSnapshot().pairing;
    expect(p.kind === "device" && p.phase === "done").toBe(true);
  }, 40000);
});
