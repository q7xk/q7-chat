import * as db from "../db";
import type { Attachment, Contact, Conversation, LinkMeta, Message } from "../types";
import { CHUNK, cleanAtt, validAvatar, validVote } from "../attach";
import { LIFETIME_MS } from "../time";
import { isDirectImageUrl, parseHttpsUrl } from "../links";
import {
  checkEnvelope, cleanName, codeFromFp, codeOfPub, createStoredIdentity, finishHandshake, fromB64, hex, loadIdentity, parseCode, randomHex,
  safetyNumber, seal, sha256, signEnvelope, startHandshake, toB64, topicFor, unseal, utf8, verify, withStaticEcdh, type Envelope, type HandshakeState, type Identity, type Session,
} from "./crypto";
import { packEnvelope, unpackEnvelope } from "./pack";
import { PeerLink, STUN } from "./rtc";
import { RelayClient } from "./mqtt";
import { pushCallEntry } from "../calllog";
import { ackRoot, liveTopic, mailRoot, makeRFrame, openFrom, openRFrame, pairKey, SeqWindow, sealTo, unHex } from "./q7rp";

export const DEFAULT_RELAYS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt", "wss://test.mosquitto.org:8081"];
/** Largest frame that may detour through the relays; bigger payloads wait for the direct link. */
export const INLINE_MAX = 160 * 1024;
export type LinkState = "offline" | "connecting" | "online";
export type P2PMode = "direct" | "relay";
export interface Request { rid: string; name: string; code: string; safety: string; receivedAt: number; env: Envelope }
export interface P2PSettings { name: string; photo?: string; relayEnabled: boolean; customRelays: string[]; turn?: { urls: string; username?: string; credential?: string }; giphy?: string; onlyContacts?: boolean }
export type PairingState =
  | { kind: "idle" } | { kind: "code"; code: string; phase: "waiting" | "failed"; detail?: string }
  | { kind: "manual-offer"; text: string } | { kind: "manual-answer"; text: string }
  | { kind: "connecting" } | { kind: "done"; name: string; convId: string } | { kind: "error"; message: string };
export interface CallState { id: string; cid: string; dir: "in" | "out"; video: boolean; state: "ringing" | "connecting" | "active"; local?: MediaStream; remote?: MediaStream; startedAt?: number }
export interface Snapshot {
  ready: boolean; error?: string; code: string; pub: string; fp: string; settings: P2PSettings; contacts: Contact[];
  status: Record<string, LinkState>; modes: Record<string, P2PMode>; requests: Request[]; relay: { enabled: boolean; connected: number; total: number }; pairing: PairingState; call: CallState | null;
}
export interface Host {
  getConversations(): Conversation[]; getMessages(): Message[]; ensureConversation(contactId: string, title: string): string;
  addMessage(m: Message, blob?: Blob): void; blobReady(): void; updateMessage(id: string, patch: Partial<Message>): void; removeConversationFor(contactId: string): void; bumpUnread(convId: string): void;
  createGroup(opts: { id?: string; title: string; members: string[]; hue?: number; names?: Record<string, string> }): string;
  updateGroup(gid: string, patch: Partial<Conversation>): void; removeGroup(gid: string): void;
  reactMessage(id: string, emoji: string, who: string, on: boolean): void; removeMessage(id: string): void;
}
interface Link {
  pc: PeerLink; expectPub?: string; name?: string; ek?: string; contactId?: string; hs?: HandshakeState; sess?: Session; silent: boolean; last: number;
  hsReady: Promise<void>; resolveHs: () => void; tx: Promise<void>; rx: Promise<void>; timer?: ReturnType<typeof setTimeout>;
}
interface OutboxEntry { cid: string; kind: string; obj: unknown; file?: { att: Extract<Attachment, { t: "file" }> }; added: number; next: number; tries: number }
interface Knock { link: Link; targetCode: string; expectPub?: string; done: ReturnType<typeof setTimeout>; iv: ReturnType<typeof setInterval>; topicR: string }
const ID = /^[\w-]{1,64}$/;
const IDLE: PairingState = { kind: "idle" };

export class P2PManager {
  private listeners = new Set<() => void>();
  private snap: Snapshot = { ready: false, code: "", pub: "", fp: "", settings: { name: "", relayEnabled: true, customRelays: [] }, contacts: [], status: {}, modes: {}, requests: [], relay: { enabled: true, connected: 0, total: 0 }, pairing: IDLE, call: null };
  private id?: Identity; private relay?: RelayClient; private started = false;
  private links = new Map<string, Link>(); private knocks = new Map<string, Knock>(); private manualOffers = new Map<string, Link>();
  private seen = new Set<string>(); private lastTry = new Map<string, number>(); private declined = new Map<string, number>();
  private lastSeen = new Map<string, number>();                   // last live inbound frame per contact: presence follows proof, not attempts
  private lastPing = new Map<string, number>();                   // last heartbeat send per contact
  private hbTimer?: ReturnType<typeof setInterval>;
  private incoming = new Map<string, { att: Extract<Attachment, { t: "file" }>; parts: Uint8Array[]; got: number; n: number; cid: string }>(); private pendingBlobs = new Map<string, Blob>();
  private pairs = new Map<string, Promise<CryptoKey | null>>();   // pairwise ECDH AES key per contact
  private rxWin = new Map<string, SeqWindow>();                   // replay window per contact for relay frames
  private lastSeq = new Map<string, number>();                    // our tx sequence per contact
  private outbox = new Map<string, OutboxEntry>();                // the "tox relay" queue: everything that must survive the wait
  private orphans = new Map<string, Uint8Array>();                // inline file bytes that arrived before their header
  private outRunning = false; private outTickTimer?: ReturnType<typeof setInterval>;
  private seenSent = new Map<string, number>();                   // last "seen" watermark we sent per conversation
  private active: string | null = null; private tick?: ReturnType<typeof setInterval>; private vis = () => { if (document.visibilityState === "visible") this.reconnectAll(); };
  /* live call: internal wiring (pc, buffered ICE, saved offer) never leaks into the snapshot */
  private live?: CallState & { pc: RTCPeerConnection; offerSdp?: string; pendingIce: RTCIceCandidateInit[] };
  private ring?: ReturnType<typeof setTimeout>;

  constructor(private host: Host) {}
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => this.snap;
  private set(p: Partial<Snapshot>) { this.snap = { ...this.snap, ...p }; this.listeners.forEach((l) => l()); }
  private setPairing(pairing: PairingState) { this.set({ pairing }); }
  private setStatus(id: string, s: LinkState) { this.set({ status: { ...this.snap.status, [id]: s } }); }
  private setMode(id: string, m: P2PMode) { if (this.snap.modes[id] !== m) this.set({ modes: { ...this.snap.modes, [id]: m } }); }
  private dropMode(id: string) { if (this.snap.modes[id]) { const { [id]: _out, ...modes } = this.snap.modes; void _out; this.set({ modes }); } }
  /** Any live inbound frame (direct channel or relay push) is proof of life: presence follows proof, never an attempt. */
  private noteSeen(cid: string) {
    this.lastSeen.set(cid, Date.now());
    if (this.snap.status[cid] !== "online") this.setStatus(cid, "online");
  }
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
      if (!stored.ecdhJwk) { stored = await withStaticEcdh(stored); await db.putIdentity(stored); } // v1 identities upgrade in place
      this.id = await loadIdentity(stored);
      const saved = ((await db.getFlag("p2p-settings")) ?? {}) as Partial<P2PSettings>;
      const settings: P2PSettings = { name: saved.name || `Q7 ${this.id.code.slice(-4)}`, relayEnabled: saved.relayEnabled !== false, customRelays: saved.customRelays ?? [], turn: saved.turn, photo: saved.photo, giphy: saved.giphy, onlyContacts: saved.onlyContacts === true };
      this.set({ ready: true, code: this.id.code, pub: this.id.pubB64, fp: hex(this.id.fp), settings, contacts: await db.getContacts() });
      await this.startRelay();
      this.tick = setInterval(() => this.reconnectAll(), 45_000);
      this.hbTimer = setInterval(() => this.hbTick(), 10_000); // heartbeats are checked every 10 s, sent every 30 s per contact
      document.addEventListener("visibilitychange", this.vis);
      setTimeout(() => { this.reconnectAll(); this.relayBroadcastProfile(); this.hbTick(); }, 3000);
    } catch { this.set({ ready: true, error: "err.generic" }); }
  }
  shutdown() {
    this.links.forEach((l) => l.pc.close()); this.manualOffers.forEach((l) => l.pc.close()); [...this.knocks.keys()].forEach((r) => { this.knocks.get(r)?.link.pc.close(); this.finishKnock(r); });
    this.links.clear(); this.manualOffers.clear(); this.relay?.stop(); this.relay = undefined; clearInterval(this.tick); clearInterval(this.outTickTimer); clearInterval(this.hbTimer);
    this.lastSeen.clear(); this.lastPing.clear();
    this.endLive("silent", false);
    document.removeEventListener("visibilitychange", this.vis);
    this.started = false; this.id = undefined;
    this.snap = { ...this.snap, ready: false, contacts: [], status: {}, modes: {}, requests: [], pairing: IDLE, code: "", pub: "" }; this.listeners.forEach((l) => l());
  }
  async wipe(storeWipe: () => Promise<void>) { this.shutdown(); await storeWipe(); await this.init(); }

  private async startRelay() {
    this.relay?.stop(); this.relay = undefined; clearInterval(this.outTickTimer);
    const { relayEnabled, customRelays } = this.snap.settings;
    if (!relayEnabled || !this.id) { this.set({ relay: { enabled: false, connected: 0, total: 0 } }); return; }
    const urls = [...new Set([...DEFAULT_RELAYS, ...customRelays])];
    const r = new RelayClient(urls, () => this.set({ relay: { enabled: true, connected: r.connected, total: urls.length } }));
    this.relay = r; this.set({ relay: { enabled: true, connected: 0, total: urls.length } });
    const my = hex(this.id.fp);
    r.subscribe(await topicFor("k", this.id.code), (p) => void this.onKnock(p));
    r.subscribe(liveTopic(my), (p, topic) => void this.onRelayFrame(topic, p));        // live push: pings, pongs and chat frames for peers that are online right now
    r.subscribe(`${mailRoot(my)}/#`, (p, topic) => void this.onRelayFrame(topic, p));  // retained mailbox copies (offline delivery)
    r.subscribe(`${ackRoot(my)}/#`, (p) => void this.onRelayAck(p));                   // signed receipts for frames we sent by relay
    r.start();
    this.outTickTimer = setInterval(() => void this.outTick(), 4_000);
    void this.outTick();
    setTimeout(() => this.relayBroadcastProfile(), 1500); // freshly (re)connected contacts learn our name/photo without a direct link
  }
  private async saveSettings(patch: Partial<P2PSettings>) {
    const settings = { ...this.snap.settings, ...patch }; this.set({ settings }); await db.setFlag("p2p-settings", settings);
  }
  async setName(name: string) { await this.saveSettings({ name: cleanName(name) }); this.broadcastProfile(); this.relayBroadcastProfile(); }
  async setPhoto(photo?: string) { await this.saveSettings({ photo }); this.broadcastProfile(); this.relayBroadcastProfile(); }
  async setGiphyKey(key: string) { await this.saveSettings({ giphy: key.trim() || undefined }); }
  /** Pushes our profile to every reachable contact over the relays. */
  private relayBroadcastProfile() {
    if (!this.relay?.connected) return;
    for (const c of this.snap.contacts) if (c.ek && !c.blocked) void this.relayPublish(c.id, { k: "profile", name: this.snap.settings.name, photo: this.snap.settings.photo });
  }
  private sendProfile(link: Link) { if (!link.sess) return; link.tx = link.tx.then(async () => link.pc.send(await link.sess!.encrypt({ k: "profile", name: this.snap.settings.name, photo: this.snap.settings.photo }))).catch(() => link.pc.close()); }
  private broadcastProfile() { this.links.forEach((l) => this.sendProfile(l)); }
  async setRelayEnabled(v: boolean) { await this.saveSettings({ relayEnabled: v }); await this.startRelay(); }
  async setCustomRelays(urls: string[]) { await this.saveSettings({ customRelays: urls.filter((u) => /^wss:\/\/[^\s]+$/.test(u)).slice(0, 5) }); await this.startRelay(); }
  setTurn(turn?: P2PSettings["turn"]) { return this.saveSettings({ turn: turn?.urls ? turn : undefined }); }
  setOnlyContacts(v: boolean) { return this.saveSettings({ onlyContacts: v }); }

  /* ---------- links (direct WebRTC transport) ---------- */
  private newLink(silent: boolean): Link {
    const pc = new PeerLink({ turn: this.snap.settings.turn });
    let resolveHs = () => {}; const hsReady = new Promise<void>((r) => { resolveHs = r; });
    const link: Link = { pc, silent, hsReady, resolveHs, tx: Promise.resolve(), rx: Promise.resolve(), last: 0 };
    pc.onOpen = () => void this.onOpen(link);
    pc.onData = (d) => { link.last = Date.now(); if (link.contactId) this.noteSeen(link.contactId); void (link.rx = link.rx.then(() => this.onData(link, d)).catch(() => link.pc.close())); };
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
    if (link.contactId && this.links.get(link.contactId) === link) {
      this.links.delete(link.contactId); this.setStatus(link.contactId, "offline"); this.dropMode(link.contactId);
      if (this.live?.cid === link.contactId) this.endLive("failed"); // a call cannot survive its transport
      setTimeout(() => { if (!this.links.has(link.contactId!)) this.ensureConnected(link.contactId!, false); }, 5_000);
    }
    else if (!link.sess && link.expectPub) void sha256(fromB64(link.expectPub)).then((fp) => { if (this.snap.status[hex(fp)] === "connecting") this.setStatus(hex(fp), "offline"); }); // only clean up the "connecting" a manual pairing set
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
    this.apply(link.contactId, await link.sess.decrypt(d), "direct");
  }
  private async onReady(link: Link, sess: Session) {
    clearTimeout(link.timer);
    const fp = await sha256(sess.peerPub), cid = hex(fp), ek = sess.peerEk ?? fromB64(link.ek ?? "");
    let contact = this.snap.contacts.find((c) => c.id === cid);
    if (!contact) {
      contact = { id: cid, pub: toB64(sess.peerPub), name: cleanName(link.name ?? "Contact"), code: codeFromFp(fp), addedAt: Date.now(), verified: false, ...(ek.length === 65 ? { ek: toB64(ek) } : {}) };
      await db.putContact(contact); this.set({ contacts: [...this.snap.contacts, contact] });
    } else if (ek.length === 65 && contact.ek !== toB64(ek)) { await this.patchContact(cid, { ek: toB64(ek) }); this.pairs.delete(cid); }
    const convId = this.host.ensureConversation(cid, contact.name);
    const old = this.links.get(cid); link.contactId = cid; this.links.set(cid, link); if (old && old !== link) old.pc.close();
    this.setStatus(cid, "online"); this.setMode(cid, "direct");
    this.noteSeen(cid); // the completed handshake itself is proof of life
    if (this.snap.pairing.kind !== "idle") this.setPairing({ kind: "done", name: contact.name, convId });
    this.flush(cid); this.flushQueue(cid); this.flushGroupsFor(cid); this.sendProfile(link);
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
    this.finishKnock(rid); k.link.expectPub = env.pub; k.link.name = env.name; if (env.ek) k.link.ek = env.ek;
    if (!k.link.silent) this.setPairing({ kind: "connecting" });
    try { await k.link.pc.acceptAnswer(env.sdp); } catch { k.link.pc.close(); }
  }
  private async onKnock(payload: Uint8Array) {
    if (!this.id) return;
    const env = await checkEnvelope(await unseal(this.id.code, payload), Date.now());
    if (!env || env.t !== "offer" || env.to !== this.id.code || env.pub === this.id.pubB64 || this.seen.has(env.rid)) return;
    this.seen.add(env.rid); if (this.seen.size > 500) this.seen.clear();
    const fp = hex(await sha256(fromB64(env.pub)));
    const known = this.snap.contacts.find((c) => c.id === fp);
    if (!known && this.snap.settings.onlyContacts) return;     // access restriction: strangers cannot even ask
    if (known) { if (!known.blocked) void this.acceptOffer(env, true).catch(() => {}); return; } // known contacts reconnect automatically; blocked ones are ignored
    const until = this.declined.get(fp); if (until && until > Date.now()) return;
    if (this.snap.requests.length >= 10 || this.snap.requests.some((r) => r.env.pub === env.pub)) return;
    const req: Request = { rid: env.rid, name: env.name, code: await codeOfPub(env.pub), safety: await safetyNumber(this.id.pub, fromB64(env.pub)), receivedAt: Date.now(), env };
    this.set({ requests: [...this.snap.requests, req] });
  }
  private async acceptOffer(env: Envelope, silent: boolean) {
    if (!this.id) return;
    const link = this.newLink(silent); link.expectPub = env.pub; link.name = env.name; if (env.ek) link.ek = env.ek;
    const sdp = await link.pc.acceptOffer(env.sdp);
    const reply = await signEnvelope(this.id, { t: "answer", rid: env.rid, name: this.snap.settings.name, sdp, ts: Date.now() });
    if (env.to) this.relay?.publish(await topicFor("r", env.rid), await seal(env.rid, reply));
    else if (!silent) this.setPairing({ kind: "manual-answer", text: await packEnvelope(reply) });
    const fp = hex(await sha256(fromB64(env.pub)));
    if (!silent && this.snap.status[fp] !== "online") this.setStatus(fp, "connecting"); // only the manual pairing UI shows the attempt; silent reconnects never fake "connecting"
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
      this.manualOffers.delete(env.rid); link.expectPub = env.pub; link.name = env.name; if (env.ek) link.ek = env.ek; this.setPairing({ kind: "connecting" });
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
  /** Blocked contacts receive nothing from us, their knock offers are ignored and their frames are dropped on arrival. */
  async blockContact(id: string, blocked: boolean) {
    await this.patchContact(id, { blocked: blocked || undefined });
    if (blocked) { this.links.get(id)?.pc.close(); if (this.live?.cid === id) this.endCall(); }
  }
  async removeContact(id: string) {
    this.links.get(id)?.pc.close(); this.links.delete(id); await db.deleteContact(id); this.host.removeConversationFor(id);
    const { [id]: _gone, ...status } = this.snap.status; void _gone; this.set({ contacts: this.snap.contacts.filter((c) => c.id !== id), status });
    this.dropMode(id); this.pairs.delete(id); this.rxWin.delete(id); this.lastSeq.delete(id);
    this.lastSeen.delete(id); this.lastPing.delete(id);
    this.outbox.forEach((e, k) => e.cid === id && this.outbox.delete(k)); this.orphans.clear();
  }
  connectNow(id: string) { this.ensureConnected(id, true); }
  private ensureConnected(id: string, force = false) {
    const c = this.snap.contacts.find((x) => x.id === id); if (!c || c.blocked || !this.relay || this.relay.connected === 0) return;
    if (this.snap.status[id] === "online" || this.snap.status[id] === "connecting") return;
    const quiet = !!c.ek && !force; // relay-capable contacts reconnect silently: the 30 s heartbeat decides presence, attempts stay invisible
    if (Date.now() - (this.lastTry.get(id) ?? 0) < (quiet ? 120_000 : force ? 6_000 : 20_000)) return;
    this.lastTry.set(id, Date.now());
    if (!quiet) {
      this.setStatus(id, "connecting");
      setTimeout(() => { if (this.snap.status[id] === "connecting" && !this.links.has(id)) this.setStatus(id, "offline"); }, 58_000);
    }
    this.startKnock(c.code, true).catch(() => { if (!quiet) this.setStatus(id, "offline"); });
  }
  private reconnectAll() { if (document.visibilityState === "visible") this.snap.contacts.forEach((c) => this.ensureConnected(c.id)); }

  /* ---------- heartbeat: a tiny "ben burdayım" every 30 s, answered by an equally tiny pong ---------- */
  /** Every 30 s each contact gets one sealed {k:"ping"} over the best path (DataChannel first, live relay topic otherwise).
      Any pong — or any live frame at all — proves the peer is alive; three missed heartbeats close a zombie link. */
  private hbTick() {
    const now = Date.now();
    for (const c of this.snap.contacts) {
      if (c.blocked) continue;
      if (this.snap.status[c.id] === "online" && now - (this.lastSeen.get(c.id) ?? 0) > 90_000) {
        this.links.get(c.id)?.pc.close(); // three missed heartbeats: the direct link is a zombie, free the slot
        this.setStatus(c.id, "offline");
      }
      if (now - (this.lastPing.get(c.id) ?? 0) < 30_000) continue;
      this.lastPing.set(c.id, now);
      const link = this.links.get(c.id);
      if (link?.sess) { this.sendFrame(c.id, { k: "ping" }); continue; }
      void this.relayPing(c.id);
      if (this.snap.status[c.id] === "online" && now - (this.lastTry.get(c.id) ?? 0) > 120_000) {
        this.lastTry.set(c.id, now); // relay-only presence still deserves a direct link (calls, bulk files): knock quietly now and then
        this.startKnock(c.code, true).catch(() => {});
      }
    }
  }
  /** One sealed frame on the peer's live topic — nothing retained, no mailbox copy, ~100 bytes of application payload. */
  private async relayPing(cid: string, kind: "ping" | "pong" = "ping") {
    const relay = this.relay;
    if (!relay || !relay.connected || !this.id) return;
    const key = await this.pairKeyFor(cid); if (!key) return;
    const seq = Math.max(Date.now(), (this.lastSeq.get(cid) ?? 0) + 1); this.lastSeq.set(cid, seq);
    const { iv, ct } = await sealTo(key, { k: kind });
    const bytes = await makeRFrame({ to: cid, seq, iv, ct, id: this.id });
    if (bytes) relay.publish(liveTopic(cid), bytes);
  }

  /* ---------- Q7RP v2: pairwise keys, relay frames, mailbox, receipts ---------- */
  /** AES key shared with a contact: ECDH(our static, their static). Works offline once both sides know each other's keys. */
  private pairKeyFor(cid: string): Promise<CryptoKey | null> {
    const cached = this.pairs.get(cid); if (cached) return cached;
    const p = (async () => {
      try {
        if (!this.id || !this.id.ecdh || !this.id.spk) return null;
        const c = this.snap.contacts.find((x) => x.id === cid);
        if (!c || !c.ek || hex(this.id.fp) === cid) return null;
        const peerEk = fromB64(c.ek);
        if (peerEk.length !== 65 || hex(await sha256(fromB64(c.pub))) !== cid) return null;
        return await pairKey(this.id.ecdh, peerEk, this.id.fp, unHex(cid));
      } catch { return null; }
    })();
    this.pairs.set(cid, p); return p;
  }

  /** Seals, signs and sends one Q7RP frame: live push + retained mailbox copy. Returns false when no relay shared the frame. */
  private async relayPublish(cid: string, obj: unknown, part?: string): Promise<boolean> {
    const relay = this.relay;
    if (!relay || !relay.connected || !this.id) return false;
    const key = await this.pairKeyFor(cid);
    if (!key) return false;
    const seq = Math.max(Date.now(), (this.lastSeq.get(cid) ?? 0) + 1); this.lastSeq.set(cid, seq);
    const { iv, ct } = await sealTo(key, obj);
    const bytes = await makeRFrame({ to: cid, seq, iv, ct, id: this.id });
    if (!bytes) return false;
    relay.publish(liveTopic(cid), bytes);
    const mid = (obj as { id?: unknown }).id;
    if (typeof mid === "string") relay.deliverLater(`${mailRoot(cid)}/${mid}${part ? "/" + part : ""}`, bytes);
    else relay.deliverLater(`${mailRoot(cid)}/_x/${randomHex(8)}`, bytes);
    this.setMode(cid, "relay");
    return true;
  }
  /** Signed delivery receipt for a frame that arrived by relay, sent to the sender's receipt topic. */
  private async sendRelayAck(cid: string, id: string) {
    const relay = this.relay;
    if (!relay || !relay.connected || !this.id) return;
    const sig = toB64(await this.id.sign(utf8(JSON.stringify(["q7rp-ack-v1", cid, id])))); // binds the receipt to the receiver's topic fp
    relay.publish(ackRoot(cid), utf8(JSON.stringify({ c: "ack", id, by: hex(this.id.fp), sig })));
  }
  private async onRelayAck(payload: Uint8Array) {    if (!this.id) return;
    let o: unknown; try { o = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
    const a = o as Record<string, unknown>;
    if (!o || typeof o !== "object" || a.c !== "ack" || typeof a.id !== "string" || !ID.test(a.id) || typeof a.sig !== "string") return;
    // the receipt may name its signer; otherwise it can only be a 1:1 conversation's peer
    const m = this.host.getMessages().find((x) => x.id === a.id && x.direction === "out");
    if (typeof a.by === "string" && ID.test(a.by)) {
      const c = this.snap.contacts.find((x) => x.id === a.by); if (!c) return;
      let ok = false; try { ok = await verify(fromB64(c.pub), fromB64(a.sig), utf8(JSON.stringify(["q7rp-ack-v1", hex(this.id.fp), a.id]))); } catch {}
      if (ok) this.markDelivered(a.by, a.id);
      return;
    }
    if (!m) return;
    const conv = this.host.getConversations().find((c) => c.id === m.conversationId);
    const cid = conv?.contactId; if (!cid) return;
    const c = this.snap.contacts.find((x) => x.id === cid); if (!c) return;
    let ok = false; try { ok = await verify(fromB64(c.pub), fromB64(a.sig), utf8(JSON.stringify(["q7rp-ack-v1", hex(this.id.fp), a.id]))); } catch {}
    if (!ok) return;
    this.markDelivered(cid, a.id);
  }
  private markDelivered(cid: string, id: string) {
    this.relay?.clearRetained(`${mailRoot(cid)}/${id}`);     // delivered ⇒ no broker needs to hold a mailbox copy anymore
    this.relay?.clearRetained(`${mailRoot(cid)}/${id}/f`);
    const m = this.host.getMessages().find((x) => x.id === id && x.direction === "out");
    if (m && m.status !== "delivered" && m.status !== "seen") this.host.updateMessage(m.id, { status: "delivered" });
    this.pendingBlobs.delete(id);
    for (const [k, e] of this.outbox) if (e.cid === cid && (e.obj as { id?: unknown }).id === id) this.outbox.delete(k); // any kind: msgs, invites, roster edits, reactions…
  }
  /** A frame that travelled through the relays: a live push, or an offline mailbox copy replayed by a broker. */
  private async onRelayFrame(topic: string, payload: Uint8Array) {
    if (!this.id) return;
    let raw: unknown; try { raw = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
    const opened = await openRFrame(raw);
    if (!opened || opened.to !== hex(this.id.fp)) return;
    const cid = opened.fp;
    const known = this.snap.contacts.find((c) => c.id === cid);
    if (!known) return;                                          // relayed frames from strangers are refused; contacts only
    if (known.blocked) return;                                   // blocked contacts get no relay delivery at all
    const win = this.rxWin.get(cid) ?? new SeqWindow();
    if (!win.allow(opened.seq)) return;                          // duplicate retained copy from another broker
    this.rxWin.set(cid, win);
    let c = known;
    if (opened.ek && toB64(opened.ek) !== c.ek) { await this.patchContact(cid, { ek: toB64(opened.ek) }); this.pairs.delete(cid); c = this.snap.contacts.find((x) => x.id === cid)!; }
    const key = await this.pairKeyFor(cid);
    if (!key) return;
    const pt = await openFrom(key, opened.iv, opened.ct);
    if (!pt) return;
    this.setMode(cid, "relay");
    if (topic === liveTopic(hex(this.id.fp))) this.noteSeen(cid); // live pushes prove presence; retained mailbox copies may be days old
    this.apply(cid, pt, "relay");
  }

  /* ---------- the outbox: frames that must survive until the peer is back ---------- */
  private outKey(cid: string, kind: string, id: string) { return `${cid}~${kind}~${id}`; }
  private enqueue(cid: string, kind: string, obj: unknown, file?: { att: Extract<Attachment, { t: "file" }> }) {
    const id = typeof (obj as { id?: unknown }).id === "string" ? (obj as { id: string }).id : randomHex(8);
    this.outbox.set(this.outKey(cid, kind, id), { cid, kind, obj, ...(file ? { file } : {}), added: Date.now(), next: 0, tries: 0 });
    void this.outTick();
  }
  private async outTick() {
    if (this.outRunning || !this.relay) return; this.outRunning = true;
    try {
      const now = Date.now(), convs = this.host.getConversations();
      for (const [key, e] of [...this.outbox]) {
        const gid = typeof (e.obj as { conv?: unknown }).conv === "string" ? (e.obj as { conv: string }).conv : "";
        const conv = gid ? convs.find((c) => c.id === gid) : convs.find((c) => c.contactId === e.cid);
        const mid = (e.obj as { id?: unknown }).id;
        // chat frames are bound to their message (delete it ⇒ the queue entry dies);
        // everything else (invites, roster changes, reactions, retracts, receipts) is bound
        // to the conversation and bounded by the retry cap instead
        const chat = e.kind === "msg" || e.kind === "vote";
        const alive = chat
          ? !!conv && typeof mid === "string" && this.host.getMessages().some((m) => m.conversationId === conv.id && m.id === mid)
          : gid ? convs.some((c) => c.id === gid) : !!conv;
        // expired, deleted or never persisted — the grace window absorbs the moment between
        // addMessage and the next React render, so a brand-new message is never mistaken for a gone one
        if (!alive && now - e.added > 15_000) { this.outbox.delete(key); continue; }
        if (this.links.get(e.cid)?.sess) continue;                     // the direct transport owns delivery while it is open
        if (e.next > now) continue;
        if (this.relay.connected === 0) { e.next = now + 4_000; continue; }
        if (!(await this.relayPublish(e.cid, e.obj))) { e.next = now + 4_000; continue; }
        if (e.file) {                                                  // small attachments ride along as their own frame
          const id = mid as string;
          const blob = this.pendingBlobs.get(id) ?? (await db.getBlob(id))?.blob;
          if (blob) {
            const buf = new Uint8Array(await blob.arrayBuffer());
            if (buf.length <= INLINE_MAX) await this.relayPublish(e.cid, { k: "file", id, d: toB64(buf) }, "f");
          }
          e.file = undefined;
        }
        e.tries++; e.next = now + Math.min(5_000 * e.tries, 8 * 60_000);
        if (e.tries > 24) this.outbox.delete(key);                     // per-broker retained copies outlive the retry slot
        const conv2 = gid ? convs.find((c) => c.id === gid) : convs.find((c) => c.contactId === e.cid);
        const m = conv2 && e.kind === "msg" && this.host.getMessages().find((x) => x.id === mid && x.conversationId === conv2.id);
        if (m && m.status === "queued") this.host.updateMessage(m.id, { status: "sent" });
      }
    } finally { this.outRunning = false; }
  }

  /* ---------- calls: renegotiated media tracks on the direct WebRTC link, signalled in-band ---------- */
  private iceServers(): RTCIceServer[] {
    const s: RTCIceServer[] = [{ urls: STUN }];
    const t = this.snap.settings.turn;
    if (t?.urls) s.push({ urls: t.urls, username: t.username, credential: t.credential });
    return s;
  }
  private sendCallFrame(cid: string, f: unknown) {
    const link = this.links.get(cid);
    if (!link?.sess) { if (this.live?.cid === cid) this.endLive("silent"); return; }
    this.sendFrame(cid, f);
  }
  private publishCall() {
    if (!this.live) { this.set({ call: null }); return; }
    const { pc: _pc, offerSdp: _o, pendingIce: _i, ...pub } = this.live; void _pc; void _o; void _i;
    this.set({ call: pub });
  }
  private patchCall(p: Partial<CallState>) { if (!this.live) return; this.live = { ...this.live, ...p }; this.publishCall(); }
  /** Persists a finished call attempt to the local call history. */
  private logCall(cid: string, dir: "in" | "out", video: boolean, missed: boolean, dur: number) {
    const name = this.snap.contacts.find((c) => c.id === cid)?.name ?? cid.slice(0, 8);
    pushCallEntry({ id: randomHex(8), cid, name, dir, video, missed, at: Date.now(), dur: Math.max(0, Math.round(dur)) });
  }
  /** Tears the call down. log=false skips the call-history entry (e.g. during a wipe). */
  private endLive(how: "failed" | "ended" | "silent", log = true) {
    const call = this.live; if (!call) return; this.live = undefined;
    clearTimeout(this.ring); this.ring = undefined;
    if (log) this.logCall(call.cid, call.dir, call.video, !call.startedAt, call.startedAt ? (Date.now() - call.startedAt) / 1000 : 0);
    try { call.local?.getTracks().forEach((t) => t.stop()); } catch {}
    try { call.pc.onicecandidate = null; call.pc.ontrack = null; call.pc.onconnectionstatechange = null; call.pc.close(); } catch {}
    this.set({ call: null });
  }
  /** User hangs up (or the UI ends it). */
  endCall() {
    const call = this.live; if (!call) return;
    this.sendCallFrame(call.cid, { k: "call", a: call.dir === "in" && call.state === "ringing" ? "reject" : "bye", id: call.id });
    this.endLive("silent");
  }
  async placeCall(cid: string, video: boolean): Promise<boolean> {
    const c = this.snap.contacts.find((x) => x.id === cid);
    if (!c || c.blocked || this.live || !this.links.get(cid)?.sess) return false;
    let media: MediaStream;
    try { media = await navigator.mediaDevices.getUserMedia({ audio: true, ...(video ? { video: { facingMode: "user", width: { ideal: 1280 } } } : {}) }); }
    catch { return false; } // UI maps this to err.noMedia
    const id = randomHex(8);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers() });
    this.live = { id, cid, dir: "out", video, state: "connecting", local: media, pc, pendingIce: [] };
    this.publishCall();
    media.getTracks().forEach((t) => pc.addTrack(t, media));
    pc.getTransceivers().forEach((tx) => { if (tx.sender.track) tx.direction = "sendrecv"; });
    this.wireCallPc(cid, id, pc);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      this.sendCallFrame(cid, { k: "call", a: "offer", id, video, sdp: pc.localDescription!.sdp });
      this.patchCall({ state: "ringing" });
      setTimeout(() => { if (this.live?.id === id && this.live.state === "ringing") { this.sendCallFrame(cid, { k: "call", a: "bye", id }); this.endLive("silent"); } }, 60_000);
      return true;
    } catch { this.endLive("silent"); return false; }
  }
  async acceptCall() {
    const call = this.live; if (!call || call.dir !== "in" || call.state !== "ringing") return;
    clearTimeout(this.ring); this.ring = undefined;
    this.patchCall({ state: "connecting" });
    let media: MediaStream;
    try { media = await navigator.mediaDevices.getUserMedia({ audio: true, ...(call.video ? { video: { facingMode: "user" } } : {}) }); } catch { this.sendCallFrame(call.cid, { k: "call", a: "reject", id: call.id }); this.endLive("silent"); return; }
    try {
      const pc = call.pc;
      // Tracks must exist BEFORE setRemoteDescription so the offer's m-lines associate with our
      // senders — answering with recvonly transceivers means media never flows in either direction.
      media.getTracks().forEach((t) => pc.addTrack(t, media));
      await pc.setRemoteDescription({ type: "offer", sdp: call.offerSdp! });
      for (const cand of call.pendingIce) void pc.addIceCandidate(cand).catch(() => {});
      call.pendingIce = [];
      await pc.setLocalDescription(await pc.createAnswer());
      this.sendCallFrame(call.cid, { k: "call", a: "answer", id: call.id, sdp: pc.localDescription!.sdp });
      this.patchCall({ local: media, startedAt: Date.now() });
    } catch { this.sendCallFrame(call.cid, { k: "call", a: "reject", id: call.id }); this.endLive("silent"); }
  }
  declineCall() {
    const call = this.live; if (!call) return;
    clearTimeout(this.ring); this.ring = undefined;
    this.sendCallFrame(call.cid, { k: "call", a: call.dir === "in" ? "reject" : "bye", id: call.id });
    this.endLive("silent");
  }
  private onCallFrame(cid: string, o: Record<string, unknown>) {
    const a = o.a; const id = typeof o.id === "string" && ID.test(o.id) ? o.id : "";
    const link = this.links.get(cid); if (!link?.sess) return;
    const c = this.snap.contacts.find((x) => x.id === cid);
    if (a === "offer") {
      if (!c || c.blocked) return;
      if (this.live || typeof o.sdp !== "string" || !o.sdp) { if (this.live) this.logCall(cid, "in", o.video === true, true, 0); this.sendCallFrame(cid, { k: "call", a: "reject", id }); return; } // busy or malformed
      const pc = new RTCPeerConnection({ iceServers: this.iceServers() });
      this.live = { id, cid, dir: "in", video: o.video === true, state: "ringing", pc, offerSdp: o.sdp as string, pendingIce: [] };
      this.publishCall();
      this.wireCallPc(cid, id, pc);
      clearTimeout(this.ring);
      this.ring = setTimeout(() => { if (this.live?.id === id && this.live.state === "ringing") { this.sendCallFrame(cid, { k: "call", a: "reject", id }); this.endLive("silent"); } }, 45_000);
      return;
    }
    const call = this.live; if (!call || call.cid !== cid || call.id !== id) return;
    if (a === "answer" && call.dir === "out") {
      if (typeof o.sdp !== "string") return;
      void (async () => {
        try {
          await call.pc.setRemoteDescription({ type: "answer", sdp: o.sdp as string });
          for (const cand of call.pendingIce) void call.pc.addIceCandidate(cand).catch(() => {});
          call.pendingIce = [];
          this.patchCall({ startedAt: Date.now() });
        } catch { this.sendCallFrame(cid, { k: "call", a: "bye", id }); this.endLive("silent"); }
      })();
    } else if (a === "ice") {
      const cand = o.c as RTCIceCandidateInit | undefined;
      if (!cand || typeof cand.candidate !== "string") return;
      if (!call.pc.remoteDescription) call.pendingIce.push(cand);
      else void call.pc.addIceCandidate(cand).catch(() => {});
    } else if (a === "bye") this.endLive("silent");
    else if (a === "reject") this.endLive("silent");
  }
  private wireCallPc(cid: string, id: string, pc: RTCPeerConnection) {
    pc.onicecandidate = (e) => { if (e.candidate) this.sendCallFrame(cid, { k: "call", a: "ice", id, c: e.candidate.toJSON() }); };
    pc.ontrack = (e) => { if (this.live?.id !== id) return; const s = e.streams[0] ?? new MediaStream([e.track]); this.patchCall({ remote: s }); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "failed" || st === "closed") { if (this.live?.id === id) { this.sendCallFrame(cid, { k: "call", a: "bye", id }); this.endLive("silent"); } }
      else if (st === "connected" && this.live?.id === id && this.live.state !== "active") this.patchCall({ state: "active", startedAt: this.live.startedAt ?? Date.now() });
    };
  }

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
    this.sendData(contactId, { k: "vote", id: m.id, c: choices });
  }
  /** Group poll vote: apply locally, fan out to every member (the apply side keys votes by sender). */
  voteIn(convId: string, msgId: string, choices: number[]) {
    const m = this.host.getMessages().find((x) => x.id === msgId && x.conversationId === convId);
    if (!this.groupConv(convId) || !m || m.att?.t !== "poll" || !validVote(choices, m.att.opts.length, m.att.multi)) return;
    this.host.updateMessage(m.id, { att: { ...m.att, votes: { ...m.att.votes, [this.snap.fp]: choices } } });
    this.fanout(convId, "vote", { k: "vote", conv: convId, id: m.id, c: choices });
  }
  /** Picks the best available path: the DataChannel while it is open, the relays otherwise. */
  private sendData(contactId: string, f: unknown) {
    const link = this.links.get(contactId);
    if (link?.sess) { this.sendFrame(contactId, f); return; }
    const id = (f as { id?: unknown }).id;
    if (typeof id === "string" && ID.test(id)) this.enqueue(contactId, "vote", f);
  }
  private sendFrame(contactId: string, f: unknown) {
    const link = this.links.get(contactId); if (!link?.sess) return;
    link.tx = link.tx.then(async () => link.pc.send(await link.sess!.encrypt(f))).catch(() => link.pc.close());
  }
  private transmit(contactId: string, m: Message) {
    const frame = { k: "msg", id: m.id, ts: m.createdAt, body: m.body, link: m.link, replyTo: m.replyToId, att: m.att };
    if (this.links.get(contactId)?.sess) { this.directSendMsg(contactId, frame, m); return; }
    this.relayTransmit(contactId, m);
  }
  /** One message (header + inline file chunks) over an open DataChannel. Returns false when no link exists. */
  private directSendMsg(contactId: string, frame: unknown, m: Message) {
    const link = this.links.get(contactId); if (!link?.sess) return false;
    link.tx = link.tx.then(async () => {
      const s = link.sess!;
      link.pc.send(await s.encrypt(frame));
      if (m.att?.t === "file") {
        const blob = this.pendingBlobs.get(m.id) ?? (await db.getBlob(m.id))?.blob;
        if (blob) {
          const buf = new Uint8Array(await blob.arrayBuffer()), n = Math.ceil(buf.length / CHUNK);
          for (let i = 0; i < n; i++) { await link.pc.drain(); link.pc.send(await s.encrypt({ k: "chunk", id: m.id, i, n, d: toB64(buf.slice(i * CHUNK, (i + 1) * CHUNK)) })); }
        }
      }
      if (m.status === "queued") this.host.updateMessage(m.id, { status: "sent" });
    }).catch(() => link.pc.close());
    return true;
  }
  /** Q7RP path: sealed + signed frames into the live topic and the peer's retained mailbox. */
  private relayTransmit(contactId: string, m: Message) {
    // enqueued even while the relays are down — outTick waits for them and delivers on reconnect;
    // the status stays "queued" until a frame is actually published (outTick flips it to "sent")
    const big = m.att?.t === "file" && m.att.size > INLINE_MAX;
    this.enqueue(contactId, "msg", { k: "msg", id: m.id, ts: m.createdAt, body: m.body, link: m.link, replyTo: m.replyToId, att: m.att, inl: m.att?.t === "file" && !big ? true : undefined },
      m.att?.t === "file" && !big ? { att: m.att } : undefined);
  }
  private flush(contactId: string) {
    const conv = this.host.getConversations().find((c) => c.contactId === contactId); if (!conv) return;
    const now = Date.now(), mine = this.host.getMessages().filter((m) => m.conversationId === conv.id && m.expiresAt > now);
    mine.filter((m) => m.direction === "out" && m.status !== "delivered").forEach((m) => this.transmit(contactId, m));
    mine.forEach((m) => { const v = m.att?.t === "poll" ? m.att.votes[this.snap.fp] : undefined; if (v) this.sendData(contactId, { k: "vote", id: m.id, c: v }); });
  }
  /** A fresh direct link takes over every queued non-message frame (reactions, retracts, invites…). */
  private flushQueue(contactId: string) {
    for (const [key, e] of [...this.outbox]) {
      if (e.cid !== contactId || e.kind === "msg") continue;
      this.outbox.delete(key); this.sendFrame(contactId, e.obj);
    }
  }
  /** Re-sends this member's undelivered group messages over the fresh link (duplicates are deduped by id). */
  private flushGroupsFor(contactId: string) {
    const now = Date.now();
    for (const c of this.host.getConversations()) {
      if (c.mode !== "group" || !c.members?.includes(contactId)) continue;
      this.host.getMessages()
        .filter((m) => m.conversationId === c.id && m.direction === "out" && m.expiresAt > now && m.status !== "delivered" && m.status !== "seen")
        .forEach((m) => this.directSendMsg(contactId, { k: "msg", conv: c.id, from: this.snap.fp, id: m.id, ts: m.createdAt, body: m.body, link: m.link, replyTo: m.replyToId, att: m.att }, m));
    }
  }

  /* ---------- groups: real multi-member spaces over the pairwise mesh ----------
     There is no group key and no server: every frame is sealed per recipient with the
     existing pairwise key and fanned out member by member, exactly like 1:1 traffic.
     Membership itself travels as frames: g-invite carries the roster, g-meta edits it. */
  private groupConv(gid: string) { return this.host.getConversations().find((c) => c.id === gid && c.mode === "group"); }
  private groupPeers(gid: string): string[] {
    const conv = this.groupConv(gid); if (!conv) return [];
    return (conv.members ?? []).filter((x) => x !== this.snap.fp && !this.snap.contacts.find((c) => c.id === x)?.blocked);
  }
  /** Sends one frame to every group member: the open DataChannel when there is one, the outbox otherwise. */
  private fanout(gid: string, kind: string, obj: unknown) {
    for (const p of this.groupPeers(gid)) {
      if (this.links.get(p)?.sess) this.sendFrame(p, obj);
      else this.enqueue(p, kind, obj);
    }
  }
  private dmSend(contactId: string, kind: string, f: unknown) {
    if (this.links.get(contactId)?.sess) { this.sendFrame(contactId, f); return; }
    this.enqueue(contactId, kind, f);
  }
  private rosterNames(members: string[], extra?: Record<string, string>): Record<string, string> {
    const names: Record<string, string> = { ...(extra ?? {}), [this.snap.fp]: this.snap.settings.name || "Me" };
    for (const c of this.snap.contacts) if (members.includes(c.id)) names[c.id] = c.name;
    return names;
  }
  private inviteFrame(gid: string, conv: Conversation, members: string[], extraNames?: Record<string, string>) {
    return { k: "g-invite", conv: gid, id: gid, title: conv.title, hue: conv.hue, members, names: this.rosterNames(members, extraNames), by: this.snap.fp, ts: Date.now() };
  }
  private metaFrame(gid: string, patch: { title?: string; add?: string[]; remove?: string[]; names?: Record<string, string> }) {
    return { k: "g-meta", conv: gid, id: `${gid}:${randomHex(4)}`, ...patch, by: this.snap.fp, ts: Date.now() };
  }
  /** Creates a space with the picked contacts and invites each of them. Returns the conversation id. */
  createGroup(title: string, memberIds: string[]): string | null {
    if (!this.id) return null;
    const me = this.snap.fp;
    const ids = memberIds.filter((x) => x !== me && this.snap.contacts.some((c) => c.id === x && !c.blocked)).slice(0, 49);
    if (!ids.length) return null;
    const gid = this.host.createGroup({ title, members: [me, ...ids], hue: Math.floor(Math.random() * 360) });
    const conv = this.groupConv(gid); if (!conv) return gid;
    for (const p of ids) this.dmSend(p, "invite", this.inviteFrame(gid, conv, conv.members ?? []));
    ids.forEach((p) => this.ensureConnected(p, true));
    return gid;
  }
  leaveGroup(gid: string) {
    const conv = this.groupConv(gid); if (!conv) return;
    this.fanout(gid, "meta", this.metaFrame(gid, { remove: [this.snap.fp] })); // tell the rest before vanishing
    this.host.removeGroup(gid);
  }
  groupRename(gid: string, title: string) {
    const conv = this.groupConv(gid); if (!conv) return;
    const t = cleanName(title).slice(0, 60); if (!t) return;
    this.host.updateGroup(gid, { title: t });
    this.fanout(gid, "meta", this.metaFrame(gid, { title: t }));
  }
  groupAdd(gid: string, contactIds: string[]) {
    const conv = this.groupConv(gid); if (!conv) return;
    const add = contactIds.filter((x) => x !== this.snap.fp && !conv.members?.includes(x) && this.snap.contacts.some((c) => c.id === x && !c.blocked));
    if (!add.length) return;
    const members = [...(conv.members ?? []), ...add].slice(0, 50);
    this.host.updateGroup(gid, { members });
    for (const p of add) this.dmSend(p, "invite", this.inviteFrame(gid, { ...conv, members }, members)); // newcomers get the full invite
    this.fanout(gid, "meta", this.metaFrame(gid, { add, names: this.rosterNames(members) }));            // the rest learn the new roster
    add.forEach((p) => this.ensureConnected(p, true));
  }
  groupRemove(gid: string, contactId: string) {
    const conv = this.groupConv(gid); if (!conv || contactId === this.snap.fp || !conv.members?.includes(contactId)) return;
    this.host.updateGroup(gid, { members: conv.members.filter((x) => x !== contactId) });
    const meta = this.metaFrame(gid, { remove: [contactId] });
    this.fanout(gid, "meta", meta);
    this.dmSend(contactId, "meta", meta); // the removed member learns it too
  }
  /** Sends into a space: one sealed message per member, fanned out pairwise. */
  sendGroup(convId: string, body: string, att?: Attachment, blob?: Blob, replyToId?: string, link?: LinkMeta) {
    const conv = this.groupConv(convId); if (!conv) return;
    const createdAt = Date.now();
    const m: Message = { id: randomHex(16), conversationId: convId, body, createdAt, expiresAt: createdAt + LIFETIME_MS, link, replyToId, att, direction: "out", status: "queued", from: this.snap.fp };
    if (blob) this.pendingBlobs.set(m.id, blob);
    this.host.addMessage(m, blob);
    const big = m.att?.t === "file" && m.att.size > INLINE_MAX;
    const frame = { k: "msg", conv: convId, from: this.snap.fp, id: m.id, ts: m.createdAt, body: m.body, link: m.link, replyTo: m.replyToId, att: m.att, inl: m.att?.t === "file" && !big ? true : undefined };
    for (const p of this.groupPeers(convId)) {
      if (!this.directSendMsg(p, frame, m)) this.enqueue(p, "msg", frame, m.att?.t === "file" && !big ? { att: m.att } : undefined);
    }
    this.groupPeers(convId).forEach((p) => this.ensureConnected(p, true));
  }
  /** Toggles my emoji reaction on a message and tells everyone else. */
  react(convId: string, msgId: string, emoji: string) {
    const conv = this.host.getConversations().find((c) => c.id === convId); if (!conv || conv.mode === "local") return;
    const m = this.host.getMessages().find((x) => x.id === msgId && x.conversationId === convId); if (!m) return;
    const e = Array.from(emoji).slice(0, 8).join(""); if (!e) return;
    const on = !(m.reactions?.[e] ?? []).includes(this.snap.fp);
    this.host.reactMessage(msgId, e, this.snap.fp, on);
    const f = { k: "react", ...(conv.mode === "group" ? { conv: convId } : {}), id: msgId, e, on };
    if (conv.mode === "p2p" && conv.contactId) this.dmSend(conv.contactId, "react", f);
    else if (conv.mode === "group") this.fanout(convId, "react", f);
  }
  /** Edits my own sent message everywhere it lives. */
  editMessage(convId: string, msgId: string, body: string) {
    const conv = this.host.getConversations().find((c) => c.id === convId); if (!conv || conv.mode === "local") return;
    const m = this.host.getMessages().find((x) => x.id === msgId && x.conversationId === convId); if (!m || m.direction !== "out") return;
    const b = body.slice(0, 4000);
    this.host.updateMessage(msgId, { body: b, editedAt: Date.now() });
    const f = { k: "edit", ...(conv.mode === "group" ? { conv: convId } : {}), id: msgId, body: b };
    if (conv.mode === "p2p" && conv.contactId) this.dmSend(conv.contactId, "edit", f);
    else if (conv.mode === "group") this.fanout(convId, "edit", f);
  }
  /** Deletes my own sent message on every device: the frame leaves first so it survives the local removal. */
  retract(convId: string, msgId: string) {
    const conv = this.host.getConversations().find((c) => c.id === convId); if (!conv || conv.mode === "local") return;
    const m = this.host.getMessages().find((x) => x.id === msgId && x.conversationId === convId); if (!m || m.direction !== "out") return;
    const f = { k: "retract", ...(conv.mode === "group" ? { conv: convId } : {}), id: msgId };
    if (conv.mode === "p2p" && conv.contactId) this.dmSend(conv.contactId, "retract", f);
    else if (conv.mode === "group") this.fanout(convId, "retract", f);
    this.host.removeMessage(msgId);
  }
  /** Read receipts: tells the conversation how far we have read ("Görüldü"). */
  markRead(convId: string) {
    const conv = this.host.getConversations().find((c) => c.id === convId); if (!conv || conv.mode === "local") return;
    const upto = this.host.getMessages().filter((m) => m.conversationId === convId && m.direction === "in").reduce((t, m) => Math.max(t, m.createdAt), 0);
    if (!upto || upto <= (this.seenSent.get(convId) ?? 0)) return;
    this.seenSent.set(convId, upto);
    const f = { k: "seen", id: randomHex(8), ...(conv.mode === "group" ? { conv: convId } : {}), upto };
    if (conv.mode === "p2p" && conv.contactId) this.dmSend(conv.contactId, "seen", f);
    else if (conv.mode === "group") this.fanout(convId, "seen", f);
  }
  /** Applies a group invite: same conversation id on every member, roster and names included. */
  private onGroupInvite(cid: string, o: Record<string, unknown>) {
    const gid = o.conv; if (typeof gid !== "string" || !ID.test(gid)) return;
    const members = Array.isArray(o.members) ? o.members.filter((x): x is string => typeof x === "string" && ID.test(x)).slice(0, 50) : [];
    if (!members.includes(cid) || !members.includes(this.snap.fp) || members.length < 2) return;
    const title = typeof o.title === "string" ? cleanName(o.title).slice(0, 60) : "";
    if (!title) return;
    const hue = typeof o.hue === "number" && Number.isFinite(o.hue) && o.hue >= 0 && o.hue < 360 ? Math.floor(o.hue) : undefined;
    const names: Record<string, string> = {};
    if (o.names && typeof o.names === "object") for (const [k, v] of Object.entries(o.names as Record<string, unknown>)) if (ID.test(k) && typeof v === "string") names[k] = cleanName(v);
    this.host.createGroup({ id: gid, title, members, hue, names });
  }
  /** Applies a roster edit from a member: add, remove (a removal that hits me tears the space down). */
  private onGroupMeta(cid: string, o: Record<string, unknown>) {
    const gid = o.conv; if (typeof gid !== "string" || !ID.test(gid)) return;
    const conv = this.groupConv(gid); if (!conv) return;
    const cur = conv.members ?? []; if (!cur.includes(cid)) return; // only members may touch the roster
    let members = [...cur]; let removedMe = false;
    if (Array.isArray(o.add)) for (const x of o.add) if (typeof x === "string" && ID.test(x) && !members.includes(x) && members.length < 50) members.push(x);
    if (Array.isArray(o.remove)) for (const x of o.remove) if (typeof x === "string" && ID.test(x)) { if (x === this.snap.fp) removedMe = true; members = members.filter((y) => y !== x); }
    if (removedMe) { this.host.removeGroup(gid); return; }
    const patch: Partial<Conversation> = { members };
    if (typeof o.title === "string" && cleanName(o.title)) patch.title = cleanName(o.title).slice(0, 60);
    if (o.names && typeof o.names === "object") {
      const names = { ...(conv.names ?? {}) };
      for (const [k, v] of Object.entries(o.names as Record<string, unknown>)) if (ID.test(k) && typeof v === "string") names[k] = cleanName(v);
      patch.names = names;
    }
    this.host.updateGroup(gid, patch);
  }

  /* ---------- frame handling, shared by the direct link and the relays ----------
     direct frames arrive with their owning link; relayed frames come from onRelayFrame */
  private async apply(cid: string, f: unknown, via: "direct" | "relay") {
    if (!f || typeof f !== "object") return; const o = f as Record<string, unknown>;
    if (this.snap.contacts.find((c) => c.id === cid)?.blocked) return; // blocked contacts are fully silenced
    if (o.k === "call") { this.onCallFrame(cid, o); return; }
    const ack = (id: string) => {
      if (this.links.get(cid)?.sess) this.sendFrame(cid, { k: "ack", id }); else void this.sendRelayAck(cid, id);
    };
    // group frames route by their conv id; everything else stays 1:1 (the peer owns one DM conversation)
    const gid = typeof o.conv === "string" && o.conv ? o.conv : "";
    let conv: Conversation | undefined;
    if (gid) {
      conv = this.host.getConversations().find((c) => c.id === gid);
      if (!conv || conv.mode !== "group") {
        if (o.k === "g-invite") { this.onGroupInvite(cid, o); if (typeof o.id === "string") ack(o.id); } // the ack stops the sender's retry loop
        return;
      }
      if (cid === this.snap.fp || !(conv.members ?? []).includes(cid)) return; // my own echo, or a non-member, may not speak
      if (o.k === "g-invite") { if (typeof o.id === "string") ack(o.id); return; } // already a member: receipt only
    } else {
      conv = this.host.getConversations().find((c) => c.contactId === cid); if (!conv) return;
    }
    if (o.k === "ping") { // "burda mısın?" — answered at once, on the very path the question came from
      if (via === "direct") { const link = this.links.get(cid); if (link?.sess) this.sendFrame(cid, { k: "pong" }); }
      else void this.relayPing(cid, "pong");
      return;
    }
    if (o.k === "pong") return; // heartbeat reply: the transport layer already noted the proof of life
    if (o.k === "ack" && typeof o.id === "string") { this.markDelivered(cid, o.id); return; }
    if (o.k === "g-meta") { this.onGroupMeta(cid, o); if (typeof o.id === "string") ack(o.id); return; }
    if (o.k === "profile") {
      const c = this.snap.contacts.find((x) => x.id === cid); if (!c) return;
      void this.patchContact(cid, { photo: validAvatar(o.photo) ? o.photo : undefined, ...(typeof o.name === "string" && !c.renamed ? { name: cleanName(o.name) } : {}) }); return;
    }
    if (o.k === "react" && typeof o.id === "string" && ID.test(o.id) && typeof o.e === "string" && o.e.length <= 16) {
      const m = this.host.getMessages().find((x) => x.id === o.id && x.conversationId === conv.id); if (!m) return;
      this.host.reactMessage(o.id, o.e, cid, o.on !== false); ack(o.id); return;
    }
    if (o.k === "retract" && typeof o.id === "string" && ID.test(o.id)) {
      const m = this.host.getMessages().find((x) => x.id === o.id && x.conversationId === conv.id); if (!m) return;
      if (gid ? m.from !== cid : m.direction !== "in") return; // only the original sender may retract
      this.host.removeMessage(o.id); ack(o.id); return;
    }
    if (o.k === "edit" && typeof o.id === "string" && ID.test(o.id) && typeof o.body === "string" && o.body.length <= 4000) {
      const m = this.host.getMessages().find((x) => x.id === o.id && x.conversationId === conv.id); if (!m) return;
      if (gid ? m.from !== cid : m.direction !== "in") return; // only the original sender may edit
      this.host.updateMessage(o.id, { body: o.body, editedAt: Date.now() }); ack(o.id); return;
    }
    if (o.k === "seen" && typeof o.id === "string" && ID.test(o.id) && typeof o.upto === "number" && Number.isFinite(o.upto) && o.upto > 0 && o.upto < Date.now() + 60_000) {
      const upto = o.upto;
      for (const m of this.host.getMessages().filter((x) => x.conversationId === conv.id && x.direction === "out" && x.status && x.status !== "seen" && x.createdAt <= upto)) {
        this.host.updateMessage(m.id, { status: "seen" });
      }
      ack(o.id); return;
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
        void db.putBlob({ id: o.id, blob: new Blob(inc.parts as BlobPart[], { type: inc.att.mime }), expiresAt: msg?.expiresAt ?? Date.now() + LIFETIME_MS });
        this.host.blobReady(); ack(o.id);
      }
      return;
    }
    if (o.k === "file" && typeof o.id === "string") { // inline bytes (Q7RP relay path)
      if (!ID.test(o.id) || typeof o.d !== "string" || o.d.length > INLINE_MAX * 2) return;
      const m = this.host.getMessages().find((x) => x.id === o.id && x.conversationId === conv.id);
      const att = m?.att; if (!m || att?.t !== "file") { this.keepOrphan(o.id, o.d); return; } // bytes before header
      if (await this.haveBlob(o.id)) { ack(o.id); this.orphans.delete(o.id); return; }        // stale retained copy
      let bytes: Uint8Array; try { bytes = fromB64(o.d); } catch { return; }
      if (bytes.length !== att.size || bytes.length > INLINE_MAX) return;
      void db.putBlob({ id: o.id, blob: new Blob([bytes as unknown as BlobPart], { type: att.mime }), expiresAt: m.expiresAt });
      this.host.blobReady(); this.orphans.delete(o.id); ack(o.id); return;
    }
    if (o.k !== "msg" || typeof o.id !== "string" || !ID.test(o.id) || typeof o.body !== "string" || o.body.length > 4000 || typeof o.ts !== "number" || !Number.isFinite(o.ts)) return;
    if (typeof o.from === "string" && o.from !== cid) return; // the claimed sender must be the wire sender
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
      this.host.addMessage({ id: o.id, conversationId: conv.id, body: o.body, createdAt, expiresAt, link: meta, att: att ?? undefined, replyToId: typeof o.replyTo === "string" && ID.test(o.replyTo) ? o.replyTo : undefined, direction: "in", from: gid ? cid : undefined });
      if (this.active !== conv.id) this.host.bumpUnread(conv.id);
    }
    if (att?.t === "file") {
      if (o.inl === true) { // inline assembly: bytes may already be waiting, otherwise the "file" frame delivers there
        if (await this.haveBlob(o.id)) { ack(o.id); this.orphans.delete(o.id); return; }
        const bytes = this.orphans.get(o.id);
        if (bytes && bytes.length === att.size) { this.orphans.delete(o.id); void db.putBlob({ id: o.id, blob: new Blob([bytes as unknown as BlobPart], { type: att.mime }), expiresAt: createdAt + LIFETIME_MS }); this.host.blobReady(); ack(o.id); }
        return; // no receipt until the file is complete
      }
      if (!exists || !(await this.haveBlob(o.id))) this.incoming.set(o.id, { att, parts: [], got: 0, n: Math.ceil(att.size / CHUNK), cid });
      else ack(o.id);
    } else ack(o.id);
  }
  private keepOrphan(id: string, b64: string) {
    try {
      const bytes = fromB64(b64);
      if (!bytes.length || bytes.length > INLINE_MAX) return;
      this.orphans.delete(id); this.orphans.set(id, bytes);
      if (this.orphans.size > 16) this.orphans.delete(this.orphans.keys().next().value!);
    } catch {}
  }
  private async haveBlob(id: string): Promise<boolean> { return !!(await db.getBlob(id)) || this.pendingBlobs.has(id); }
}
