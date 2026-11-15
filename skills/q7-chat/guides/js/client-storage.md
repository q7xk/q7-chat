# Client-side storage in Q7 Chat

Q7 Chat persists identity keys, conversations, messages, and attachments in the browser's IndexedDB (`lib/db.ts`, `q7-local` database). Messages and blobs expire after 72 hours and are purged on interval, visibility change, and startup.

## Use IndexedDB, not localStorage

Prefer IndexedDB for structured data (conversations, messages, contacts, settings, blobs). Avoid `localStorage`/`sessionStorage` for anything beyond tiny UI preferences — they are synchronous, string-only, and block the main thread.

## Respect storage quotas

IndexedDB is subject to per-origin storage quotas. Q7 Chat enforces message TTL (72h), blob expiry, and snapshot size trimming (200 KB wire cap for sync snapshots). Do not store unbounded data.

## 72-hour expiry and purge

Messages carry `expiresAt = createdAt + 72h`. Expired rows are filtered in memory and purged from IndexedDB on interval, `visibilitychange`, and startup. Blobs live under `local_blobs` keyed by message id and are purged alongside their message.

## Secure context

IndexedDB requires a secure context (HTTPS or `localhost`). Fail closed in insecure contexts.

## Fallback strategies

If IndexedDB is unavailable (e.g. private mode with storage blocked), degrade gracefully by running in ephemeral in-memory mode and surfacing a clear "persistence unavailable" message rather than crashing.
