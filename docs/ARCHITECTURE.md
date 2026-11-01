# Architecture

This document explains how the Q7 Chat codebase is put together. For the wire protocol itself, read [PROTOCOL.md](../PROTOCOL.md).

## Goals

Q7 Chat is a client-only messenger with four hard constraints:

1. **No application server.** Everything runs in the browser; static hosting or a Next.js host is enough.
2. **Local-first data.** Identity, conversations, contacts and attachments live in IndexedDB.
3. **End-to-end encryption.** Relays carry ciphertext and hashed topics only.
4. **Bounded retention.** Messages expire after 72 hours and are purged locally.

A fifth, non-technical constraint: the UI should stay understandable and auditable. There is no plugin or extension runtime. Features are compiled into the app.

## Runtime layers

```text
┌──────────────────────────────────────────────────────────────┐
│ app/page.tsx                                                 │
│  I18nProvider → StoreProvider → LockGate → P2PProvider → Shell│
└──────────────────────────────────────────────────────────────┘
         │                │              │
         ▼                ▼              ▼
   lib/i18n.tsx     lib/store.tsx    lib/p2p/context.tsx
                         │              │
                         ▼              ▼
                     lib/db.ts     lib/p2p/manager.ts
                                        │
                         ┌──────────────┼──────────────┐
                         ▼              ▼              ▼
                     q7rp.ts         rtc.ts         mqtt.ts
                         │              │              │
                         └──────────► crypto.ts ◄──────┘
```

### `app/`

Next.js App Router entry points.

- `page.tsx` composes the providers and renders `<Shell />`.
- `layout.tsx` defines metadata, the font and the document shell.
- `help/` and `learn/` are static documentation routes.
- `globals.css` contains Tailwind layers and CSS variables for themes.

### `components/`

Presentation and interaction. Most components are client components. Major pieces:

| Component | Responsibility |
| --- | --- |
| `Shell.tsx` | Rail and mobile navigation, view routing, notifications, sidebar lists |
| `ChatList.tsx` | Conversation filtering, search, unread and pin state |
| `Thread.tsx` | Message rendering, expiry, delivery state, reactions, replies |
| `Composer.tsx` | Text, attachments, voice recording, emoji/GIF pickers |
| `Connect.tsx` | Code/QR/file pairing, incoming requests |
| `Contacts.tsx` | Contacts, safety numbers, blocking, contact cards |
| `Devices.tsx` | Linked device list and QR-based device linking |
| `Settings.tsx` | Profile, notifications, media, look, accessibility, restrictions, privacy, vault |
| `Lock.tsx` | Vault unlock screen and idle re-lock |
| `Onboarding.tsx` | First-run identity setup |
| `ChatMenu.tsx` | Per-conversation actions (pin, mute, archive, clear, delete) |
| `GroupDialog.tsx` | Group creation and member selection |
| `Scanner.tsx` | Camera-based QR scanning |

### `lib/`

Shared application logic.

| Module | Responsibility |
| --- | --- |
| `types.ts` | Domain types: conversations, messages, contacts, attachments, settings |
| `db.ts` | IndexedDB schema, CRUD, purge, import/export |
| `store.tsx` | React state for conversations, messages, settings and spaces; sync notifier |
| `backup.ts` | Encrypted `.q7b` export, decryption and strict payload validation |
| `sync.ts` | Multi-device snapshot sealing, last-writer-wins merge and tombstones |
| `vault.ts` | Password-derived key wrapping, sealed identity, TOTP |
| `attach.ts` | File limits, image re-encoding, attachment validation |
| `i18n.tsx` | Language detection, dictionaries, formatting helpers |
| `theme.ts` | Theme and accent color application |
| `links.ts` | HTTPS URL parsing and safe link previews |
| `time.ts` | 72-hour lifetime constant |
| `names.ts` | Display-name cleaning |
| `cn.ts` | Class-name helper |

### `lib/p2p/`

The protocol implementation.

| Module | Responsibility |
| --- | --- |
| `crypto.ts` | Identity generation, signing, envelopes, ECDH sessions, safety numbers |
| `q7rp.ts` | Pairwise key derivation, signed relay frames, replay window, topic derivation |
| `mqtt.ts` | Minimal MQTT 3.1.1 client over WebSocket Secure, per-relay health and jittered backoff |
| `rtc.ts` | WebRTC peer connection, DataChannel, ICE/STUN/TURN |
| `manager.ts` | State machine: identity, pairing, connections, outbox, mailbox, groups, delivery |
| `context.tsx` | React provider exposing `{ snap, mgr }` |
| `pack.ts` | Frame packing helpers |

## Storage model

IndexedDB database: `q7-local`, version 3.

| Store | Key | Contents |
| --- | --- | --- |
| `local_conversations` | `id` | Conversation metadata |
| `local_messages` | `id` | Messages, indexed by `conversationId` and `expiresAt` |
| `local_settings` | `key` | Flags such as `seeded`, `spaces`, vault metadata, `sync-device-id`, `sync-tombstones` |
| `p2p_contacts` | `id` | Contacts, including public keys and safety metadata |
| `p2p_identity` | `key` | Device key pair (unless sealed by a vault) |
| `local_blobs` | `id` | Attachment bytes, keyed by message id, indexed by `expiresAt` |

Expiry is enforced in three places:

1. **Read path** — `store.tsx` filters messages whose `expiresAt <= now`.
2. **Startup** — `purgeExpired()` and `purgeBlobs()` run before loading data.
3. **Timer** — a 30-second interval purges expired records and blobs.

Messages are created with `expiresAt = createdAt + 72h` in `lib/store.tsx`. Incoming protocol frames are validated and then given the same treatment; a peer cannot extend a message's life.

## Identity and pairing

1. `manager.ts` loads or creates a `StoredIdentity` from `crypto.ts`.
2. The identity contains an ECDSA P-256 signing key and an ECDH P-256 static key.
3. `fingerprint = sha256(signPublicKey)`; the Q7 code is derived from the first 6 bytes.
4. Pairing uses a sealed offer/answer exchange over MQTT topics derived from the code.
5. Both sides derive a pairwise key from static ECDH keys (`q7rp.ts`).
6. A WebRTC DataChannel may be established for direct, forward-secret transport.
7. Any frame that cannot go direct is sealed and signed, then published to relay topics.

## Message flow

```text
Composer
  └─ store.send()
       ├─ writes message + blob to IndexedDB
       └─ calls manager.send()
            ├─ direct DataChannel if open
            └─ otherwise Q7RP frame → MQTT relay(s)
                                      └─ receiver mailbox
                                           ├─ validates signature/replay
                                           ├─ writes to IndexedDB
                                           └─ sends signed ACK
```

The sender tracks `queued`, `sent`, `delivered` and `seen` states where the transport supports them. Delivery receipts are signed and verified before retained relay copies are cleared.

## Groups

Groups are conversation objects with `mode: "group"` and a member list of fingerprints. The creator generates a stable group id and invites each member with a `g-invite` frame. Membership changes are `g-meta` frames fanned out to current members. Group messages are sent to each member's pairwise channel; the group id is included so receivers can route them.

Groups are best-effort: there is no central authority, no consistency protocol and no guarantee that every member sees the same membership state at the same time.

## Vault

`vault.ts` wraps the identity at rest:

1. Generate a random 16-byte salt and a random master key.
2. Derive a key-encryption key from the password with PBKDF2-SHA256 (310,000 iterations).
3. Seal the master key with the KEK and store the wrapped blob.
4. Seal the identity (and optionally the TOTP secret) with the master key.
5. Delete the plaintext identity from IndexedDB.

Unlocking reverses the process in memory. The password is never stored or transmitted. Idle re-lock is implemented by remounting the app tree in `LockGate`.

## Encrypted backup

`backup.ts` exports a single `.q7b` file:

1. Collect live conversations, messages, contacts, settings, spaces, linked-device metadata and either the plaintext identity (no vault) or the sealed vault copy.
2. Serialise, gzip where the platform supports it, and seal with AES-256-GCM under a key derived from the user's password with PBKDF2-SHA256 (600,000 iterations, 16-byte salt).
3. Store the KDF algorithm, iteration count and salt in a clear header so old files remain readable if the cost is raised.

Import validates the header bounds, authenticates the whole payload with GCM, then re-validates every conversation, message, contact, link, attachment descriptor and identity field. Expiry is recomputed from `createdAt`; a backup cannot extend a message's life. Attachments are excluded by design.

## Multi-device sync

Linked devices share the same identity key pair, so each can compute a static ECDH of its private key with its own public key. That self-ECDH secret is used to seal a compact state snapshot with AES-GCM and to derive the sync topic, so a contact who knows the public identity still cannot discover or overwrite the topic. The snapshot is published as a **retained** MQTT message, so a device that comes online later receives the latest state from the broker.

Merging is last-writer-wins per record using `syncAt` (falling back to `createdAt`/`addedAt`). Deletions become 72-hour tombstones, which prevent a stale device from resurrecting a message. After a merge the receiving device republishes its merged view, so concurrent edits converge. Local Mode conversations are excluded: the welcome screen promises they stay in that browser. Snapshots are capped below 200 KB; older messages are trimmed first and the snapshot is marked `partial`. The encrypted backup remains the complete archive.

Sync is best-effort by nature: a broker that discards retained messages, or a device that never overlaps with its peer, can leave state temporarily divergent. No server holds a plaintext log.

## Security boundaries

- **Trusted:** the browser, the app origin, the user's device and the user's password.
- **Untrusted:** relays, network observers, other contacts, arbitrary incoming frames.
- **Validated at the boundary:** all incoming frames, attachment metadata, URLs, names, message bodies and group membership changes.
- **Not defended:** a compromised browser, a malicious extension with page access, or a host that serves modified JavaScript.

## Design trade-offs

- **Relay privacy vs. offline delivery.** Retained mailbox copies improve delivery but keep ciphertext on brokers until acknowledged. The pairwise key is long-lived, so relay-mode messages do not have forward secrecy.
- **No server vs. multi-device sync.** Sync uses retained, sealed snapshots instead of an account server. This converges without plaintext storage, but a 200 KB cap can make very large histories partial.
- **Local-first vs. recoverability.** If the browser storage is cleared and there is no encrypted backup, the identity and history are gone.
- **Custom protocol vs. standards.** The protocol is small enough to audit in one sitting, but it has not been independently reviewed. See [SECURITY-AUDIT.md](SECURITY-AUDIT.md).
