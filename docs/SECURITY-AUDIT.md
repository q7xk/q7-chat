# Security audit status and readiness

**Status: no independent security audit has been completed.**

Q7 Chat is an experimental, custom messenger. A self-review, automated tests and a
documented threat model are useful, but they are **not** an independent audit and
must never be presented as one. This page records what has been reviewed
internally, what remains unknown, and what an external auditor should examine.

Last updated: 2026-11-01 · version 0.2.0

## Why this cannot be "closed" in code

An independent audit is performed by a qualified third party who did not write the
protocol. It produces a scoped report, findings and a retest. Adding a checklist,
a badge or a statement to the README does not create an audit. Only an external
report can change the status below.

| Item | Status | Evidence |
| --- | --- | --- |
| Encrypted local backup | Implemented, internal tests | `lib/backup.ts`, `tests/backup.test.ts` |
| Multi-device message sync | Implemented, internal tests | `lib/sync.ts`, `tests/sync.test.ts` |
| Relay continuity | Improved; public relays remain best-effort | `lib/p2p/mqtt.ts`, `deploy/relay/` |
| Independent protocol review | **Not done** | This document |
| Independent implementation review | **Not done** | This document |

## Scope for an external review

1. **Identity and key management** — `lib/p2p/crypto.ts`, `lib/vault.ts`
   - ECDSA P-256 identity, ECDH P-256 static key, fingerprint → 12-digit code.
   - Salted PBKDF2-SHA256 (310k for the vault, 600k for backups), AES-256-GCM,
     KDF parameters stored in the header.
   - Sealed identity at rest, TOTP, idle lock, password rotation, wipe.
2. **Q7RP v2 protocol** — `lib/p2p/q7rp.ts`, `lib/p2p/manager.ts`, `PROTOCOL.md`
   - Pairing paths (code, QR, invite file/text, device adoption), signed frames,
     replay windows, mailbox topics, group fan-out, acknowledgements and retries.
3. **Multi-device sync** — `lib/sync.ts`, manager integration
   - Self-ECDH key derivation, retained MQTT snapshot, LWW timestamps,
     tombstones, replay/stale-snapshot handling, size trimming.
4. **Backup format** — `lib/backup.ts`
   - Header parsing, KDF bounds, AES-GCM authentication, payload validation,
     identity replacement policy, expiry handling, attachment exclusion.
5. **Web surface** — `next.config.mjs`, attachment handling, link previews,
   CSP, IndexedDB and service-worker boundaries.
6. **Relay deployment** — `deploy/relay/`
   - TLS termination, WebSocket proxying, anonymous access model, persistence.

## Assets and threat model (summary)

**Assets:** identity private keys, ECDH private key, vault password, message
plaintext, contact graph, attachment blobs, backup files, group membership.

**Adversaries in scope:**

- A passive or active relay operator (can drop, delay, replay, reorder).
- A network attacker without endpoint compromise.
- A malicious peer who knows a Q7 code or obtains an invite.
- A thief with a locked or unlocked device.
- A malicious or compromised browser extension/XSS in the app origin.
- A forged or corrupted backup file.

**Out of scope:** compromised operating system, keyloggers, coercive legal
requests, traffic-analysis resistance at nation-state level, post-quantum
security, physical attacks on an unlocked device, and the security of public
MQTT broker operators.

## Invariants the implementation tries to preserve

1. The relay never receives plaintext message bodies, contact names or private keys.
2. A frame cannot be accepted as from another identity without that identity's
   signing key.
3. Replayed or reordered frames cannot duplicate a message or resurrect an old
   sequence number.
4. The vault never leaves a plaintext identity on disk while it exists.
5. A backup file reveals neither payload nor identity without the password;
   modifying any byte causes authentication failure.
6. A deletion wins over an older copy from another device (72-hour tombstone).
7. A stale sync snapshot cannot downgrade a newer record (LWW by `syncAt`).
8. A public relay outage does not prevent delivery if at least one configured
   relay is reachable.

## Known gaps and open questions

- The protocol and its implementation have **not** been reviewed by a third party.
- No formal verification, symbolic model (ProVerif/Tamarin) or fuzzing campaign
  has been run against Q7RP.
- Metadata (hashed topics, timing, approximate sizes, IP addresses) is visible to
  relays and is not hidden.
- Multi-device sync relies on a **retained** broker message. A broker that drops
  retained messages, or a 200 KB cap being exceeded, can leave a device `partial`
  until a direct sync or a smaller update occurs.
- Sync and backup intentionally exclude attachment blobs.
- Public relays are best-effort; only a self-hosted relay gives operational
  control. The client connects to all configured relays in parallel, but no
  client can guarantee a third party's uptime.
- Browser storage can be cleared by the user or the browser; the encrypted backup
  is the recovery path, and it is only as strong as the chosen password.

## Audit plan

1. **Freeze a commit.** Tag the exact revision to review; record Node version,
   lockfile hash and build command.
2. **Commission a qualified auditor** with mobile/web crypto experience. Provide
   this page, `PROTOCOL.md`, `docs/ARCHITECTURE.md`, `SECURITY.md` and the threat
   model above.
3. **Scope the engagement** to the six areas listed above, with a retest after
   fixes. Ask for severity ratings and reproduction steps.
4. **Publish the report** (or a summary and the remediation status) in this file
   and in the README. Do not claim an audit until the report exists.
5. **Re-audit** after protocol changes, key-format changes or a major dependency
   upgrade.

### Reviewer quick start

```bash
git clone https://github.com/q7xk/q7-chat
cd q7-chat
npm ci
npm run typecheck
npm test
npm run build
```

Automated coverage is a starting point, not evidence of security:
`tests/p2p.test.ts`, `tests/q7rp.test.ts`, `tests/protocol-sim.test.ts`,
`tests/backup.test.ts`, `tests/sync.test.ts`, `tests/vault.test.ts`.

## What changed in 0.2.0 (internal hardening)

- Password-protected `.q7b` backups: PBKDF2-SHA256 600k + AES-256-GCM, strict
  header and payload validation, GCM tamper detection, 72-hour expiry recomputed
  on restore, opt-in identity replacement.
- Linked-device sync: self-ECDH-derived key, retained sealed snapshot, LWW merge,
  72-hour tombstones, stale/expired record rejection, 200 KB wire cap.
- Relay resilience: per-relay health, exponential backoff with jitter, parallel
  failover, visible per-relay status, and a self-host Mosquitto + Caddy stack.
- Documentation that states plainly that no independent audit exists.

These changes reduce specific risks. They do not substitute for the external
review described above.

## Reporting a vulnerability

Please follow [SECURITY.md](../SECURITY.md). Do not open a public issue for a
suspected vulnerability. If GitHub private vulnerability reporting is enabled on
the repository, use **Security → Report a vulnerability**.
