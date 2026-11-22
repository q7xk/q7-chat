# Self-hosted Q7 relay

Q7 Chat works with public MQTT brokers, but those are best-effort: their uptime,
retention and message-size limits are outside our control. If you need a relay
that you can rely on, run this stack on a small VPS.

```
Internet ── TLS ──► Caddy :443 ──► Mosquitto :8084 (WebSocket, private network)
```

## Requirements

- A Linux host with Docker and Docker Compose v2
- A DNS record (for example `relay.example.com`) pointing at the host
- TCP ports 80 and 443 reachable from the internet

## Start

```bash
cd deploy/relay
RELAY_DOMAIN=relay.example.com docker compose up -d
```

Caddy obtains a Let's Encrypt certificate automatically. Check the logs:

```bash
docker compose logs -f caddy
```

Then open **Settings → Relays** in Q7 Chat and add:

```
wss://relay.example.com/mqtt
```

Q7 connects to the built-in public relays _and_ your relay, so a failure of any
single broker does not stop delivery.

## What the relay can see

- Hashed topics (identity/contact hashes, not phone numbers or codes)
- Ciphertext, timing and approximate message sizes
- Client IP addresses

It cannot read message contents, contact names or the identity keys. See
[PRIVACY.md](../../PRIVACY.md).

## Hardening

- The broker is **not** exposed directly; only Caddy publishes ports.
- Keep the host patched and restrict SSH to key authentication.
- Mosquitto persists retained messages under the `mosquitto-data` volume. Back
  it up if you want mailbox/sync continuity across host rebuilds.
- Anonymous access is intentional: Q7's MQTT client has no username/password
  option, and payloads are already end-to-end sealed. If you need to restrict
  who can connect, put the relay behind a private network or a WebSocket-aware
  proxy that enforces its own access control.
- `message_size_limit` is 256 KB, above the 200 KB cap Q7 uses for sync
  snapshots. Raising it is safe but increases memory use per retained message.

## Verify

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://relay.example.com/
# 400/404 is expected: the endpoint speaks MQTT over WebSocket, not HTTP.
```

A `wss://` connection from the app that shows **online** in Settings → Relays
means the full path (DNS, certificate, proxy, broker) works.

## Restricted networks (school/workplace)

Some networks block known public MQTT broker domains or non-standard ports
(8081/8084/8884). The most reliable workaround is to run **your own relay on
HTTPS port 443** behind a normal-looking domain you control.

### Recommended setup

1. Use a normal domain/subdomain, e.g. `relay.example.com`.
2. Keep TLS on 443 (Caddy does this automatically).
3. Add only that relay in Q7 Chat → **Settings → Relays** or keep it alongside
   defaults.
4. If the network inspects paths, you can proxy a neutral path to Mosquitto.
   Mosquitto's WebSocket listener accepts MQTT over WS; Caddy can terminate TLS
   and forward the WebSocket upgrade.

Example Caddyfile with a neutral path:

```caddyfile
{$RELAY_DOMAIN} {
	encode zstd gzip

	@mqtt path /realtime
	handle @mqtt {
		reverse_proxy mosquitto:8084
	}

	handle {
		respond "ok" 200
	}

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		-Server
	}
}
```

Then use:

```text
wss://relay.example.com/realtime
```

> Note: Some deep packet inspection systems can still identify MQTT/WebSocket
> traffic. There is no guaranteed bypass. For high-risk environments, use a
> trusted network/VPN you are authorized to use.

### If inbound 80/443 is not possible

- **Cloudflare Tunnel**: expose `mosquitto:8084` as a WebSocket service. Point
  Q7 Chat at the tunnel's `wss://...` URL.
- **Existing reverse proxy**: place Caddy/Nginx in front of Mosquitto and
  forward a WebSocket path to port 8084.
- **Home/office VPS**: any small VPS with 443 open is enough.

### Vercel note

Vercel can host the static Q7 Chat app, but it cannot host the long-lived MQTT
WebSocket broker. Host the relay on a VPS, Cloudflare Tunnel target, or any
WebSocket-capable server.
