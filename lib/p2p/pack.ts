import { fromB64, toB64, utf8 } from "./crypto";
import type { Envelope } from "./crypto";

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const w = stream.writable.getWriter(); void w.write(data as unknown as BufferSource); void w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
/** Compact text form for QR codes, copy/paste and .q7invite files. */
export async function packEnvelope(e: Envelope) { return "Q7:" + toB64(await pipe(utf8(JSON.stringify(e)), new CompressionStream("deflate-raw"))); }
export async function unpackEnvelope(text: string): Promise<unknown> {
  const t = text.replace(/\s+/g, "");
  if (!t.startsWith("Q7:") || t.length > 40000) throw new Error("err.invalid");
  try { return JSON.parse(new TextDecoder().decode(await pipe(fromB64(t.slice(3)), new DecompressionStream("deflate-raw")))); }
  catch { throw new Error("err.invalid"); }
}
