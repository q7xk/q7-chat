# Q7 Message

Privacy-first messaging with 72-hour message expiry. Built with Next.js, TypeScript, Tailwind CSS and Lucide.

## Status

- **Chats**: local chats (IndexedDB, never leave the device) and 1:1 P2P chats. Groups are not built yet.
- **Contacts**: contact list, safety numbers, share/scan a contact QR (`Q7C:`).
- **Connect**: your 12-digit code, connect by code (sealed requests over public MQTT relays), QR / invite file / pasted text pairing.
- **Calls**: placeholder. Voice and video are not built yet.
- **Settings**: profile (name, photo), privacy (external image previews), encryption fingerprint, relays and TURN, theme, language, storage (export/import, delete all).
- **Attach menu**: gallery, camera, location, contact, document, poll, event. Files go device to device in encrypted 16 KB chunks (10 MB limit); photos are re-encoded to strip metadata.
- **Emoji**: recently used emojis are remembered on this device.
- **Languages**: `/langs/*.json`, 17 languages (en, tr, de, zh, ja, ko, fr, es, pt, ru, pl, uk, hi, id, it, nl, ar). The browser language is detected automatically; English is the fallback; Settings can override. Arabic switches the layout to right-to-left. Add a language by adding a file and registering it in `lib/i18n.tsx`; `npm test` checks every key and placeholder.
- **Logo**: inline SVG speech bubble with the name (no external assets).

## Security notes

Messages between devices use a custom scheme (signed ECDH P-256 + AES-GCM) that is **not independently audited**. Offers and answers are signed. Relays only see sealed signaling, their IP addresses and timing. Needs HTTPS (or localhost). Each device deletes its own copy after 72 hours; copies elsewhere are out of reach.

## Run

    npm install
    npm run dev      # http://localhost:3000 (P2P works on localhost and on https)
    npm test

To test PC and phone: deploy to Vercel (static, no server code needed) or use an HTTPS tunnel, then open the same URL on both.

## Not done yet

Voice and video calls with call history, groups and communities, nearby-device discovery, account backup and multi-device linking, PWA shell.
