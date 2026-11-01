# Deployment

Q7 Chat is a client-side Next.js application. There is no database or API route to operate, but the app does need a secure origin and the security headers defined in `next.config.mjs`.

## Requirements

- HTTPS in production. WebCrypto and many browser APIs require a secure context.
- Node.js 18.17+ for building (Node 20 LTS recommended).
- A host that can run Next.js, or a static host plus equivalent security headers.

## Vercel

1. Push the repository to GitHub.
2. Import it in Vercel.
3. Keep the default build command (`npm run build`) and output settings.
4. Deploy.

No environment variables are required by default. The MQTT relay list is compiled into `lib/p2p/manager.ts` (`DEFAULT_RELAYS`) and can be changed in Settings at runtime.

## Node.js host

```bash
npm ci
npm run build
npm start
```

The server listens on port 3000 by default. Put it behind a TLS-terminating reverse proxy.

Example `nginx` location block:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## Docker

A multi-stage `Dockerfile` is included:

```bash
docker build -t q7-chat .
docker run --rm -p 3000:3000 q7-chat
```

For production, terminate TLS in front of the container and set a restart policy.

## Static export

The application does not require server code at runtime, so `output: "export"` can work, but you must then:

- Recreate the CSP and security headers at your host/CDN.
- Ensure `next/font` assets and the app shell are served correctly.
- Test QR scanning and voice notes, which need camera/microphone permissions.

## Security headers

`next.config.mjs` currently sets:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY`
- `Permissions-Policy` for camera, microphone and geolocation

Review and tighten the CSP after adding dependencies. The CSP allows `'unsafe-inline'` scripts because Next.js injects bootstrap scripts; replacing it with nonces is a tracked improvement.

## Relays and NAT

The default relays are public and best-effort:

- `wss://broker.emqx.io:8084/mqtt`
- `wss://broker.hivemq.com:8884/mqtt`
- `wss://test.mosquitto.org:8081`

For predictable retention and availability, self-host the relay in [`deploy/relay`](../deploy/relay). It ships Mosquitto (WebSocket listener) behind Caddy for automatic TLS:

```bash
cd deploy/relay
RELAY_DOMAIN=relay.example.com docker compose up -d
```

Then add `wss://relay.example.com/mqtt` in **Settings → Relays and network**. The client connects to every configured relay in parallel, applies exponential backoff with jitter to failed connections, and shows each relay's status. A reachable self-hosted relay removes dependence on public broker uptime. A TURN server can rescue direct WebRTC connections on symmetric NATs.

## Backups

Exports are encrypted `.q7b` files: PBKDF2-SHA256 (600,000 iterations) + AES-256-GCM, with the KDF parameters in the header. The password is never stored, so a lost password means an unreadable file. Attachments are not included.

Tell users to:

- Create a backup after linking devices or changing identity.
- Store it separately from the device (password manager attachment, encrypted disk).
- Delete any legacy plaintext export; those can still be imported once but are not protected.

## Pre-release checklist

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] HTTPS is enforced.
- [ ] Security headers are present on responses.
- [ ] The relay list is intentional.
- [ ] Private vulnerability reporting is enabled on GitHub.
- [ ] The license and third-party notices are up to date.
