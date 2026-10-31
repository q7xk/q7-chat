# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it reaches 1.0.

## [Unreleased]

### Added

- Project documentation: architecture, deployment, roadmap and translation guides.
- GitHub community files: CI, CodeQL, Dependabot, issue templates and pull request template.
- Mozilla Public License 2.0 and third-party notices.

### Changed

- Translated the missing device-management strings in every supported language.
- Standardised the language files so all 17 locales have the same keys in the same order.

### Removed

- The experimental **Extensions / Integrations** panel, including the third-party integration placeholders and the embedded Doom demo. Q7 Chat no longer ships a plugin or extension surface.
- Related navigation entries, the `extensions` view type and unused translation keys.

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
