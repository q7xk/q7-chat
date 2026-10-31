# Privacy

Q7 Chat is designed to keep conversations on your device. This page explains, in plain language, what stays local and what can be observed on the network.

This is a technical description of the software, not legal advice.

## What is stored on your device

Q7 Chat stores the following in your browser's IndexedDB and localStorage:

- Your device identity key pair and fingerprint.
- Your display name, profile photo and settings.
- Contacts, safety numbers and connection requests.
- Conversations, messages, reactions, polls and group metadata.
- Attachments (images, documents, voice notes) as local blobs.
- Spaces and UI preferences such as language, theme and accent.

If you enable the vault, your identity keys are sealed with a password-derived key and the plaintext identity is removed from IndexedDB. Messages and attachments are not encrypted at rest by the current version.

Nothing is uploaded to a Q7 Chat account or application server, because neither exists.

## What leaves your device

Q7 Chat only talks to the network for these purposes:

1. **Peer-to-peer messaging.** Encrypted frames go directly to a contact over WebRTC when possible.
2. **Relay fallback.** When a direct connection is unavailable, encrypted and signed frames are published to public MQTT brokers. Brokers see hashed topic names, ciphertext, approximate frame sizes and timing. They do not see plaintext, display names or your contact list.
3. **Pairing.** Sealed offers and answers travel through the same relays, or through a QR code, invite file or pasted text that you choose to share.
4. **WebRTC connectivity.** STUN servers (`stun.l.google.com`, `stun.cloudflare.com`) are used to discover a route between peers. They can see your public IP address. If you configure a TURN server, it relays encrypted WebRTC traffic and can see connection metadata.
5. **GIF search.** Opening the GIF picker sends your search query and IP address to GIPHY's API. GIF images are loaded from GIPHY/Media hosts. You can set your own GIPHY API key in the picker, but the request still goes to GIPHY.
6. **Link previews.** A preview image is only loaded from the linked site when your privacy setting is `allow`, or after you explicitly choose to show it. The site can then see your IP address. Opening a link navigates to that site.
7. **Hosting.** Your hosting provider may collect standard request logs (IP address, user agent, timestamps) when it serves the app.

Q7 Chat does not include analytics, advertising SDKs, crash reporters, fingerprinting scripts or third-party tracking pixels.

## Metadata

End-to-end encryption protects message contents, not all metadata. Relays can observe:

- Hashed topic names derived from fingerprints.
- Encrypted frame sizes and timing.
- Connection times and IP addresses.

A contact you message can see your IP address when a direct WebRTC connection is used. This is inherent to peer-to-peer networking.

## Your controls

- **Relays:** disable public relays in Settings, or add your own broker.
- **Previews:** choose ask, block or allow for external images.
- **Blocking and restrictions:** block contacts or allow only people in your contact list.
- **Vault:** protect identity keys with a password and optional TOTP.
- **Export:** download a plain JSON snapshot of local data.
- **Delete:** wipe all local Q7 data from Settings.

## Retention

Messages expire after 72 hours and are purged from local storage. Retained copies on public MQTT brokers are cleared when the recipient acknowledges them, but broker retention behavior is outside Q7 Chat's control. Self-host a broker if you need predictable retention.

## Children

Q7 Chat is not directed at children and has no age verification.

## Changes

This document may change as the software evolves. The repository history is the authoritative record of changes.

## Contact

For privacy questions, open a normal issue that contains no personal data. For security vulnerabilities, follow [SECURITY.md](SECURITY.md).
