/** Minimal MQTT 3.1.1 client over WebSocket (QoS 0). Used only as a dumb relay for sealed signaling messages. */
const te = new TextEncoder(), td = new TextDecoder();
const varLen = (n: number) => { const o: number[] = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b); } while (n > 0); return o; };
const str = (s: string) => { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };

export const connectPacket = (clientId: string) => { const body = [0, 4, 0x4d, 0x51, 0x54, 0x54, 4, 2, 0, 60, ...str(clientId)]; return Uint8Array.from([0x10, ...varLen(body.length), ...body]); };
export const subscribePacket = (id: number, topic: string) => { const body = [id >> 8, id & 255, ...str(topic), 0]; return Uint8Array.from([0x82, ...varLen(body.length), ...body]); };
export function publishPacket(topic: string, payload: Uint8Array, retain = false) {
  const head = str(topic), len = head.length + payload.length, vl = varLen(len);
  const out = new Uint8Array(1 + vl.length + len); out[0] = 0x30 | (retain ? 1 : 0); out.set(vl, 1); out.set(head, 1 + vl.length); out.set(payload, 1 + vl.length + head.length); return out;
}
export function parsePackets(buf: Uint8Array) {
  const packets: { type: number; flags: number; body: Uint8Array }[] = []; let i = 0;
  while (i + 2 <= buf.length) {
    let len = 0, mul = 1, j = i + 1, ok = false;
    for (let k = 0; k < 4 && j < buf.length; k++) { const b = buf[j++]!; len += (b & 127) * mul; mul *= 128; if (!(b & 128)) { ok = true; break; } }
    if (!ok || j + len > buf.length) break;
    packets.push({ type: buf[i]! >> 4, flags: buf[i]! & 15, body: buf.slice(j, j + len) }); i = j + len;
  }
  return { packets, rest: buf.slice(i) };
}
export function parsePublish(p: { flags: number; body: Uint8Array }) {
  const tl = (p.body[0]! << 8) | p.body[1]!; const topic = td.decode(p.body.slice(2, 2 + tl));
  const qos = (p.flags >> 1) & 3; return { topic, payload: p.body.slice(2 + tl + (qos > 0 ? 2 : 0)) };
}

const topicMatch = (pattern: string, topic: string): boolean => {
  const p = pattern.split("/"), t = topic.split("/");
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "#") return true;
    if (i >= t.length || (p[i] !== "+" && p[i] !== t[i])) return false;
  }
  return p.length === t.length;
};

export interface RelayStatus {
  url: string;
  connected: boolean;
  /** Consecutive failed connection attempts; reset by a successful CONNACK. */
  attempts: number;
  lastError?: string;
  lastConnectedAt?: number;
}

class Sock {
  ws: WebSocket | null = null; ready = false; buf = new Uint8Array(0); backoff = 2000; timer?: ReturnType<typeof setTimeout>; ping?: ReturnType<typeof setInterval>; stopped = false;
  attempts = 0; lastError?: string; lastConnectedAt?: number;
  constructor(public url: string, private owner: RelayClient) {}
  start() {
    if (this.stopped) return;
    let ws: WebSocket;
    try { ws = new WebSocket(this.url, "mqtt"); } catch { this.lastError = "unsupported"; this.retry(); return; }
    this.ws = ws; ws.binaryType = "arraybuffer";
    ws.onopen = () => { try { ws.send(connectPacket("q7-" + Math.random().toString(16).slice(2, 12))); } catch { this.lastError = "send"; ws.close(); } };
    ws.onmessage = (e) => {
      const add = new Uint8Array(e.data as ArrayBuffer); const m = new Uint8Array(this.buf.length + add.length); m.set(this.buf); m.set(add, this.buf.length);
      const { packets, rest } = parsePackets(m); this.buf = rest;
      for (const p of packets) {
        if (p.type === 2) {
          this.ready = true; this.attempts = 0; this.lastError = undefined; this.lastConnectedAt = Date.now(); this.backoff = 2000;
          this.owner.topics().forEach((t, i) => { try { ws.send(subscribePacket(i + 1, t)); } catch { /* reconnect handles it */ } });
          this.owner.changed();
          clearInterval(this.ping);
          this.ping = setInterval(() => { if (ws.readyState === 1) try { ws.send(Uint8Array.of(0xc0, 0)); } catch { /* ignore */ } }, 30000);
        }
        else if (p.type === 3) { const { topic, payload } = parsePublish(p); this.owner.deliver(topic, payload); }
      }
    };
    ws.onclose = () => { this.ready = false; this.buf = new Uint8Array(0); clearInterval(this.ping); this.owner.changed(); this.retry(); };
    ws.onerror = () => { this.lastError = "socket"; try { ws.close(); } catch { /* ignore */ } };
  }
  /** Exponential backoff with ±20% jitter: three public brokers must not reconnect in lockstep. */
  retry() {
    if (this.stopped) return;
    const base = Math.min(2000 * 2 ** this.attempts, 60_000);
    const wait = Math.round(base * (0.8 + Math.random() * 0.4));
    this.attempts = Math.min(this.attempts + 1, 30);
    this.timer = setTimeout(() => this.start(), wait);
  }
  send(b: Uint8Array) { if (this.ready && this.ws?.readyState === 1) { try { this.ws.send(b); return true; } catch { this.lastError = "send"; } } return false; }
  stop() { this.stopped = true; clearTimeout(this.timer); clearInterval(this.ping); try { this.ws?.close(); } catch { /* ignore */ } }
  status(): RelayStatus { return { url: this.url, connected: this.ready, attempts: this.attempts, ...(this.lastError ? { lastError: this.lastError } : {}), ...(this.lastConnectedAt ? { lastConnectedAt: this.lastConnectedAt } : {}) }; }
}

export class RelayClient {
  private socks: Sock[]; private subs = new Map<string, (p: Uint8Array, topic: string) => void>(); private n = 0;
  constructor(public urls: string[], private onStatus: () => void) { this.socks = urls.map((u) => new Sock(u, this)); }
  start() { this.socks.forEach((s) => s.start()); }
  stop() { this.socks.forEach((s) => s.stop()); }
  topics() { return [...this.subs.keys()]; }
  changed() { this.onStatus(); }
  deliver(topic: string, payload: Uint8Array) { for (const [pattern, cb] of this.subs) if (pattern === topic || topicMatch(pattern, topic)) cb(payload, topic); }
  get connected() { return this.socks.filter((s) => s.ready).length; }
  get status(): RelayStatus[] { return this.socks.map((s) => s.status()); }
  subscribe(topic: string, cb: (p: Uint8Array, topic: string) => void) { this.subs.set(topic, cb); this.socks.forEach((s) => s.send(subscribePacket(++this.n & 0xffff || 1, topic))); }
  unsubscribe(topic: string) { this.subs.delete(topic); } // stale subscriptions are dropped on delivery; reconnect resubscribes only live topics
  publish(topic: string, payload: Uint8Array) { const p = publishPacket(topic, payload); return this.socks.reduce((c, s) => c + (s.send(p) ? 1 : 0), 0); }
  /** Retained publish: brokers keep the payload and redeliver it to whoever subscribes later. */
  deliverLater(topic: string, payload: Uint8Array) { const p = publishPacket(topic, payload, true); return this.socks.reduce((c, s) => c + (s.send(p) ? 1 : 0), 0); }
  /** Retained payload of zero bytes asks every broker to delete its stored copy. */
  clearRetained(topic: string) { const p = publishPacket(topic, new Uint8Array(0), true); this.socks.forEach((s) => s.send(p)); }
}
