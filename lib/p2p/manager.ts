import * as db from "../db";
import type { Attachment, Contact, Conversation, LinkMeta, Message } from "../types";
import { CHUNK, cleanAtt, validAvatar, validVote } from "../attach";
import { LIFETIME_MS } from "../time";
import { isDirectImageUrl, parseHttpsUrl } from "../links";
import {
  checkEnvelope, cleanName, codeFromFp, codeOfPub, createStoredIdentity, finishHandshake, fromB64, hex, loadIdentity, parseCode, randomHex,
  safetyNumber, seal, sha256, signEnvelope, startHandshake, toB64, topicFor, unseal, utf8, type Envelope, type HandshakeState, type Identity, type Session,
} from "./crypto";
import { packEnvelope, unpackEnvelope } from "./pack";
import { PeerLink } from "./rtc";
import { RelayClient } from "./mqtt";

export const DEFAULT_RELAYS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt", "wss://test.mosquitto.org:8081"];
export type LinkState = "offline" | "connecting" | "online";
export interface Request { rid: string; name: string; code: string; safety: string; receivedAt: number; env: Envelope }
export interface P2PSettings { name: string; photo?: string; relayEnabled: boolean; customRelays: string[]; turn?: { urls: string; username?: string; credential?: string } }
export type PairingState =
  | { kind: "idle" } | { kind: "code"; code: string; phase: "waiting" | "failed"; detail?: string }
  | { kind: "manual-offer"; text: string } | { kind: "manual-answer"; text: string }
  | { kind: "connecting" } | { kind: "done"; name: string; convId: string } | { kind: "error"; message: string };
export interface Snapshot {
  ready: boolean; error?: string; code: string; pub: string; fp: string; settings: P2PSettings; contacts: Contact[];
  status: Record<string, LinkState>; requests: Request[]; relay: { enabled: boolean; connected: number; total: number }; pairing: PairingState;
}
export interface Host {
  getConversations(): Conversation[]; getMessages(): Message[]; ensureConversation(contactId: string, title: string): string;
  addMessage(m: Message, blob?: Blob): void; blobReady(): void; updateMessage(id: string, patch: Partial<Message>): void; removeConversationFor(contactId: string): void; bumpUnread(convId: string): void;
}
interface Link {
  pc: PeerLink; expectPub?: string; name?: string; contactId?: string; hs?: HandshakeState; sess?: Session; silent: boolean;
  hsReady: Promise<void>; resolveHs: () => void; tx: Promise<void>; rx: Promise<void>; timer?: ReturnType<typeof setTimeout>;
}
interface Knock { link: Link; targetCode: string; expectPub?: string; done: ReturnType<typeof setTimeout>; iv: ReturnType<typeof setInterval>; topicR: string }
const ID = /^[\w-]{1,64}$/;
const IDLE: PairingState = { kind: "idle" };

export class P2PManager {
  private listeners = new Set<() => void>();
  private snap: Snapshot = { ready: false, code: "", pub: "", fp: "", settings: { name: "", relayEnabled: true, customRelays: [] }, contacts: [], status: {}, requests: [], relay: { enabled: true, connected: 0, total: 0 }, pairing: IDLE };
  private id?: Identity; private relay?: RelayClient; private started = false;
  private links = new Map<string, Link>(); private knocks = new Map<string, Knock>(); private manualOffers = new Map<string, Link>();
  private seen = new Set<string>(); private lastTry = new Map<string, number>(); private declined = new Map<string, number>();
  private incoming = new Map<string, { att: Extract<Attachment, { t: "file" }>; parts: Uint8Array[]; got: number; n: number; cid: string }>(); private pendingBlobs = new Map<string, Blob>();
  private active: string | null = null; private tick?: ReturnType<typeof setInterval>; private vis = () => { if (document.visibilityState === "visible") this.reconnectAll(); };

  constructor(private host: Host) {}
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => this.snap;
  private set(p: Partial<Snapshot>) { this.snap = { ...this.snap, ...p }; this.listeners.forEach((l) => l()); }
  private setPairing(pairing: PairingState) { this.set({ pairing }); }
  private setStatus(id: string, s: LinkState) { this.set({ status: { ...this.snap.status, [id]: s } }); }
  setActive(convId: string | null) { this.active = convId; }

  /* ---------- lifecycle ---------- */
  async init() {
    if (this.started) return; this.started = true;
    if (typeof crypto === "undefined" || !crypto.subtle || typeof RTCPeerConnection === "undefined") {
      this.set({ ready: true, error: "err.secure" }); return;
    }
    try {
      let stored = await db.getIdentity();
      if (!stored) { stored = await createStoredIdentity(); await db.putIdentity(stored); }
      this.id = await loadIdentity(stored);
      const saved = ((await db.getFlag("p2p-settings")) ?? {}) as Partial<P2PSettings>;
      const settings: P2PSettings = { name: saved.name || `Q7 ${this.id.code.slice(-4)}`, relayEnabled: saved.relayEnabled !== false, customRelays: saved.customRelays ?? [], turn: saved.turn, photo: saved.photo };
      this.set({ ready: true, code: this.id.code, pub: this.id.pubB64, fp: hex(this.id.fp), settings, contacts: await db.getContacts() });
      await this.startRelay();
      this.tick = setInterval(() => this.reconnectAll(), 45_000);
      document.addEventListener("visibilitychange", this.vis);
      setTimeout(() => this.reconnectAll(), 3000);
    } catch { this.set({ ready: true, error: "err.generic" }); }
  }
  shutdown() {
    this.links.forEach((l) => l.pc.close()); this.manualOffers.forEach((l) => l.pc.close()); [...this.knocks.keys()].forEach((r) => { this.knocks.get(r)?.link.pc.close(); this.finishKnock(r); });
    this.links.clear(); this.manualOffers.clear(); this.relay?.stop(); this.relay = undefined; clearInterval(this.tick); document.removeEventListener("visibilitychange", this.vis);
    this.started = false; this.id = undefined;
    this.snap = { ...this.snap, ready: false, contacts: [], status: {}, requests: [], pairing: IDLE, code: "", pub: "" }; this.listeners.forEach((l) => l());
  }
  async wipe(storeWipe: () => Promise<void>) { this.shutdown(); await storeWipe(); await this.init(); }

  private async startRelay() {
    this.relay?.stop(); this.relay = undefined;
    const { relayEnabled, customRelays } = this.snap.settings;
    if (!relayEnabled || !this.id) { this.set({ relay: { enabled: false, connected: 0, total: 0 } }); return; }
    const urls = [...new Set([...DEFAULT_RELAYS, ...customRelays])];
    const r = new RelayClient(urls, () => this.set({ relay: { enabled: true, connected: r.connected, total: urls.length } }));
    this.relay = r; this.set({ relay: { enabled: true, connected: 0, total: urls.length } });
    r.subscribe(await topicFor("k", this.id.code), (p) => void this.onKnock(p)); r.start();
  }
  private async saveSettings(patch: Partial<P2PSettings>) {
    const settings = { ...this.snap.settings, ...patch }; this.set({ settings }); await db.setFlag("p2p-settings", settings);
  }
  async setName(name: string) { await this.saveSettings({ name: cleanName(name) }); this.broadcastProfile(); }
  async setPhoto(photo?: string) { await this.saveSettings({ photo }); this.broadcastProfile(); }
  private sendProfile(link: Link) { if (!link.sess) return; link.tx = link.tx.then(async () => link.pc.send(await link.sess!.encrypt({ k: "profile", name: this.snap.settings.name, photo: this.snap.settings.photo }))).catch(() => link.pc.close()); }
  private broadcastProfile() { this.links.forEach((l) => this.sendProfile(l)); }
  async setRelayEnabled(v: boolean) { await this.saveSettings({ relayEnabled: v }); await this.startRelay(); }
  async setCustomRelays(urls: string[]) { await this.saveSettings({ customRelays: urls.filter((u) => /^wss:\/\/[^\s]+$/.test(u)).slice(0, 5) }); await this.startRelay(); }
  setTurn(turn?: P2PSettings["turn"]) { return this.saveSettings({ turn: turn?.urls ? turn : undefined }); }

  /* ---------- links ---------- */
  private newLink(silent: boolean): Link {
    const pc = new PeerLink({ turn: this.snap.settings.turn });
    let resolveHs = () => {}; const hsReady = new Promise<void>((r) => { resolveHs = r; });
    const link: Link = { pc, silent, hsReady, resolveHs, tx: Promise.resolve(), rx: Promise.resolve() };
    pc.onOpen = () => void this.onOpen(link);
    pc.onData = (d) => { link.rx = link.rx.then(() => this.onData(link, d)).catch(() => link.pc.close()); };
    pc.onClose = () => this.onClose(link);
    link.timer = setTimeout(() => { if (!link.sess) link.pc.close(); }, 90_000);
    return link;
  }
  private async onOpen(link: Link) {
    try { link.hs = await startHandshake(this.id!); link.resolveHs(); link.pc.send(JSON.stringify(link.hs.hello)); } catch { link.pc.close(); }
  }
  private onClose(link: Link) {
    clearTimeout(link.timer);
    for (const [rid, k] of this.knocks) if (k.link === link && !link.sess) { this.finishKnock(rid); if (!link.silent && this.snap.pairing.kind !== "done") this.setPairing({ kind: "error", message: "err.link" }); }
    for (const [rid, l] of this.manualOffers) if (l === link) this.manualOffers.delete(rid);
    const cid = link.contactId ?? (link.expectPub ? hex(new Uint8Array(0)) : undefined);
    if (link.contactId && this.links.get(link.contactId) === link) { this.links.delete(link.contactId); this.setStatus(link.contactId, "offline"); }
    else if (!link.sess && link.expectPub) void sha256(fromB64(link.expectPub)).then((fp) => { if (!this.links.has(hex(fp))) this.setStatus(hex(fp), "offline"); });
    void cid;
  }
  private async onData(link: Link, d: string | ArrayBuffer) {
    if (typeof d === "string") {
      if (link.sess) return;
      await link.hsReady;
      let obj: unknown; try { obj = JSON.parse(d); } catch { link.pc.close(); return; }
      const sess = await finishHandshake(link.hs!, obj);
      if (!sess || toB64(sess.peerPub) !== link.expectPub) { link.pc.close(); return; } // identity must match the signed invitation
      link.sess = sess; await this.onReady(link, sess); return;
    }
    if (!link.sess || !link.contactId) { link.pc.close(); return; }
    await this.onFrame(link, await link.sess.decrypt(d));
  }
  private async onReady(link: Link, sess: Session) {
    clearTimeout(link.timer);
    const fp = await sha256(sess.peerPub), cid = hex(fp);
    let contact = this.snap.contacts.find((c) => c.id === cid);
    if (!contact) {
      contact = { id: cid, pub: toB64(sess.peerPub), name: cleanName(link.name ?? "Contact"), code: codeFromFp(fp), addedAt: Date.now(), verified: false };
      await db.putContact(contact); this.set({ contacts: [...this.snap.contacts, contact] });
    }
    const convId = this.host.ensureConversation(cid, contact.name);
    const old = this.links.get(cid); link.contactId = cid; this.links.set(cid, link); if (old && old !== link) old.pc.close();
    this.setStatus(cid, "online");
    if (this.snap.pairing.kind !== "idle") this.setPairing({ kind: "done", name: contact.name, convId });
    this.flush(cid); this.sendProfile(link);
  }

  /* ---------- relay pairing (by code) ---------- */
  private finishKnock(rid: string) { const k = this.knocks.get(rid); if (!k) return; clearInterval(k.iv); clearTimeout(k.done); this.relay?.unsubscribe(k.topicR); this.knocks.delete(rid); }

  private async startKnock(code: string, silent: boolean, expectPub?: string) {
    if (!this.id || !this.relay) throw new Error("err.relayOff");
    if (this.relay.connected === 0) throw new Error("err.relayDown");
    const relay = this.relay, rid = randomHex(16), link = this.newLink(silent);
    const sdp = await link.pc.makeOffer();
    const env = await signEnvelope(this.id, { t: "offer", rid, to: code, name: this.snap.settings.name, sdp, ts: Date.now() });
    const topicK = await topicFor("k", code), topicR = await topicFor("r", rid), payload = await seal(code, env);
    relay.subscribe(topicR, (p) => void this.onAnswer(rid, p));
    relay.publish(topicK, payload);
    let tries = 0; const iv = setInterval(() => { if (++tries >= 5 || link.sess) clearInterval(iv); else relay.publish(topicK, payload); }, 10_000);
    const done = setTimeout(() => {
      if (!this.knocks.has(rid)) return; this.finishKnock(rid); link.pc.close();
      if (!silent) this.setPairing({ kind: "code", code, phase: "failed", detail: "err.noReply" });
    }, 55_000);
    this.knocks.set(rid, { link, targetCode: code, expectPub, done, iv, topicR });
  }
  private async onAnswer(rid: string, payload: Uint8Array) {
    const k = this.knocks.get(rid); if (!k) return;
    const env = await checkEnvelope(await unseal(rid, payload), Date.now());
    if (!env || env.t !== "answer" || env.rid !== rid || (await codeOfPub(env.pub)) !== k.targetCode || (k.expectPub && env.pub !== k.expectPub)) return;
    this.finishKnock(rid); k.link.expectPub = env.pub; k.link.name = env.name;
    if (!k.link.silent) this.setPairing({ kind: "connecting" });
    try { await k.link.pc.acceptAnswer(env.sdp); } catch { k.link.pc.close(); }
  }
  private async onKnock(payload: Uint8Array) {
    if (!this.id) return;
    const env = await checkEnvelope(await unseal(this.id.code, payload), Date.now());
    if (!env || env.t !== "offer" || env.to !== this.id.code || env.pub === this.id.pubB64 || this.seen.has(env.rid)) return;
    this.seen.add(env.rid); if (this.seen.size > 500) this.seen.clear();
    const fp = hex(await sha256(fromB64(env.pub)));
    if (this.snap.contacts.some((c) => c.id === fp)) { void this.acceptOffer(env, true).catch(() => {}); return; } // known contacts reconnect automatically
    const until = this.declined.get(fp); if (until && until > Date.now()) return;
    if (this.snap.requests.length >= 10 || this.snap.requests.some((r) => r.env.pub === env.pub)) return;
    const req: Request = { rid: env.rid, name: env.name, code: await codeOfPub(env.pub), safety: await safetyNumber(this.id.pub, fromB64(env.pub)), receivedAt: Date.now(), env };
    this.set({ requests: [...this.snap.requests, req] });
  }
  private async acceptOffer(env: Envelope, silent: boolean) {
    if (!this.id) return;
    const link = this.newLink(silent); link.expectPub = env.pub; link.name = env.name;
    const sdp = await link.pc.acceptOffer(env.sdp);
    const reply = await signEnvelope(this.id, { t: "answer", rid: env.rid, name: this.snap.settings.name, sdp, ts: Date.now() });
    if (env.to) this.relay?.publish(await topicFor("r", env.rid), await seal(env.rid, reply));
    else if (!silent) this.setPairing({ kind: "manual-answer", text: await packEnvelope(reply) });
    this.setStatus(hex(await sha256(fromB64(env.pub))), "connecting");
  }
  async acceptRequest(rid: string) {
    const r = this.snap.requests.find((x) => x.rid === rid); if (!r) return;
    this.set({ requests: this.snap.requests.filter((x) => x.rid !== rid) });
    try { await this.acceptOffer(r.env, false); this.setPairing({ kind: "connecting" }); } catch { this.setPairing({ kind: "error", message: "err.generic" }); }
  }
  declineRequest(rid: string) {
    const r = this.snap.requests.find((x) => x.rid === rid); if (!r) return;
    void sha256(fromB64(r.env.pub)).then((fp) => this.declined.set(hex(fp), Date.now() + 600_000));
    this.set({ requests: this.snap.requests.filter((x) => x.rid !== rid) });
  }
  async connectByCode(input: string) {
    const code = parseCode(input);
    if (!code) return this.setPairing({ kind: "code", code: input, phase: "failed", detail: "err.short" });
    if (code === this.id?.code) return this.setPairing({ kind: "code", code, phase: "failed", detail: "err.own" });
    this.setPairing({ kind: "code", code, phase: "waiting" });
    try { await this.startKnock(code, false); } catch (e) { this.setPairing({ kind: "code", code, phase: "failed", detail: e instanceof Error ? e.message : "err.generic" }); }
  }

  myContactQr() { return this.id ? "Q7C:" + toB64(utf8(JSON.stringify({ pub: this.id.pubB64, name: this.snap.settings.name }))) : ""; }
  async connectByContactQr(text: string) {
    if (!text.startsWith("Q7C:")) return false;
    try { const o = JSON.parse(new TextDecoder().decode(fromB64(text.slice(4)))); return typeof o.pub === "string" ? await this.connectToPub(o.pub) : false; } catch { return false; }
  }
  /** Connects to a known public key (from a shared contact or contact QR). The answer must come from that exact key. */
  async connectToPub(pub: string) {
    let code: string; try { if (fromB64(pub).length !== 65) return false; code = await codeOfPub(pub); } catch { return false; }
    if (code === this.id?.code) return false;
    if (this.snap.contacts.some((c) => c.pub === pub)) return true;
    this.setPairing({ kind: "code", code, phase: "waiting" });
    try { await this.startKnock(code, false, pub); } catch (e) { this.setPairing({ kind: "code", code, phase: "failed", detail: e instanceof Error ? e.message : "err.generic" }); }
    return true;
  }

  /* ---------- manual pairing (QR, invite file, copy/paste) ---------- */
  async createManualOffer() {
    if (!this.id) return;
    try {
      const rid = randomHex(16), link = this.newLink(false);
      const env = await signEnvelope(this.id, { t: "offer", rid, name: this.snap.settings.name, sdp: await link.pc.makeOffer(), ts: Date.now() });
      this.manualOffers.set(rid, link); this.setPairing({ kind: "manual-offer", text: await packEnvelope(env) });
    } catch { this.setPairing({ kind: "error", message: "err.generic" }); }
  }
  async acceptManual(text: string) {
    try {
      const env = await checkEnvelope(await unpackEnvelope(text), Date.now(), 30 * 60_000);
      if (!env) throw new Error("err.invalid");
      if (env.pub === this.id?.pubB64) throw new Error("err.invalid");
      if (env.t === "offer") { await this.acceptOffer(env, false); return; }
      const link = this.manualOffers.get(env.rid); if (!link) throw new Error("err.invalid");
      this.manualOffers.delete(env.rid); link.expectPub = env.pub; link.name = env.name; this.setPairing({ kind: "connecting" });
      await link.pc.acceptAnswer(env.sdp);
    } catch (e) { this.setPairing({ kind: "error", message: e instanceof Error ? e.message : "err.generic" }); }
  }
  clearPairing() { this.setPairing(IDLE); }

  /* ---------- contacts ---------- */
  private async patchContact(id: string, patch: Partial<Contact>) {
    const c = this.snap.contacts.find((x) => x.id === id); if (!c) return; const n = { ...c, ...patch };
    await db.putContact(n); this.set({ contacts: this.snap.contacts.map((x) => (x.id === id ? n : x)) });
  }
  renameContact(id: string, name: string) { return this.patchContact(id, { name: cleanName(name), renamed: true }); }
  setVerified(id: string, verified: boolean) { return this.patchContact(id, { verified }); }
  async removeContact(id: string) {
    this.links.get(id)?.pc.close(); this.links.delete(id); await db.deleteContact(id); this.host.removeConversationFor(id);
    const { [id]: _gone, ...status } = this.snap.status; void _gone; this.set({ contacts: this.snap.contacts.filter((c) => c.id !== id), status });
  }
  connectNow(id: string) { this.ensureConnected(id, true); }
  private ensureConnected(id: string, force = false) {
    const c = this.snap.contacts.find((x) => x.id === id); if (!c || !this.relay || this.relay.connected === 0) return;
    if (this.snap.status[id] === "online" || this.snap.status[id] === "connecting") return;
    if (!force && Date.now() - (this.lastTry.get(id) ?? 0) < 20_000) return;
    this.lastTry.set(id, Date.now()); this.setStatus(id, "connecting");
    this.startKnock(c.code, true).catch(() => this.setStatus(id, "offline"));
    setTimeout(() => { if (this.snap.status[id] === "connecting" && !this.links.has(id)) this.setStatus(id, "offline"); }, 58_000);
  }
  private reconnectAll() { if (document.visibilityState === "visible") this.snap.contacts.forEach((c) => this.ensureConnected(c.id)); }

  /* ---------- messages ---------- */
  sendText(contactId: string, body: string, link?: LinkMeta, replyToId?: string) { this.sendRich(contactId, body, undefined, undefined, replyToId, link); }
  sendRich(contactId: string, body: string, att?: Attachment, blob?: Blob, replyToId?: string, link?: LinkMeta) {
    const contact = this.snap.contacts.find((c) => c.id === contactId); if (!contact) return;
    const convId = this.host.ensureConversation(contactId, contact.name), createdAt = Date.now();
    const m: Message = { id: randomHex(16), conversationId: convId, body, createdAt, expiresAt: createdAt + LIFETIME_MS, link, replyToId, att, direction: "out", status: "queued" };
    if (blob) this.pendingBlobs.set(m.id, blob);
    this.host.addMessage(m, blob); this.transmit(contactId, m); this.ensureConnected(contactId, true);
  }
  vote(contactId: string, msgId: string, choices: number[]) {
    const conv = this.host.getConversations().find((c) => c.contactId === contactId);
    const m = this.host.getMessages().find((x) => x.id === msgId && x.conversationId === conv?.id);
    if (!m || m.att?.t !== "poll" || !validVote(choices, m.att.opts.length, m.att.multi)) return;
    this.host.updateMessage(m.id, { att: { ...m.att, votes: { ...m.att.votes, [this.snap.fp]: choices } } });
    this.sendFrame(contactId, { k: "vote", id: m.id, c: choices });
  }
  private sendFrame(contactId: string, f: unknown) {
    const link = this.links.get(contactId); if (!link?.sess) return;
    link.tx = link.tx.then(async () => link.pc.send(await link.sess!.encrypt(f))).catch(() => link.pc.close());
  }
  private transmit(contactId: string, m: Message) {
    const link = this.links.get(contactId); if (!link?.sess) return;
    link.tx = link.tx.then(async () => {
      const s = link.sess!;
      link.pc.send(await s.encrypt({ k: "msg", id: m.id, ts: m.createdAt, body: m.body, link: m.link, replyTo: m.replyToId, att: m.att }));
      if (m.att?.t === "file") {
        const blob = this.pendingBlobs.get(m.id) ?? (await db.getBlob(m.id))?.blob;
        if (blob) {
          const buf = new Uint8Array(await blob.arrayBuffer()), n = Math.ceil(buf.length / CHUNK);
          for (let i = 0; i < n; i++) { await link.pc.drain(); link.pc.send(await s.encrypt({ k: "chunk", id: m.id, i, n, d: toB64(buf.slice(i * CHUNK, (i + 1) * CHUNK)) })); }
        }
      }
      if (m.status === "queued") this.host.updateMessage(m.id, { status: "sent" });
    }).catch(() => link.pc.close());
  }
  private flush(contactId: string) {
    const conv = this.host.getConversations().find((c) => c.contactId === contactId); if (!conv) return;
    const now = Date.now(), mine = this.host.getMessages().filter((m) => m.conversationId === conv.id && m.expiresAt > now);
    mine.filter((m) => m.direction === "out" && m.status !== "delivered").forEach((m) => this.transmit(contactId, m));
    mine.forEach((m) => { const v = m.att?.t === "poll" ? m.att.votes[this.snap.fp] : undefined; if (v) this.sendFrame(contactId, { k: "vote", id: m.id, c: v }); });
  }
  private async onFrame(link: Link, f: unknown) {
    if (!f || typeof f !== "object") return; const o = f as Record<string, unknown>; const cid = link.contactId!;
    const conv = this.host.getConversations().find((c) => c.contactId === cid); if (!conv) return;
    const ack = (id: string) => this.sendFrame(cid, { k: "ack", id });
    if (o.k === "ack" && typeof o.id === "string") {
      const m = this.host.getMessages().find((x) => x.id === o.id && x.conversationId === conv.id && x.direction === "out");
      if (m) { this.host.updateMessage(m.id, { status: "delivered" }); this.pendingBlobs.delete(m.id); } return;
    }
    if (o.k === "profile") {
      const c = this.snap.contacts.find((x) => x.id === cid); if (!c) return;
      await this.patchContact(cid, { photo: validAvatar(o.photo) ? o.photo : undefined, ...(typeof o.name === "string" && !c.renamed ? { name: cleanName(o.name) } : {}) }); return;
    }
    if (o.k === "vote" && typeof o.id === "string") {
      const m = this.host.getMessages().find((x) => x.id === o.id && x.conversationId === conv.id);
      if (m?.att?.t !== "poll" || !validVote(o.c, m.att.opts.length, m.att.multi)) return;
      this.host.updateMessage(m.id, { att: { ...m.att, votes: { ...m.att.votes, [cid]: o.c } } }); return;
    }
    if (o.k === "chunk" && typeof o.id === "string") {
      const inc = this.incoming.get(o.id); if (!inc || inc.cid !== cid) return;
      const bad = typeof o.i !== "number" || o.i !== inc.parts.length || o.n !== inc.n || typeof o.d !== "string" || o.d.length > CHUNK * 2;
      const bytes = bad ? null : fromB64(o.d as string);
      if (!bytes || bytes.length > CHUNK || inc.got + bytes.length > inc.att.size) { this.incoming.delete(o.id); return; }
      inc.parts.push(bytes); inc.got += bytes.length;
      if (inc.parts.length === inc.n) {
        this.incoming.delete(o.id); if (inc.got !== inc.att.size) return;
        const msg = this.host.getMessages().find((x) => x.id === o.id);
        await db.putBlob({ id: o.id, blob: new Blob(inc.parts as BlobPart[], { type: inc.att.mime }), expiresAt: msg?.expiresAt ?? Date.now() + LIFETIME_MS });
        this.host.blobReady(); ack(o.id);
      }
      return;
    }
    if (o.k !== "msg" || typeof o.id !== "string" || !ID.test(o.id) || typeof o.body !== "string" || o.body.length > 4000 || typeof o.ts !== "number" || !Number.isFinite(o.ts)) return;
    let meta: LinkMeta | undefined;
    if (o.link && typeof o.link === "object") {
      const l = o.link as Record<string, unknown>; const u = typeof l.url === "string" ? parseHttpsUrl(l.url) : null;
      if (!u) return;
      meta = { url: u.href, isImage: isDirectImageUrl(u), title: typeof l.title === "string" ? l.title.slice(0, 80) : undefined, description: typeof l.description === "string" ? l.description.slice(0, 200) : undefined };
    }
    const att = o.att === undefined ? undefined : await cleanAtt(o.att);
    if ((o.att !== undefined && !att) || (!o.body && !meta && !att)) return;
    const now = Date.now(), createdAt = Math.min(o.ts, now), expiresAt = createdAt + LIFETIME_MS; // never trust the sender's clock beyond "now"
    if (expiresAt <= now) { ack(o.id); return; }
    const exists = this.host.getMessages().some((x) => x.id === o.id);
    if (!exists) {
      this.host.addMessage({ id: o.id, conversationId: conv.id, body: o.body, createdAt, expiresAt, link: meta, att: att ?? undefined, replyToId: typeof o.replyTo === "string" && ID.test(o.replyTo) ? o.replyTo : undefined, direction: "in" });
      if (this.active !== conv.id) this.host.bumpUnread(conv.id);
    }
    if (att?.t === "file") {
      if (!exists || !(await db.getBlob(o.id))) this.incoming.set(o.id, { att, parts: [], got: 0, n: Math.ceil(att.size / CHUNK), cid });
      else ack(o.id);
    } else ack(o.id);
  }
}
