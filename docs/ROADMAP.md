# Roadmap

This roadmap is a direction, not a promise. Priorities may change based on security review and contributor interest.

## Now

- Stabilise Q7RP v2 and document every frame type.
- Add more protocol tests: malformed frames, replayed frames, group membership races.
- Accessibility pass: focus traps, keyboard navigation, reduced motion, screen-reader labels.
- Translation review for all 17 languages, especially RTL layout details.
- Harden multi-device sync for very large histories (chunked snapshots or an event log).

## Next

- **Independent security review.** External review of the custom protocol, vault, backup format and sync design. See [SECURITY-AUDIT.md](SECURITY-AUDIT.md).
- **Voice and video calls.** The Calls entry is currently a placeholder.
- **PWA shell.** Installable app and offline cache for the static shell.
- **Attachment backup/sync.** Large blobs are currently excluded from `.q7b` files and relay sync.
- **Relay observability.** Metrics, rate limits and alerting recipes for self-hosted relays.

## Later

- Disappearing-message controls beyond the fixed 72-hour window.
- Multi-account support on one device.
- Optional post-quantum key exchange (hybrid X25519/ML-KEM) once browser support is practical.
- Formal verification of the handshake and replay windows.

## Done

- Encrypted `.q7b` backups with PBKDF2-SHA256 600k + AES-256-GCM.
- Multi-device sync through sealed retained relay snapshots with tombstones.
- Self-hosted Mosquitto + Caddy relay stack and per-relay health reporting.
- Removal of the experimental Extensions panel and its plugin surface.
