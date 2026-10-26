import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportData, importData, loadAll, parseImport, purgeExpired, putConversation, putMessage, wipeAll } from "../lib/db";
import { LIFETIME_MS } from "../lib/time";
import { parseHttpsUrl, extractUrls } from "../lib/links";
import type { Conversation, Message } from "../lib/types";

const H = 3600_000;
const conv: Conversation = { id: "c1", mode: "local", title: "Notes", pinned: false, muted: false, archived: false, unread: 0 };
const msg = (id: string, createdAt: number, body = "hi"): Message => ({ id, conversationId: "c1", body, createdAt, expiresAt: createdAt + LIFETIME_MS });
const T0 = 1_800_000_000_000;

beforeEach(async () => { await wipeAll(); });

describe("local persistence and expiry", () => {
  it("keeps messages across reopening the database", async () => {
    await putConversation(conv); await putMessage(msg("m1", T0));
    const data = await loadAll(T0 + H); // each call opens a fresh connection, like a page refresh
    expect(data.conversations).toHaveLength(1);
    expect(data.messages.map((m) => m.id)).toEqual(["m1"]);
  });
  it("expires at exactly 72 hours", async () => {
    await putConversation(conv); await putMessage(msg("m1", T0));
    expect(await purgeExpired(T0 + LIFETIME_MS - 1)).toBe(0);
    expect((await loadAll(T0 + LIFETIME_MS - 1)).messages).toHaveLength(1);
    expect((await loadAll(T0 + LIFETIME_MS)).messages).toHaveLength(0); // hidden immediately
    expect(await purgeExpired(T0 + LIFETIME_MS)).toBe(1);               // and really deleted
  });
  it("cleans up on next launch after days offline", async () => {
    await putConversation(conv); await putMessage(msg("old", T0)); await putMessage(msg("new", T0 + 80 * H));
    const launch = T0 + 100 * H;
    expect(await purgeExpired(launch)).toBe(1);
    expect((await loadAll(launch)).messages.map((m) => m.id)).toEqual(["new"]);
  });
  it("never uses the network", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const xhr = vi.fn(); vi.stubGlobal("XMLHttpRequest", xhr);
    await putConversation(conv); await putMessage(msg("m1", T0)); await loadAll(T0); await exportData(T0); await purgeExpired(T0);
    expect(f).not.toHaveBeenCalled(); expect(xhr).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("deletes everything on wipe", async () => {
    await putConversation(conv); await putMessage(msg("m1", T0)); await wipeAll();
    const d = await loadAll(T0); expect(d.conversations).toHaveLength(0); expect(d.messages).toHaveLength(0);
  });
});

describe("import", () => {
  const file = (messages: unknown[]) => ({ app: "q7-message", format: 1, conversations: [conv], messages });
  it("recomputes expiry so it cannot be extended", () => {
    const r = parseImport(file([{ ...msg("m1", T0), expiresAt: T0 + 999 * H }]), T0 + H);
    expect(r.messages[0]!.expiresAt).toBe(T0 + LIFETIME_MS);
  });
  it("skips expired, invalid-link and unknown-chat messages", () => {
    const r = parseImport(file([
      msg("e", T0 - 100 * H),
      { ...msg("l", T0), link: { url: "http://example.com/a" } },
      { ...msg("x", T0), conversationId: "nope" },
      msg("ok", T0),
    ]), T0 + H);
    expect(r.messages.map((m) => m.id)).toEqual(["ok"]); expect(r.skipped).toBe(3);
  });
  it("rejects files from other apps", () => { expect(() => parseImport({ app: "x" }, T0)).toThrow(); });
  it("round-trips an export", async () => {
    await putConversation(conv); await putMessage(msg("m1", T0));
    const out = await exportData(T0 + H); await wipeAll();
    expect((await importData(out, T0 + H)).messages).toBe(1);
    expect((await loadAll(T0 + H)).messages).toHaveLength(1);
  });
});

describe("link validation", () => {
  it("accepts public https only", () => {
    expect(parseHttpsUrl("https://drive.google.com/file/d/1/view")).not.toBeNull();
    for (const bad of ["http://example.com", "javascript:alert(1)", "https://localhost/x", "https://192.168.1.4/x", "https://10.0.0.1", "https://user:pw@example.com", "https://[::1]/", "ftp://example.com"])
      expect(parseHttpsUrl(bad), bad).toBeNull();
  });
  it("extracts urls and trims trailing punctuation", () => {
    expect(extractUrls("see https://example.com/a, and http://nope.com")).toEqual(["https://example.com/a"]);
  });
});
