# End-to-end encryption (E2EE) in Q7 Chat

Q7 Chat is private, serverless, end-to-end encrypted messaging. Identity keys, conversations, and attachments live in the browser's IndexedDB; messages travel directly between devices or through public MQTT relays as sealed envelopes. There is no application server and no message database in the cloud.

## Use the Web Cryptography API

Perform all cryptographic operations (key generation, sealing, unsealing, signing, hashing) with `window.crypto.subtle`. Never implement custom crypto or ship third-party crypto implementations unless the project already declares them as dependencies.

## Operate in a secure context

E2EE requires a secure context (HTTPS or `localhost`). Guard all `crypto.subtle` calls behind a secure-context check and fail closed (do not fall back to plaintext) when the context is insecure.

## Key lifecycle

- Generate identity key pairs with `crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])` or the project's existing curve in `lib/p2p/crypto.ts`.
- Store private keys only in IndexedDB (`lib/db.ts` `p2p_identity` store), never in `localStorage` or `sessionStorage`.
- Derive per-device sync secrets via self-ECDH; never transmit raw private keys over the network.
- Rotate keys on device adoption and identity replacement; tombstone old keys after 72 hours.

## Message sealing

Seal each message envelope with AES-GCM (via `crypto.subtle.encrypt`) authenticated with associated data (sender, timestamp, topic hash). Relays see ciphertext and a hashed topic only — never plaintext.

## Delivery integrity

Sign sealed frames and require relay acks. Apply deduplication by message ID/sequence. Propagate deletions with tombstones so a stale device cannot silently resurrect a removed message.

## Fallback strategies

If Web Cryptography is unavailable in a target environment, degrade gracefully by disabling send/receive and surfacing a clear error; never fall back to unencrypted transport.
