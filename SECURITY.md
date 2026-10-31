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
- Message expiry bypass or storage of expired content beyond the intended window.
- Cross-site scripting or injection through message bodies, names, link previews, attachments or group metadata.
- Attachment validation bypass, path traversal in file names, or unsafe MIME handling.
- Group membership or invitation spoofing.
- CSP/security header bypasses caused by the application's own code.
- Privacy leaks that send plaintext or unnecessary metadata to relays.

### Out of scope

- Issues in third-party dependencies that are already publicly known and fixed upstream. Report them upstream and open a normal issue here for the update.
- Missing security features that are documented as not implemented (for example, encrypted backups).
- Attacks requiring a compromised device, a malicious browser extension, or control of the app origin.
- Denial of service by overwhelming public MQTT brokers.
- Findings produced only by automated scanners without a demonstrated impact.
- Social engineering.
- Theoretical quantum attacks on P-256.

## Threat model summary

**Trusted:** the user's device, browser, password and the deployed application code.

**Untrusted:** public MQTT relays, network observers, remote contacts, arbitrary incoming frames and URLs.

**Protected:** message confidentiality and integrity in transit, sender authenticity, replay resistance, local identity confidentiality when a vault is enabled.

**Not protected:** traffic analysis by relays (timing, approximate size, hashed topics), compromised endpoints, plaintext backups, metadata already leaked by the user, and availability of public relays.

Read [PROTOCOL.md](PROTOCOL.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Security-relevant defaults

- Messages expire after 72 hours and are purged from IndexedDB.
- The vault uses PBKDF2-SHA256 with 310,000 iterations and AES-GCM.
- The CSP forbids framing and restricts script sources.
- External link previews are opt-in (`ask` by default).
- Image metadata is stripped by re-encoding still images.
- Relays see ciphertext and hashed topics only; they do not receive plaintext.

## Hardening recommendations for operators

- Serve only over HTTPS.
- Self-host an MQTT broker with WebSocket support if you need availability or retention guarantees.
- Keep the CSP and security headers enabled.
- Review dependency updates promptly.
- Do not enable third-party scripts on the same origin.
- Warn users that exported backups are plaintext JSON.
- Consider adding a TURN server rather than disabling relay fallback.

## Known limitations

- No independent audit.
- No encrypted backup format yet.
- No multi-device message sync; linked devices have separate histories.
- Relay-mode messages use a long-lived pairwise key and therefore lack forward secrecy.
- Public relays have no service-level agreement.
- Voice/video calling is not implemented.
