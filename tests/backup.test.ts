import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createStoredIdentity } from "../lib/p2p/crypto";
import * as db from "../lib/db";
import * as backup from "../lib/backup";
import { LIFETIME_MS } from "../lib/time";
import type { Contact, Conversation, Message } from "../lib/types";

const H = 3600_000;
const T0 = 1_800_000_000_000;
const PASSWORD = "correct horse battery";

const conv: Conversation = { id: "c1", mode: "local", title: "Notes", pinned: false, muted: false, archived: false, unread: 0 };
const dm: Conversation = { id: "c2", mode: "p2p", title: "Ada", contactId: "a1", pinned: true, muted: false, archived: false, unread: 2 };
const msg = (id: string, body: string, createdAt = T0): Message => ({ id, conversationId: "c1", body, createdAt, expiresAt: createdAt + LIFETIME_MS });
const contact: Contact = { id: "a1", pub: "pub", name: "Ada", code: "123456789012", addedAt: T0, verified: true };

beforeEach(async () => {
  await db.wipeAll();
  await db.delFlag("last-backup-at");
});

describe("encrypted backup", () => {
  it("round-trips conversations, messages, contacts, settings and identity", async () => {
    const identity = await createStoredIdentity();
    await db.putIdentity(identity);
    await db.putConversation(conv); await db.putConversation(dm);
    await db.putMessage(msg("m1", "hello secret"));
    await db.putContact(contact);
    await db.setFlag("p2p-settings", { name: "Q7", relayEnabled: true });
    await db.setFlag("spaces", [{ id: "s1", name: "Work", hue: 10, members: ["a1"] }]);

    const file = await backup.exportBackup(PASSWORD, { now: T0 + H });
    const raw = JSON.parse(file) as backup.BackupFile;
    expect(raw.format).toBe(2);
    expect(raw.kdf.alg).toBe("PBKDF2-SHA256");
    expect(raw.kdf.iterations).toBe(backup.DEFAULT_ITERATIONS);
    expect(file).not.toContain("hello secret");
    expect(file).not.toContain(identity.privJwk.d!);

    await db.wipeAll();
    const { payload, summary } = await backup.readBackup(file, PASSWORD, T0 + H);
    expect(summary.messages).toBe(1);
    expect(payload.conversations.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    expect(payload.identity?.pub).toBe(identity.pub);

    const r = await backup.restoreBackup(payload, { replaceIdentity: true, now: T0 + H });
    expect(r.identity).toBe(true);
    expect((await db.loadAll(T0 + H)).messages.map((m) => m.body)).toEqual(["hello secret"]);
    expect((await db.getContacts()).map((c) => c.name)).toEqual(["Ada"]);
    expect((await db.getIdentity())?.pub).toBe(identity.pub);
    expect((await db.getFlag("spaces")) as unknown[]).toHaveLength(1);
  });

  it("rejects a wrong password and a tampered file", async () => {
    await db.putConversation(conv); await db.putMessage(msg("m1", "x"));
    const file = await backup.exportBackup(PASSWORD, { now: T0 + H });
    await expect(backup.readBackup(file, "wrong password", T0 + H)).rejects.toThrow("err.backup.password");

    const raw = JSON.parse(file) as backup.BackupFile;
    const bytes = raw.data.split("");
    bytes[10] = bytes[10] === "A" ? "B" : "A";
    raw.data = bytes.join("");
    await expect(backup.readBackup(JSON.stringify(raw), PASSWORD, T0 + H)).rejects.toThrow("err.backup.password");
  });

  it("never restores expired messages and recomputes the 72-hour lifetime", async () => {
    await db.putConversation(conv);
    await db.putMessage({ ...msg("old", "gone", T0 - 100 * H), expiresAt: T0 + 999 * H });
    await db.putMessage({ ...msg("new", "here", T0), expiresAt: T0 + 999 * H });
    const file = await backup.exportBackup(PASSWORD, { now: T0 + H });
    const { payload } = await backup.readBackup(file, PASSWORD, T0 + H);
    expect(payload.messages.map((m) => m.id)).toEqual(["new"]);
    expect(payload.messages[0]!.expiresAt).toBe(T0 + LIFETIME_MS);
  });

  it("does not replace an existing identity unless asked", async () => {
    const identity = await createStoredIdentity();
    await db.putIdentity(identity);
    await db.putConversation(conv); await db.putMessage(msg("m1", "hi"));
    const file = await backup.exportBackup(PASSWORD, { now: T0 + H });
    const { payload } = await backup.readBackup(file, PASSWORD, T0 + H);

    const other = await createStoredIdentity();
    await db.putIdentity(other);
    const r = await backup.restoreBackup(payload, { replaceIdentity: false, now: T0 + H });
    expect(r.identity).toBe(false);
    expect((await db.getIdentity())?.pub).toBe(other.pub);
  });

  it("never rolls back a newer local row when restoring an older backup", async () => {
    await db.putConversation({ ...conv, syncAt: T0 + 5000 });
    await db.putMessage({ ...msg("m1", "newer local"), syncAt: T0 + 5000 });
    const payload: backup.BackupPayload = {
      v: 1, exportedAt: T0, conversations: [{ ...conv, syncAt: T0 }],
      messages: [{ ...msg("m1", "older backup"), syncAt: T0 }], contacts: [], blobsIncluded: false,
    };
    const r = await backup.restoreBackup(payload, { now: T0 + H });
    expect(r.conversations).toBe(0);
    expect(r.messages).toBe(0);
    const stored = await db.loadAll(T0 + H);
    expect(stored.messages[0]!.body).toBe("newer local");
  });

  it("enforces the password policy and file magic", async () => {
    await expect(backup.exportBackup("short", { now: T0 })).rejects.toThrow("err.backup.short");
    await expect(backup.readBackup("{}", PASSWORD, T0)).rejects.toThrow("err.backup.file");
    await expect(backup.readBackup("not json", PASSWORD, T0)).rejects.toThrow("err.backup.file");
  });
});
