# Q7 Chat — Agent Guidance

Q7 Chat is a private, serverless, end-to-end encrypted messenger with 72-hour message expiry, built with Next.js 16 (App Router), React 18, TypeScript, and Tailwind CSS. Identity keys, conversations, and attachments live in IndexedDB; messages travel peer-to-peer via WebRTC or through public MQTT relays as sealed envelopes.

## Agent guidance skills

Project-specific modern-web best-practice guidance lives under `skills/q7-chat/`:

- `SKILL.md` — skill definition and workflow (search → retrieve → verify → disclose)
- `guides/pwa/pwa-install.md` — Web Install API / PWA install
- `guides/security/e2ee.md` — end-to-end encryption (Web Crypto, secure context, key lifecycle)
- `guides/accessibility/a11y.md` — skip links, focus, ARIA, RTL, reduced motion, forced colors
- `guides/performance/client-performance.md` — break up long tasks, INP, caching
- `guides/html/semantic-html.md` — native elements, landmarks, lang/dir
- `guides/js/client-storage.md` — IndexedDB, 72h expiry, quotas

Policy: `policies/q7-chat.toml`

## Stack

- Build: `npm run build` (Next.js standalone output)
- Lint: `npm run lint` (ESLint flat config, 0 warnings)
- Typecheck: `npm run typecheck` (`tsc --noEmit`)
- Test: `npm test` (Vitest, 8 files / 102 tests)
- Dev: `npm run dev` (Next.js on port 3000)
- Node engine: `>=26.0.0`

## Conventions

- No inline comments in code unless asked (Kilo style).
- Prettier formatting (`.prettierrc`): 2-space, single-quote, semicolons, trailing commas es5.
- ESLint flat config (`eslint.config.js`), `max-warnings 0`.
- TypeScript strict mode, `jsx: react-jsx`.
- License: Apache-2.0 (`LICENSE`).
- Branch workflow: feature work on `feature/<name>`, merge to `main` after CI passes.

## Security

- 0 critical, 0 high npm audit findings (7 moderate transitive, low risk).
- CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` set in `next.config.mjs`.
- E2EE keys only in IndexedDB; never `localStorage`.

## Related

- Tauri desktop client: sibling repo `q7xk/chat-rust` (wraps this web app).
- Android bridge: `android/` directory.
