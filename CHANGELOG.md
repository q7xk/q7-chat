# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it reaches 1.0.

## [0.2.0] - 2026-11-01

### Added

- Encrypted local backups (`.q7b`): PBKDF2-SHA256 with 600,000 iterations, AES-256-GCM, strict header/payload validation, tamper detection, optional identity replacement and legacy plaintext import.
- Multi-device sync between linked devices: sealed retained relay snapshots keyed by a self-ECDH secret, last-writer-wins merging, 72-hour deletion tombstones and a 200 KB wire cap.
- Self-hosted relay stack under `deploy/relay` (Mosquitto over WebSocket + Caddy TLS).
- Per-relay health reporting in Settings, with exponential backoff and jitter for reconnects.
- `docs/SECURITY-AUDIT.md`: audit scope, threat model, invariants, known gaps and the honest status that no independent audit exists.
- Project documentation: architecture, deployment, roadmap and translation guides.
- GitHub community files: CI, CodeQL, Dependabot, issue templates and pull request template.
- Mozilla Public License 2.0 and third-party notices.

### Changed

- Relay reconnects now back off exponentially with ±20% jitter instead of retrying in lockstep.
- The client fails over across every configured relay and exposes each broker's status.
- Translated the missing device-management and backup strings in every supported language.
- Standardised the language files so all 17 locales have the same keys in the same order.

### Removed

- The experimental **Extensions / Integrations** panel, including the third-party integration placeholders and the embedded Doom demo. Q7 Chat no longer ships a plugin or extension surface.
- Related navigation entries, the `extensions` view type and unused translation keys.

### Security

- Backups no longer leave a plaintext JSON snapshot on disk by default.
- Sync snapshots are authenticated with AES-GCM under a key only linked devices can derive; relays see ciphertext and a hashed topic.
- Deletions are propagated with tombstones so a stale device cannot silently resurrect a removed message.
- No independent security audit has been completed. This release does not change that fact; see [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md).

## [0.1.0] - 2026-10-31

### Added

- Local notes, 1:1 P2P chats, group conversations and local spaces.
- 12-digit Q7 code, QR pairing, invite files and pasted invites.
- E2E encrypted messaging with Q7RP v2 relay fallback and WebRTC direct transport.
- 72-hour message expiry with local purge.
- Attachments up to 10 MB, image metadata stripping, voice notes, polls, events, location, contact cards and GIFs.
- Replies, reactions, edits, retractions, mentions, starred chats, search, pin, mute and archive.
- Contact verification with safety numbers, blocking and contact-only restrictions.
- Password vault with optional TOTP and idle lock.
- Device linking by QR code.
- 17 languages with automatic detection and Arabic RTL support.
- Profile, notification, media, appearance, accessibility and storage settings.
- Help and tutorial pages.
- Vitest suites for crypto, protocol, Q7RP, storage, vault and i18n.
