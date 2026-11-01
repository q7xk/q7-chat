import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createStoredIdentity, loadIdentity } from "../lib/p2p/crypto";
import {
  addTombstone, buildWireSnapshot, decodeSnapshot, encodeSnapshot, MAX_WIRE_BYTES, mergeSync,
  sanitizeSnapshot, syncKey, syncTopic, type SyncSnapshot, type SyncState,
} from "../lib/sync";
import { LIFETIME_MS } from "../lib/time";
import type { Contact, Conversation, Message } from "../lib/types";

const NOW = 1_800_000_000_000;
const H = 3600_000;
const DEV = "0123456789abcdef";
const conv = (id: string, syncAt = NOW - H): Conversation => ({ id, mode: "local", title: "Chat " + id, pinned: false, muted: false, archived: false, unread: 0, syncAt });
const msg = (id: string, cid: string, body: string, createdAt = NOW - H, syncAt = createdAt): Message => ({ id, conversationId: cid, body, createdAt, expiresAt: createdAt + LIFETIME_MS, syncAt });
const state = (x: Partial<SyncState> = {}): SyncState => ({ conversations: [], messages: [], contacts: [], tombstones: [], ...x });
const snap = (x: Partial<SyncSnapshot> = {}): SyncSnapshot => ({ v: 1, device: DEV, at: NOW, conversations: [], messages: [], contacts: [], tombstones: [], ...x });

describe("multi-device merge", () => {
  it("adds new records and lets a newer edit win", () => {
    const local = state({ conversations: [conv("c1")], messages: [msg("m1", "c1", "old", NOW - 2 * H)] });
    const incoming = snap({
      conversations: [conv("c1")],
      messages: [msg("m1", "c1", "edited", NOW - 2 * H, NOW - 1000), msg("m2", "c1", "new", NOW - 500)],
    });
    const r = mergeSync(local, incoming, NOW);
    expect(r.changed).toBe(true);
    expect(r.state.messages.find((m) => m.id === "m1")!.body).toBe("edited");
    expect(r.state.messages.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  it("ignores an older edit", () => {
    const local = state({ conversations: [conv("c1")], messages: [msg("m1", "c1", "new", NOW - 2 * H, NOW - 1000)] });
    const incoming = snap({ conversations: [conv("c1")], messages: [msg("m1", "c1", "stale", NOW - 2 * H, NOW - 5000)] });
    const r = mergeSync(local, incoming, NOW);
    expect(r.changed).toBe(false);
    expect(r.state.messages[0]!.body).toBe("new");
  });

  it("applies tombstones so a stale device cannot resurrect a deleted message", () => {
    const local = state({ conversations: [conv("c1")], messages: [msg("m1", "c1", "gone", NOW - 2 * H, NOW - 2 * H)] });
    const incoming = snap({ conversations: [conv("c1")], tombstones: [{ kind: "msg", id: "m1", at: NOW - 1000 }] });
    const r = mergeSync(local, incoming, NOW);
    expect(r.state.messages).toHaveLength(0);
    expect(r.state.tombstones).toHaveLength(1);
  });

  it("keeps a message edited after the tombstone", () => {
    const local = state({ conversations: [conv("c1")], messages: [msg("m1", "c1", "newer", NOW - 2 * H, NOW - 100)] });
    const incoming = snap({ conversations: [conv("c1")], tombstones: [{ kind: "msg", id: "m1", at: NOW - 1000 }] });
    const r = mergeSync(local, incoming, NOW);
    expect(r.state.messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("deletes a whole conversation and its messages", () => {
    const local = state({ conversations: [conv("c1")], messages: [msg("m1", "c1", "x", NOW - 2 * H, NOW - 2 * H)] });
    const incoming = snap({ conversations: [conv("c1")], tombstones: [{ kind: "conv", id: "c1", at: NOW - 1000 }] });
    const r = mergeSync(local, incoming, NOW);
    expect(r.state.conversations).toHaveLength(0);
    expect(r.state.messages).toHaveLength(0);
  });

  it("prunes expired messages and old tombstones", () => {
    const local = state();
    const incoming = snap({
      conversations: [conv("c1")],
      messages: [msg("old", "c1", "x", NOW - LIFETIME_MS - H)],
      tombstones: [{ kind: "msg", id: "old", at: NOW - LIFETIME_MS - H }],
    });
    const r = mergeSync(local, incoming, NOW);
    expect(r.state.messages).toHaveLength(0);
    expect(r.state.tombstones).toHaveLength(0);
  });
});

describe("snapshot validation and wire format", () => {
  it("derives a stable self-ECDH key and topic from the identity", async () => {
    const stored = await createStoredIdentity();
    const a = await loadIdentity(stored), b = await loadIdentity(stored);
    const ka = await syncKey(a), kb = await syncKey(b);
    expect(ka).toBeTruthy();
    expect(ka).toBe(kb);
    expect(await syncTopic(a)).toBe(await syncTopic(b));
    expect(await syncTopic(a)).toContain("q7/v1/s/");
  });

  it("round-trips a sealed snapshot and rejects another key", async () => {
    const stored = await createStoredIdentity();
    const key = (await syncKey(await loadIdentity(stored)))!;
    const other = (await syncKey(await loadIdentity(await createStoredIdentity())))!;
    const bytes = await encodeSnapshot(key, snap({ conversations: [conv("c1")], messages: [msg("m1", "c1", "secret")] }));
    expect(await decodeSnapshot(key, bytes)).not.toBeNull();
    expect(await decodeSnapshot(other, bytes)).toBeNull();
  });

  it("rejects malformed and stale snapshots", () => {
    expect(sanitizeSnapshot({ v: 1, device: "xyz", at: NOW, conversations: [], messages: [], contacts: [] }, NOW)).toBeNull();
    expect(sanitizeSnapshot({ v: 1, device: DEV, at: NOW - 30 * 24 * H, conversations: [], messages: [], contacts: [] }, NOW)).toBeNull();
    expect(sanitizeSnapshot(snap(), NOW)?.device).toBe(DEV);
  });

  it("never accepts Local Mode conversations from another device", () => {
    const localConv: Conversation = { ...conv("c1"), mode: "local" };
    const cleaned = sanitizeSnapshot(snap({ conversations: [localConv], messages: [msg("m1", "c1", "note")] }), NOW);
    expect(cleaned).not.toBeNull();
    expect(cleaned!.conversations).toHaveLength(0);
    expect(cleaned!.messages).toHaveLength(0);
  });

  it("trims the oldest messages to fit the relay budget", async () => {
    const stored = await createStoredIdentity();
    const key = (await syncKey(await loadIdentity(stored)))!;
    const c = conv("c1");
    const messages = Array.from({ length: 2000 }, (_, i) => msg("m" + i, "c1", "x".repeat(300), NOW - 2000 * 1000 + i * 1000, NOW - 2000 * 1000 + i * 1000));
    const { bytes, snapshot, partial } = await buildWireSnapshot(key, DEV, state({ conversations: [c], messages }), NOW);
    expect(bytes.length).toBeLessThanOrEqual(MAX_WIRE_BYTES);
    expect(partial).toBe(true);
    expect(snapshot.messages.length).toBeLessThan(messages.length);
    // newest messages survive
    expect(snapshot.messages.at(-1)!.id).toBe("m1999");
  });

  it("drops contact photos before exceeding the relay budget", async () => {
    const stored = await createStoredIdentity();
    const key = (await syncKey(await loadIdentity(stored)))!;
    const photo = "data:image/png;base64," + "A".repeat(300_000);
    const contacts: Contact[] = Array.from({ length: 3 }, (_, i) => ({
      id: "c" + i, pub: "pub" + i, name: "Contact " + i, code: "123456789012", addedAt: NOW - H, verified: false, photo,
    }));
    const { bytes, snapshot, partial } = await buildWireSnapshot(key, DEV, state({ contacts }), NOW);
    expect(bytes.length).toBeLessThanOrEqual(MAX_WIRE_BYTES);
    expect(partial).toBe(true);
    expect(snapshot.contacts.every((c) => !c.photo)).toBe(true);
    expect(snapshot.contacts).toHaveLength(contacts.length);
  });

  it("caps conversations so the receiver still validates the snapshot", async () => {
    const stored = await createStoredIdentity();
    const key = (await syncKey(await loadIdentity(stored)))!;
    const conversations: Conversation[] = Array.from({ length: 600 }, (_, i) => ({ ...conv("c" + i, NOW - i * 1000), mode: "p2p", contactId: "x" }));
    const { snapshot, partial } = await buildWireSnapshot(key, DEV, state({ conversations }), NOW);
    expect(partial).toBe(true);
    expect(snapshot.conversations).toHaveLength(500);
    const bytes = await encodeSnapshot(key, snapshot);
    const decoded = await decodeSnapshot(key, bytes);
    expect(decoded).not.toBeNull();
    expect(sanitizeSnapshot(decoded, NOW)!.conversations).toHaveLength(500);
  });

  it("adds and replaces tombstones", () => {
    let list = addTombstone([], "msg", "m1", NOW);
    list = addTombstone(list, "msg", "m1", NOW + 1);
    expect(list).toHaveLength(1);
    expect(list[0]!.at).toBe(NOW + 1);
  });
});
