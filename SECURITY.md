# Security policy

Q7 Chat is an experimental, independently developed messenger. Its cryptographic protocol has not been audited. Treat it as research software, not as a hardened replacement for a mature messenger.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use one of these private channels:

1. **GitHub private vulnerability reporting** — open the repository's **Security** tab, choose **Advisories**, then **Report a vulnerability**. This is the preferred channel.
2. If private reporting is unavailable, contact the maintainers privately through the contact method on the repository profile.

Include:

- A description of the issue and its impact.
- The affected version or commit.
- Reproduction steps or a proof of concept.
- Whether the issue is already public.
- Any suggested fix or mitigation.

Please allow reasonable time for a fix before public disclosure. We aim to acknowledge reports within 7 days and to agree on a disclosure timeline with the reporter. There is no bug bounty.

## Supported versions

The project is pre-1.0 and ships from `main`. Security fixes are applied to the latest release and `main`; older commits are not maintained.

## Scope

### In scope

- Cryptographic protocol flaws in `lib/p2p/` (identity, envelopes, Q7RP frames, replay handling, key derivation, signatures).
- Vault weaknesses in `lib/vault.ts` (password wrapping, key sealing, TOTP handling, idle lock bypass).
- Backup format weaknesses in `lib/backup.ts` (KDF parameters, header parsing, authentication bypass, identity replacement).
- Multi-device sync weaknesses in `lib/sync.ts` (key derivation, snapshot forgery, stale-snapshot rollback, tombstone bypass).
- Message expiry bypass or storage of expired content beyond the intended window.
- Cross-site scripting or injection through message bodies, names, link previews, attachments or group metadata.
- Attachment validation bypass, path traversal in file names, or unsafe MIME handling.
- Group membership or invitation spoofing.
- CSP/security header bypasses caused by the application's own code.
- Privacy leaks that send plaintext or unnecessary metadata to relays.

### Out of scope

- Issues in third-party dependencies that are already publicly known and fixed upstream. Report them upstream and open a normal issue here for the update.
- Missing features that are documented as not implemented (for example, attachment blobs inside backups or sync snapshots).
- Attacks requiring a compromised device, a malicious browser extension, or control of the app origin.
- Denial of service by overwhelming public MQTT brokers.
- Findings produced only by automated scanners without a demonstrated impact.
- Social engineering.
- Theoretical quantum attacks on P-256.

## Threat model summary

**Trusted:** the user's device, browser, password and the deployed application code.

**Untrusted:** public MQTT relays, network observers, remote contacts, arbitrary incoming frames and URLs.

**Protected:** message confidentiality and integrity in transit, sender authenticity, replay resistance, local identity confidentiality when a vault is enabled.

**Not protected:** traffic analysis by relays (timing, approximate size, hashed topics), compromised endpoints, legacy plaintext backup files created before 0.2.0, metadata already leaked by the user, and availability of public relays.

Read [PROTOCOL.md](PROTOCOL.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md) for details. No independent audit has been completed; the audit page records the scope and current status.

## Security-relevant defaults

- Messages expire after 72 hours and are purged from IndexedDB.
- The vault uses PBKDF2-SHA256 with 310,000 iterations and AES-GCM.
- Encrypted backups use PBKDF2-SHA256 with 600,000 iterations and AES-256-GCM; the cost is stored in the file header.
- Device sync uses a self-ECDH secret, AES-GCM, last-writer-wins timestamps and 72-hour tombstones. Snapshots are capped below 200 KB and may be partial for very large histories.
- The CSP forbids framing and restricts script sources.
- External link previews are opt-in (`ask` by default).
- Image metadata is stripped by re-encoding still images.
- Relays see ciphertext and hashed topics only; they do not receive plaintext.

## Hardening recommendations for operators

- Serve only over HTTPS.
- Self-host the Mosquitto + Caddy relay in [`deploy/relay`](deploy/relay) if you need availability or retention guarantees.
- Keep the CSP and security headers enabled.
- Review dependency updates promptly.
- Do not enable third-party scripts on the same origin.
- Tell users to create encrypted `.q7b` backups and to delete any legacy plaintext export.
- Consider adding a TURN server rather than disabling relay fallback.

## Known limitations

- No independent audit. See [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md).
- Encrypted backups and sync snapshots exclude attachment blobs.
- Relay-mode messages use a long-lived pairwise key and therefore lack forward secrecy.
- Public relays have no service-level agreement.
- Very large histories may sync partially because snapshots are capped at 200 KB.
- Voice/video calling is not implemented.
