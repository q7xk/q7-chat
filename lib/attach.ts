import type { Attachment } from './types';
import { cleanName, codeOfPub, fromB64 } from './p2p/crypto';

export const MAX_FILE = 50 * 1024 * 1024;
export const CHUNK = 16 * 1024;
const IMG = /^image\/(png|jpeg|gif|webp|avif)$/;
const VID = /^video\/(mp4|webm|ogg|quicktime)$/;

export const safeName = (n: string) =>
  n
    .replace(/[\\/:*?"<>|\u0000-\u001f\u202a-\u202e]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 100) || 'file';

/** Re-encodes still images to JPEG (drops EXIF/GPS) and caps the size. Animated GIFs are sent as they are. */
export async function prepareImage(file: File): Promise<{ att: Attachment; blob: Blob }> {
  if (file.size > MAX_FILE) throw new Error('attach.tooBig');
  if (!IMG.test(file.type)) throw new Error('attach.badImage');
  if (file.type === 'image/gif')
    return {
      att: {
        t: 'file',
        kind: 'image',
        name: safeName(file.name),
        mime: file.type,
        size: file.size,
      },
      blob: file,
    };
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((res, rej) =>
      c.toBlob(b => (b ? res(b) : rej()), 'image/jpeg', 0.85)
    );
    return {
      att: {
        t: 'file',
        kind: 'image',
        name: safeName(file.name).replace(/\.\w+$/, '') + '.jpg',
        mime: 'image/jpeg',
        size: blob.size,
      },
      blob,
    };
  } catch {
    throw new Error('attach.badImage');
  }
}
export function prepareDocument(file: File): { att: Attachment; blob: Blob } {
  if (file.size > MAX_FILE) throw new Error('attach.tooBig');
  if (file.size === 0) throw new Error('err.generic');
  return {
    att: {
      t: 'file',
      kind: 'document',
      name: safeName(file.name),
      mime: 'application/octet-stream',
      size: file.size,
    },
    blob: file,
  };
}

export async function prepareVideo(file: File): Promise<{ att: Attachment; blob: Blob }> {
  if (file.size > MAX_FILE) throw new Error('attach.tooBig');
  if (!VID.test(file.type)) throw new Error('attach.badVideo');
  // Best-effort thumbnail; keep original bytes (re-encoding video in-browser is expensive).
  let thumb: string | undefined;
  let dur: number | undefined;
  try {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej();
    });
    dur = Number.isFinite(v.duration) ? Math.max(1, Math.round(v.duration)) : undefined;
    try {
      v.currentTime = Math.min(0.1, Math.max(0, (v.duration || 0) / 10));
      await new Promise<void>(res => {
        v.onseeked = () => res();
        setTimeout(res, 500);
      });
    } catch {}
    const c = document.createElement('canvas');
    const k = Math.min(1, 320 / Math.max(v.videoWidth || 320, v.videoHeight || 320));
    c.width = Math.max(1, Math.round((v.videoWidth || 320) * k));
    c.height = Math.max(1, Math.round((v.videoHeight || 320) * k));
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    thumb = c.toDataURL('image/jpeg', 0.7);
    URL.revokeObjectURL(url);
  } catch {
    /* ignore thumbnail failures */
  }
  return {
    att: {
      t: 'file',
      kind: 'video',
      name: safeName(file.name),
      mime: file.type,
      size: file.size,
      ...(dur ? { dur } : {}),
      ...(thumb ? { thumb } : {}),
    },
    blob: file,
  };
}
/** Picks the best voice codec the browser offers; Chrome=webm/opus, Safari=mp4/aac, Firefox=ogg/opus. */
export function pickVoiceMime(): string {
  const list = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mp4;codecs=aac',
    'audio/webm',
    'audio/mp4',
  ];
  return (
    list.find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? ''
  );
}
export const prepareVoice = (blob: Blob, dur: number): { att: Attachment; blob: Blob } => ({
  att: {
    t: 'file',
    kind: 'voice',
    name: `voice-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`,
    mime: blob.type || 'audio/webm',
    size: blob.size,
    dur: Math.max(1, Math.round(dur)),
  },
  blob,
});
/** Square 160px JPEG data URL for profile photos. */
export async function prepareAvatar(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  c.getContext('2d')!.drawImage(
    bmp,
    (bmp.width - s) / 2,
    (bmp.height - s) / 2,
    s,
    s,
    0,
    0,
    160,
    160
  );
  return c.toDataURL('image/jpeg', 0.8);
}
export const validAvatar = (v: unknown): v is string =>
  typeof v === 'string' && v.length < 60_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v);

/** GIFs ride as plain https URLs; only GIPHY media hosts are accepted to keep the frame small and predictable. */
export const GIF_HOST = /(^(https:)?\/\/(media|i)\.giphy\.com\/|media\.tenor\.com)/;
export const validGifUrl = (u: unknown): u is string =>
  typeof u === 'string' && u.length < 500 && /^https:\/\/[^\s"]+$/.test(u) && GIF_HOST.test(u);

const num = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates an attachment received from a peer. Votes are never accepted here; they arrive in their own frames. */
export async function cleanAtt(a: unknown): Promise<Attachment | null> {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  switch (o.t) {
    case 'file': {
      if (
        (o.kind !== 'image' &&
          o.kind !== 'document' &&
          o.kind !== 'voice' &&
          o.kind !== 'video') ||
        !str(o.name, 100) ||
        !num(o.size, 1, MAX_FILE)
      )
        return null;
      if ((o.kind === 'voice' || o.kind === 'video') && o.dur !== undefined && !num(o.dur, 1, 7200))
        return null;
      const mime = typeof o.mime === 'string' ? o.mime : '';
      // documents are never trusted with a sender-supplied type; voice/video keep strict allow-lists so blobs replay safely
      const safeMime =
        o.kind === 'voice' && /^audio\/(webm|ogg|mp4|aac|mpeg)/.test(mime)
          ? mime
          : o.kind === 'image' && IMG.test(mime)
            ? mime
            : o.kind === 'video' && VID.test(mime)
              ? mime
              : 'application/octet-stream';
      const thumb =
        (o.kind === 'video' || o.kind === 'image') &&
        typeof o.thumb === 'string' &&
        o.thumb.length < 60_000 &&
        /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(o.thumb)
          ? o.thumb
          : undefined;
      return {
        t: 'file',
        kind: o.kind,
        name: safeName(o.name as string),
        size: o.size as number,
        dur: o.kind === 'voice' || o.kind === 'video' ? (o.dur as number | undefined) : undefined,
        mime: safeMime,
        ...(thumb ? { thumb } : {}),
      };
    }
    case 'gif':
      if (!validGifUrl(o.url) || !num(o.w, 16, 2000) || !num(o.h, 16, 2000)) return null;
      return { t: 'gif', url: o.url as string, w: o.w as number, h: o.h as number };
    case 'sticker': {
      if (!str(o.pack, 64) || !str(o.id, 64)) return null;
      const url =
        typeof o.url === 'string' &&
        o.url.length < 500 &&
        (/^https:\/\/[^\s"]+$/.test(o.url) && GIF_HOST.test(o.url) ||
          /^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(o.url))
          ? o.url
          : undefined;
      const emoji = typeof o.emoji === 'string' && o.emoji.length <= 8 ? o.emoji : undefined;
      return { t: 'sticker', pack: o.pack as string, id: o.id as string, ...(url ? { url } : {}), ...(emoji ? { emoji } : {}) };
    }
    case 'location':
      return num(o.lat, -90, 90) && num(o.lon, -180, 180)
        ? {
            t: 'location',
            lat: o.lat as number,
            lon: o.lon as number,
            ...(o.live === true ? { live: true } : {}),
            ...(num(o.until, 0, 8.64e15) ? { until: o.until as number } : {}),
          }
        : null;
    case 'contact': {
      if (!str(o.name, 80) || typeof o.pub !== 'string' || typeof o.code !== 'string') return null;
      try {
        if (fromB64(o.pub).length !== 65 || (await codeOfPub(o.pub)) !== o.code) return null;
      } catch {
        return null;
      }
      return { t: 'contact', name: cleanName(o.name as string), code: o.code, pub: o.pub };
    }
    case 'poll':
      if (
        !str(o.q, 200) ||
        !Array.isArray(o.opts) ||
        o.opts.length < 2 ||
        o.opts.length > 6 ||
        !o.opts.every(x => str(x, 100) && x)
      )
        return null;
      return {
        t: 'poll',
        q: o.q as string,
        opts: o.opts as string[],
        multi: o.multi === true,
        votes: {},
        ...(o.anonymous === true ? { anonymous: true } : {}),
      };
    case 'event': {
      if (
        !str(o.title, 100) ||
        !num(o.start, 0, 8.64e15) ||
        (o.place !== undefined && !str(o.place, 100)) ||
        (o.note !== undefined && !str(o.note, 300))
      )
        return null;
      const rsvp: Record<string, 'yes' | 'no' | 'maybe'> = {};
      if (isObj(o.rsvp)) {
        for (const [k, v] of Object.entries(o.rsvp).slice(0, 200)) {
          if (/^[\w-]{1,64}$/.test(k) && (v === 'yes' || v === 'no' || v === 'maybe')) rsvp[k] = v;
        }
      }
      return {
        t: 'event',
        title: o.title as string,
        start: o.start as number,
        place: o.place as string | undefined,
        note: o.note as string | undefined,
        ...(Object.keys(rsvp).length ? { rsvp } : {}),
        ...(num(o.reminderAt, 0, 8.64e15) ? { reminderAt: o.reminderAt as number } : {}),
      };
    }
    default:
      return null;
  }
}
export const validVote = (c: unknown, n: number, multi: boolean): c is number[] =>
  Array.isArray(c) &&
  c.length <= (multi ? n : 1) &&
  c.every(i => Number.isInteger(i) && i >= 0 && i < n) &&
  new Set(c).size === c.length;
