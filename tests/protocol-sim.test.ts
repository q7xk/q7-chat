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
  async setLocalDescription(d: unknown) { return d; }
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
    removeConversationFor() {}, bumpUnread() {} };
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
});
