export interface IceConfig { turn?: { urls: string; username?: string; credential?: string } }
export const STUN = ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"];

const slim = (sdp: string) => sdp.split(/\r?\n/).filter((l) => !(l.startsWith("a=candidate") && / tcp /i.test(l))).join("\r\n").replace(/\r\n*$/, "\r\n");
const gathered = (pc: RTCPeerConnection, ms = 5000) => new Promise<void>((res) => {
  if (pc.iceGatheringState === "complete") return res();
  const t = setTimeout(res, ms);
  pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); res(); } });
});

/** One WebRTC peer connection with a single ordered DataChannel. Signaling is handled elsewhere. */
export class PeerLink {
  pc: RTCPeerConnection; dc: RTCDataChannel | null = null; private closed = false;
  onOpen: () => void = () => {}; onClose: () => void = () => {}; onData: (d: string | ArrayBuffer) => void = () => {};
  constructor(ice: IceConfig) {
    const servers: RTCIceServer[] = [{ urls: STUN }];
    if (ice.turn?.urls) servers.push({ urls: ice.turn.urls, username: ice.turn.username, credential: ice.turn.credential });
    this.pc = new RTCPeerConnection({ iceServers: servers });
    this.pc.ondatachannel = (e) => this.bind(e.channel);
    this.pc.onconnectionstatechange = () => { if (this.pc.connectionState === "failed" || this.pc.connectionState === "closed") this.close(); };
  }
  private bind(dc: RTCDataChannel) {
    this.dc = dc; dc.binaryType = "arraybuffer";
    dc.onopen = () => this.onOpen(); dc.onclose = () => this.close(); dc.onmessage = (e) => this.onData(e.data);
  }
  async makeOffer() {
    this.bind(this.pc.createDataChannel("q7", { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer()); await gathered(this.pc);
    return slim(this.pc.localDescription!.sdp);
  }
  async acceptOffer(sdp: string) {
    await this.pc.setRemoteDescription({ type: "offer", sdp });
    await this.pc.setLocalDescription(await this.pc.createAnswer()); await gathered(this.pc);
    return slim(this.pc.localDescription!.sdp);
  }
  acceptAnswer(sdp: string) { return this.pc.setRemoteDescription({ type: "answer", sdp }); }
  send(d: string | ArrayBuffer) { if (typeof d === "string") this.dc?.send(d); else this.dc?.send(d); }
  async drain() { while (this.dc && this.open && this.dc.bufferedAmount > 1_000_000) await new Promise((r) => setTimeout(r, 40)); }
  get open() { return this.dc?.readyState === "open"; }
  close() { if (this.closed) return; this.closed = true; try { this.dc?.close(); this.pc.close(); } catch {} this.onClose(); }
}
