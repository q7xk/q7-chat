import { fromB64, signEnvelope, toB64, utf8, verify, type Identity } from './crypto';

export interface DiscoveryPeer {
  pub: string;
  name: string;
  code?: string;
  seenAt: number;
  via: string;
}

interface Hello {
  t: 'q7-discovery-v1';
  pub: string;
  name: string;
  ts: number;
  sig: string;
}

const MAX_AGE = 90_000;

async function signHello(id: Identity, name: string): Promise<Hello> {
  const ts = Date.now();
  const body = { t: 'q7-discovery-v1' as const, pub: id.pubB64, name: name.slice(0, 40), ts };
  const sig = toB64(await id.sign(utf8(JSON.stringify(['q7-discovery-v1', body.pub, body.name, body.ts]))));
  return { ...body, sig };
}

async function verifyHello(raw: unknown): Promise<Hello | null> {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  if (h.t !== 'q7-discovery-v1' || typeof h.pub !== 'string' || typeof h.name !== 'string' || typeof h.ts !== 'number' || typeof h.sig !== 'string') return null;
  if (Math.abs(Date.now() - h.ts) > MAX_AGE) return null;
  let pub: Uint8Array, sig: Uint8Array;
  try { pub = fromB64(h.pub); sig = fromB64(h.sig); } catch { return null; }
  if (pub.length !== 65) return null;
  const ok = await verify(pub, sig, utf8(JSON.stringify(['q7-discovery-v1', h.pub, h.name, h.ts])));
  if (!ok) return null;
  return { t: 'q7-discovery-v1', pub: h.pub, name: String(h.name).slice(0, 40), ts: h.ts, sig: h.sig };
}

export class DiscoveryClient {
  private socks = new Map<string, WebSocket>();
  private peers = new Map<string, DiscoveryPeer>();
  private timer?: ReturnType<typeof setInterval>;
  private onChange: () => void;
  private getId: () => Identity | undefined;
  private getName: () => string;
  private stopped = true;

  constructor(opts: { getId: () => Identity | undefined; getName: () => string; onChange: () => void }) {
    this.getId = opts.getId;
    this.getName = opts.getName;
    this.onChange = opts.onChange;
  }

  start(urls: string[]) {
    this.stopped = false;
    const want = new Set(urls.map(u => u.trim()).filter(Boolean));
    for (const [u, ws] of this.socks) {
      if (!want.has(u)) { try { ws.close(); } catch {} this.socks.delete(u); }
    }
    for (const u of want) if (!this.socks.has(u)) this.open(u);
    clearInterval(this.timer);
    this.timer = setInterval(() => { this.prune(); void this.announce(); }, 20_000);
    void this.announce();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const ws of this.socks.values()) try { ws.close(); } catch {}
    this.socks.clear();
    this.peers.clear();
    this.onChange();
  }

  list(): DiscoveryPeer[] {
    this.prune();
    return [...this.peers.values()].sort((a, b) => b.seenAt - a.seenAt);
  }

  private prune() {
    const now = Date.now();
    let changed = false;
    for (const [k, p] of this.peers) if (now - p.seenAt > MAX_AGE) { this.peers.delete(k); changed = true; }
    if (changed) this.onChange();
  }

  private async announce() {
    if (this.stopped) return;
    const id = this.getId();
    if (!id) return;
    const hello = await signHello(id, this.getName() || 'Q7');
    const msg = JSON.stringify(hello);
    for (const ws of this.socks.values()) {
      if (ws.readyState === 1) try { ws.send(msg); } catch {}
    }
  }

  private open(url: string) {
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return; }
    this.socks.set(url, ws);
    ws.onopen = () => { void this.announce(); };
    ws.onmessage = async e => {
      try {
        const raw = JSON.parse(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer));
        const hello = await verifyHello(raw);
        if (!hello) return;
        const id = this.getId();
        if (!id || hello.pub === id.pubB64) return;
        const prev = this.peers.get(hello.pub);
        this.peers.set(hello.pub, { pub: hello.pub, name: hello.name, seenAt: Date.now(), via: url });
        if (!prev || prev.name !== hello.name) this.onChange();
        else this.onChange();
      } catch {}
    };
    ws.onclose = () => {
      this.socks.delete(url);
      if (!this.stopped) setTimeout(() => { if (!this.stopped && !this.socks.has(url)) this.open(url); }, 5000);
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
}
