# Roadmap

This roadmap is a direction, not a promise. Priorities may change based on security review and contributor interest.

## Now

- Stabilise Q7RP v2 and document every frame type.
- Improve connection recovery and relay mailbox cleanup.
- Add more protocol tests: malformed frames, replayed frames, group membership races.
- Accessibility pass: focus traps, keyboard navigation, reduced motion, screen-reader labels.
- Translation review for all 17 languages, especially RTL layout details.

## Next

- **Encrypted local backups.** Replace the plain JSON export with a password-protected archive.
- **Multi-device message sync.** Merge history across linked devices without a central server.
- **Voice and video calls.** The Calls entry is currently a placeholder.
- **PWA shell.** Installable app and offline cache for the static shell.
- **Self-hosted relay guide.** Docker Compose recipe for an MQTT broker with WSS and retained messages.
- **Security review.** Independent review of the custom protocol and vault.

## Later

- Disappearing-message controls beyond the fixed 72-hour window.
- Safer group membership protocol with explicit epochs.
- Optional notification relay for push-like delivery.
- Contact discovery that does not rely on sharing codes manually.
- Import/export of individual conversations.
- Better attachment previews and media playback controls.
- Theming API for self-hosters.

## Explicit non-goals

- A plugin or extension runtime. Q7 Chat compiles its features into the app; third-party code does not run inside the messenger.
- A cloud account system or server-side message storage.
- Analytics, advertising or tracking SDKs.
- Cryptocurrency or payment features.

## How to propose work

Open a feature request with the problem you want to solve, the threat model implications, and the smallest useful version. Security-sensitive proposals should follow [SECURITY.md](../SECURITY.md).
