# Q7 Chat

**Private, serverless messaging that disappears after 72 hours.**

Q7 Chat is a browser-based, end-to-end encrypted messenger built with Next.js, TypeScript and Tailwind CSS. It has no account system, no application server and no message database in the cloud: identity keys, conversations and attachments live in the browser's IndexedDB, while messages travel directly between devices or through public MQTT relays as sealed envelopes.

[English](README.md) · [Türkçe](README.tr.md)

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="License: MPL 2.0" src="https://img.shields.io/badge/license-MPL--2.0-blue" />
</p>

> [!WARNING]
> Q7 Chat is an experimental reference implementation, **not an audited secure messenger**. The cryptographic protocol is custom. Do not rely on it for life-critical, legal, medical or high-risk communication. See [SECURITY.md](SECURITY.md) before using it with real data.

---

## Table of contents

- [Why Q7 Chat](#why-q7-chat)
- [Features](#features)
- [How it works](#how-it-works)
- [Security and privacy model](#security-and-privacy-model)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Internationalization](#internationalization)
- [Testing](#testing)
- [Limitations and roadmap](#limitations-and-roadmap)
- [Contributing](#contributing)
- [Security reports](#security-reports)
- [Privacy](#privacy)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## Why Q7 Chat

Most messengers ask you to trust a server. Q7 Chat is built around a different default:

- **No account, no sign-up, no email.** Your identity is a key pair generated on your device. Your public address is a 12-digit Q7 code.
- **No application server.** Public MQTT brokers are used only as dumb, encrypted relays. They see hashed topics and ciphertext, never plaintext.
- **Local-first storage.** Conversations, contacts, settings and file blobs stay in IndexedDB on your devices. Linked devices exchange sealed snapshots and tombstones through the relays; there is no server that can read or hold plaintext history.
- **72-hour messages.** Every message gets an expiry timestamp at creation. Expired messages are filtered in the UI and purged from IndexedDB.
- **Works offline-ish.** Devices talk peer-to-peer over WebRTC when possible. If that fails, encrypted frames fall back to a relay mailbox so messages can arrive later.
- **Open source under MPL 2.0.** You can inspect, modify and self-host it.

## Features

### Messaging

- **Local notes** — a private, on-device conversation for notes to yourself.
- **1:1 P2P chats** — end-to-end encrypted conversations with contacts.
- **Group conversations** — create a group from your contacts, invite members and exchange encrypted messages.
- **Spaces** — local-only contact groups for organising your sidebar. They are not sent over the network.
- **Rich messages** — replies, emoji reactions, edits, retractions, message search, mentions and starred conversations.
- **Attachments** — images, documents and voice notes up to **10 MB**; large transfers are chunked device-to-device in 16 KB encrypted pieces.
- **Metadata stripping** — still images are re-encoded to JPEG before sending, dropping EXIF and GPS data.
- **Extras** — polls, events, location sharing, contact cards and GIFs.
- **Link previews** — privacy-controlled: ask, block or allow external image previews.
- **Chat controls** — pin, mute, archive, clear, delete, wallpapers, unread counts and 72-hour expiry.
- **Notifications** — optional system notifications, sound and previews when the tab is in the background.

### Identity and connection

- **12-digit Q7 code** derived from your key fingerprint; it is an address, not a password.
- **Four pairing paths** — Q7 code, QR code, invite file and pasted invite text.
- **Connection requests** — incoming requests can be accepted or declined.
- **Contact verification** — safety numbers let two people compare fingerprints out of band.
- **Blocking and restrictions** — block a contact or only allow people already in your contact list.
- **Device linking** — link another device by scanning a `Q7DEV:` QR code from the setup screen.

### Privacy and safety controls

- **Local vault** — optional password lock using PBKDF2-SHA256 (310,000 iterations), AES-GCM and an optional TOTP authenticator code. The identity keys are sealed at rest; the password never leaves the device.
- **Idle lock** — automatically locks the vault after a configurable idle period.
- **Encrypted local backup** — a password-protected `.q7b` archive (PBKDF2-SHA256 600k + AES-256-GCM) containing the identity or sealed vault, conversations, contacts, settings and metadata. Attachments are not included. Legacy plaintext exports can still be imported once.
- **Multi-device sync** — linked devices share P2P and group messages, edits, reactions, deletions and contacts automatically through sealed, retained relay snapshots. Local Mode notes stay on the device that created them. Merging is last-writer-wins with 72-hour deletion tombstones.
- **Self-hosted relay** — a Docker Compose stack with Mosquitto and Caddy for users who need relay continuity they control.
- **Reduce motion, text scale, themes, accents** — accessibility and appearance controls.
- **17 languages** with right-to-left support for Arabic.
- **Strict Content Security Policy** in `next.config.mjs` (with a documented `unsafe-inline` caveat for Next.js bootstrap scripts).

## How it works

```text
┌─────────────────┐                         ┌─────────────────┐
│   Device A      │                         │   Device B      │
│                 │    WebRTC DataChannel   │                 │
│  IndexedDB      │ ◄═════════════════════► │  IndexedDB      │
│  identity keys  │       (preferred)       │  identity keys  │
│  messages       │                         │  messages       │
└────────┬────────┘                         └────────┬────────┘
         │                                           │
         │        encrypted frames (Q7RP v2)         │
         └──────────────► public MQTT ◄──────────────┘
                          relays/mailbox
                     hashed topics + ciphertext
```

1. **Identity.** Each device creates an ECDSA P-256 signing key and an ECDH P-256 static key. The public signing key's SHA-256 fingerprint becomes the device identity; the first 6 bytes produce the 12-digit Q7 code.
2. **Pairing.** A device publishes a sealed, signed offer to a topic derived from the recipient's code. The recipient answers, and both sides derive a pairwise key from their static ECDH keys.
3. **Direct transport.** WebRTC DataChannels carry live traffic and chunked file transfers using an ephemeral ECDH session with forward secrecy.
4. **Relay fallback.** When a direct channel is unavailable, frames are sealed with the pairwise key, signed with ECDSA and published to public MQTT brokers. Retained mailbox copies let the recipient catch up later.
5. **Acknowledgements.** The receiver sends a signed delivery receipt; the sender clears retained copies from the brokers.
6. **Expiry.** Every message receives `expiresAt = createdAt + 72h`. Expired records and blobs are purged from IndexedDB on startup and on a timer.

The full wire format, topic layout, replay window, mailbox flow and threat model are documented in [PROTOCOL.md](PROTOCOL.md). A deeper code-oriented overview is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security and privacy model

**What Q7 Chat protects against**

- Relay operators reading message contents: frames are AES-256-GCM encrypted, and topics are hashed.
- Message tampering and forgeries: frames are signed with ECDSA P-256; sender identity is bound to the signing key.
- Replay and duplicate delivery: sequence windows and message-id deduplication.
- Silent contact replacement: safety numbers and manual fingerprint comparison.
- Local key theft without the password: the optional vault seals identity keys at rest.

**What it does not protect against**

- A compromised device, malicious browser extension or XSS in the app origin.
- Metadata analysis by relays: timing, approximate size and hashed topics remain visible.
- A future quantum adversary: the current primitives are classical (P-256, AES-GCM).
- Someone who has your unlocked device or an old plaintext backup. New backups are encrypted; delete legacy exports.
- Legal or coercion scenarios. This is not a whistle-blower-grade tool.

The design is intentionally simple and auditable, but it has **not** received an independent security audit. Read [SECURITY.md](SECURITY.md) for the policy and [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md) for the audit scope, threat model and current status.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | [Next.js 14](https://nextjs.org/) App Router |
| Language | [TypeScript 5](https://www.typescriptlang.org/) |
| UI | [React 18](https://react.dev/), [Tailwind CSS 3](https://tailwindcss.com/), [Lucide](https://lucide.dev/) |
| Storage | IndexedDB (`lib/db.ts`) with `fake-indexeddb` in tests |
| Crypto | Web Crypto API — ECDSA P-256, ECDH P-256, HKDF, AES-256-GCM, PBKDF2-SHA256 |
| Transport | WebRTC DataChannels, MQTT 3.1.1 over WSS |
| QR | `qrcode` (generation) and `jsqr` (scanning) |
| Tests | [Vitest](https://vitest.dev/) |

## Getting started

### Requirements

- **Node.js 18.17+** (Node 20 LTS recommended; see `.nvmrc`)
- **npm 9+**
- A modern browser with WebCrypto, IndexedDB and WebRTC support
- **HTTPS or localhost** for WebCrypto and P2P in production

### Install and run

```bash
git clone https://github.com/<your-org>/q7-message.git
cd q7-message
npm ci
npm run dev
```

Open <http://localhost:3000>. P2P functionality works on `localhost`; on a phone or another machine use HTTPS (a deployment or an HTTPS tunnel).

### First run

1. The setup wizard creates your device identity and asks for a display name.
2. Open **Connect** to see your 12-digit Q7 code.
3. Pair with another device using the code, QR code or invite file.
4. Accept the connection request and start chatting.

### Test with two devices

- Deploy the app to an HTTPS host, or expose your dev server through an HTTPS tunnel.
- Open the same URL on both devices.
- Pair with a code or QR code.
- If direct WebRTC fails, the app automatically falls back to relay mode.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server on port 3000. |
| `npm run build` | Create an optimized production build. |
| `npm start` | Serve the production build. |
| `npm run typecheck` | Run `tsc --noEmit`. |
| `npm test` | Run the Vitest suite once. |
| `npm run lint` | Run Next.js linting (requires an ESLint setup). |

## Deployment

Q7 Chat is a client-side app, but the bundled `next.config.mjs` sets security headers and a CSP. Deploy it to a platform that runs Next.js, such as Vercel, or a Node.js host. If you export it as static files, configure the equivalent headers at your CDN/host.

Recommended production checklist:

- Serve over HTTPS.
- Keep the CSP in `next.config.mjs` and review it after adding dependencies.
- Review `Permissions-Policy`: camera, microphone and geolocation are limited to the app origin and used only for opt-in features (QR scanning, voice notes, location sharing).
- Add your own MQTT broker if you need predictable retention: [`deploy/relay`](deploy/relay) ships a Mosquitto + Caddy Compose stack with automatic TLS. The client connects to every configured relay in parallel and reports per-relay health in Settings.
- Enable GitHub private vulnerability reporting for the repository.

## Project structure

```text
.
├── app/                      # Next.js App Router pages and global styles
│   ├── help/page.tsx         # In-app help and documentation
│   ├── learn/page.tsx        # Step-by-step tutorial
│   ├── layout.tsx            # Root layout, metadata and font
│   ├── page.tsx              # App entry: i18n, store, lock, P2P providers
│   └── globals.css           # Tailwind layers and design tokens
├── components/               # React UI
│   ├── Shell.tsx             # Navigation rail, mobile nav, view routing
│   ├── ChatList.tsx          # Conversation list and filters
│   ├── Thread.tsx            # Message thread, expiry, status
│   ├── Composer.tsx          # Text, attachments, voice, emoji
│   ├── Connect.tsx           # Code/QR/file pairing
│   ├── Contacts.tsx          # Contact list and safety numbers
│   ├── Devices.tsx           # Linked-device management
│   ├── Settings.tsx          # Profile, privacy, relays, storage
│   ├── Lock.tsx              # Vault unlock screen and idle lock
│   └── ...                   # Dialogs, badges, cards, emoji, GIF, scanner
├── lib/
│   ├── p2p/                  # Protocol implementation
│   │   ├── crypto.ts         # Identity, envelopes, sessions, safety numbers
│   │   ├── q7rp.ts           # Pairwise keys, signed relay frames, replay window
│   │   ├── mqtt.ts           # MQTT 3.1.1 over WSS, per-relay health and backoff
│   │   ├── rtc.ts            # WebRTC DataChannels, STUN/TURN
│   │   ├── manager.ts        # Protocol state machine
│   │   └── context.tsx       # React provider for the manager
│   ├── backup.ts             # Encrypted .q7b export/import and validation
│   ├── sync.ts               # Multi-device snapshot merge and tombstones
│   ├── db.ts                 # IndexedDB persistence and purge logic
│   ├── store.tsx             # React store for conversations/settings
│   ├── vault.ts              # Password + TOTP vault
│   ├── attach.ts             # Attachment validation and image re-encoding
│   ├── i18n.tsx              # Language detection and dictionaries
│   ├── types.ts              # Shared domain types
│   └── ...                   # Theme, links, names, time, utilities
├── langs/                    # 17 JSON translation files
├── public/                   # Logos and static assets
├── tests/                    # Vitest suites
├── docs/                     # Architecture, deployment, roadmap, translations
├── deploy/relay/             # Self-hosted Mosquitto + Caddy WSS relay
├── .github/                  # CI, issue/PR templates, Dependabot
├── Dockerfile                # Multi-stage production image
├── .nvmrc                    # Node 20 for local development
├── PROTOCOL.md               # Q7RP wire protocol
├── SECURITY.md               # Security policy and threat model
├── CONTRIBUTING.md           # Contribution guide
├── CODE_OF_CONDUCT.md        # Community standards
├── PRIVACY.md                # Data and network privacy notes
├── CHANGELOG.md              # Release history
├── LICENSE                   # Mozilla Public License 2.0
└── NOTICE                    # Copyright and third-party notices
```

## Internationalization

The UI ships with 17 languages: English, Turkish, German, Chinese, Japanese, Korean, French, Spanish, Portuguese, Russian, Polish, Ukrainian, Hindi, Indonesian, Italian, Dutch and Arabic. The browser language is detected automatically, English is the fallback, and Arabic switches the document to RTL.

To add or update a language:

1. Copy `langs/en.json` to `langs/<code>.json`.
2. Translate the values, keeping every `{placeholder}` unchanged.
3. Register the language in `lib/i18n.tsx` (`LANGS` and `loaders`).
4. Run `npm test` — the i18n suite checks every file, key, value and placeholder.

See [docs/TRANSLATIONS.md](docs/TRANSLATIONS.md) for details.

## Testing

```bash
npm run typecheck
npm test
```

The suite covers:

- IndexedDB storage and purge behavior (`tests/db.test.ts`)
- Encrypted backup round-trip, tampering and password policy (`tests/backup.test.ts`)
- Multi-device merge, tombstones and wire-size limits (`tests/sync.test.ts`)
- Translation completeness and language detection (`tests/i18n.test.ts`)
- Crypto envelopes, identity and sessions (`tests/p2p.test.ts`)
- End-to-end protocol simulation (`tests/protocol-sim.test.ts`)
- Q7RP frames, signatures, replay windows and topics (`tests/q7rp.test.ts`)
- Vault sealing, password rotation and TOTP (`tests/vault.test.ts`)

CI runs type checking, tests and a production build on every push and pull request. See [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Limitations and roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full list. Current known gaps:

- No voice or video calls yet (the Calls entry is a placeholder).
- No independent security audit yet. This cannot be self-certified; see [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md).
- Public relays are best-effort. For continuity, self-host the relay in [`deploy/relay`](deploy/relay); the client fails over between all configured brokers.
- 72-hour history sync and encrypted backups exclude attachment blobs; large attachments still require a direct connection.
- Large files above 160 KB wait for a direct connection when in relay-only mode.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) first.

Good first contributions:

- Translations and RTL polish.
- Accessibility fixes (keyboard navigation, focus traps, screen-reader labels).
- Tests for protocol edge cases.
- Documentation improvements.
- Relay hardening recipes (rate limits, monitoring, private deployments).

By contributing, you agree that your contributions are licensed under the Mozilla Public License 2.0.

## Security reports

**Do not open a public issue for security vulnerabilities.** Use GitHub's private vulnerability reporting (Security → Advisories → Report a vulnerability) or contact the maintainers privately. See [SECURITY.md](SECURITY.md) for scope and response expectations.

## Privacy

Q7 Chat stores identity, conversations and attachments on your device. It does not include analytics or trackers. Network metadata still exists: relays see hashed topics, ciphertext, timing and IP addresses; STUN servers see your IP; GIF search contacts GIPHY. Read [PRIVACY.md](PRIVACY.md) for the full breakdown.

## License

This project is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. The full text is in [LICENSE](LICENSE). MPL 2.0 is the current version of the Mozilla Public License; there is no MPL 3.0.

In short:

- You may use, modify and distribute this code, including commercially.
- If you modify MPL-covered files, you must make those modified files available under the MPL when you distribute them.
- Larger works may combine MPL-covered code with other code under other terms.
- No trademark rights are granted.

Copyright © 2026 Q7 Chat contributors.

## Acknowledgements

- Protocol ideas inspired by Tox, Keet and the broader P2P messaging community.
- [Mozilla](https://www.mozilla.org/MPL/2.0/) for the MPL 2.0 text.
- [Roboto Flex](https://fonts.google.com/specimen/Roboto+Flex) (SIL Open Font License 1.1) via `next/font`.
- All open-source dependencies listed in [NOTICE](NOTICE) and `package-lock.json`.

---

<p align="center">Made for conversations that do not need to last forever.</p>
