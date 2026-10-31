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

For predictable retention and availability, self-host an MQTT broker with WebSocket support and add it in **Settings → Relays and network**. A TURN server can rescue direct WebRTC connections on symmetric NATs.

## Backups

The current export is a plain JSON snapshot of local data. It is not encrypted. Store backups accordingly, and remember that a backup can contain message contents and contact metadata.

## Pre-release checklist

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] HTTPS is enforced.
- [ ] Security headers are present on responses.
- [ ] The relay list is intentional.
- [ ] Private vulnerability reporting is enabled on GitHub.
- [ ] The license and third-party notices are up to date.
