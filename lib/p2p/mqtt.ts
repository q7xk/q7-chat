/** Minimal MQTT 3.1.1 client over WebSocket (QoS 0). Used only as a dumb relay for sealed signaling messages. */
const te = new TextEncoder(), td = new TextDecoder();
const varLen = (n: number) => { const o: number[] = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b); } while (n > 0); return o; };
const str = (s: string) => { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };

export const connectPacket = (clientId: string) => { const body = [0, 4, 0x4d, 0x51, 0x54, 0x54, 4, 2, 0, 60, ...str(clientId)]; return Uint8Array.from([0x10, ...varLen(body.length), ...body]); };
export const subscribePacket = (id: number, topic: string) => { const body = [id >> 8, id & 255, ...str(topic), 0]; return Uint8Array.from([0x82, ...varLen(body.length), ...body]); };
export function publishPacket(topic: string, payload: Uint8Array) {
  const head = str(topic), len = head.length + payload.length, vl = varLen(len);
  const out = new Uint8Array(1 + vl.length + len); out[0] = 0x30; out.set(vl, 1); out.set(head, 1 + vl.length); out.set(payload, 1 + vl.length + head.length); return out;
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

class Sock {
  ws: WebSocket | null = null; ready = false; buf = new Uint8Array(0); backoff = 2000; timer?: ReturnType<typeof setTimeout>; ping?: ReturnType<typeof setInterval>; stopped = false;
  constructor(private url: string, private owner: RelayClient) {}
  start() {
    if (this.stopped) return;
    let ws: WebSocket;
    try { ws = new WebSocket(this.url, "mqtt"); } catch { this.retry(); return; }
    this.ws = ws; ws.binaryType = "arraybuffer";
    ws.onopen = () => ws.send(connectPacket("q7-" + Math.random().toString(16).slice(2, 12)));
    ws.onmessage = (e) => {
      const add = new Uint8Array(e.data as ArrayBuffer); const m = new Uint8Array(this.buf.length + add.length); m.set(this.buf); m.set(add, this.buf.length);
      const { packets, rest } = parsePackets(m); this.buf = rest;
      for (const p of packets) {
        if (p.type === 2) { this.ready = true; this.backoff = 2000; this.owner.topics().forEach((t, i) => ws.send(subscribePacket(i + 1, t))); this.owner.changed(); this.ping = setInterval(() => ws.readyState === 1 && ws.send(Uint8Array.of(0xc0, 0)), 30000); }
        else if (p.type === 3) { const { topic, payload } = parsePublish(p); this.owner.deliver(topic, payload); }
      }
    };
    ws.onclose = () => { this.ready = false; this.buf = new Uint8Array(0); clearInterval(this.ping); this.owner.changed(); this.retry(); };
    ws.onerror = () => ws.close();
  }
  retry() { if (this.stopped) return; this.timer = setTimeout(() => this.start(), this.backoff); this.backoff = Math.min(this.backoff * 2, 60000); }
  send(b: Uint8Array) { if (this.ready && this.ws?.readyState === 1) { this.ws.send(b); return true; } return false; }
  stop() { this.stopped = true; clearTimeout(this.timer); clearInterval(this.ping); this.ws?.close(); }
}

export class RelayClient {
  private socks: Sock[]; private subs = new Map<string, (p: Uint8Array) => void>(); private n = 0;
  constructor(public urls: string[], private onStatus: () => void) { this.socks = urls.map((u) => new Sock(u, this)); }
  start() { this.socks.forEach((s) => s.start()); }
  stop() { this.socks.forEach((s) => s.stop()); }
  topics() { return [...this.subs.keys()]; }
  changed() { this.onStatus(); }
  deliver(topic: string, payload: Uint8Array) { this.subs.get(topic)?.(payload); }
  get connected() { return this.socks.filter((s) => s.ready).length; }
  subscribe(topic: string, cb: (p: Uint8Array) => void) { this.subs.set(topic, cb); this.socks.forEach((s) => s.send(subscribePacket(++this.n & 0xffff || 1, topic))); }
  unsubscribe(topic: string) { this.subs.delete(topic); } // stale subscriptions are dropped on delivery; reconnect resubscribes only live topics
  publish(topic: string, payload: Uint8Array) { const p = publishPacket(topic, payload); return this.socks.reduce((c, s) => c + (s.send(p) ? 1 : 0), 0); }
}
