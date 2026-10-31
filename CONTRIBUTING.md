# Contributing to Q7 Chat

Thanks for taking the time to contribute. This project is security-sensitive and privacy-focused, so small, well-tested changes are preferred over large rewrites.

## Before you start

- Read [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and, for protocol work, [PROTOCOL.md](PROTOCOL.md).
- Search existing issues and pull requests to avoid duplicate work.
- For security vulnerabilities, **do not open a public issue**. Follow [SECURITY.md](SECURITY.md).
- For large features or protocol changes, open an issue first so the design can be discussed.

## Development setup

Requirements: Node.js 18.17+ (Node 20 LTS recommended), npm 9+, and a modern browser.

```bash
git clone https://github.com/<your-org>/q7-message.git
cd q7-message
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm run typecheck
npm test
npm run build
```

## Pull requests

1. Fork the repository and create a topic branch from `main`.
2. Keep the change focused. Separate refactors from behaviour changes.
3. Add or update tests for behaviour changes.
4. Update documentation when user-facing behaviour, setup or security assumptions change.
5. Fill in the pull request template, including how you tested the change.
6. Make sure CI is green.

### Commit messages

Use short, imperative subjects. Conventional Commits are welcome but not required:

```text
feat: add contact verification shortcut
fix: clear expired blobs on visibility change
docs: explain relay mailbox retention
test: cover replayed Q7RP frames
```

### Code style

- TypeScript strict mode is enabled; do not introduce `any` without a good reason.
- Follow the existing formatting: 2-space indentation, double quotes, semicolons.
- Keep components small and colocate UI logic with the component that needs it.
- Prefer the existing helpers in `lib/` over new dependencies.
- Do not add analytics, trackers or third-party scripts.
- New runtime dependencies need a justification in the pull request.

### Security-sensitive changes

Changes to any of the following need extra review and tests:

- `lib/p2p/crypto.ts`, `q7rp.ts`, `manager.ts`, `mqtt.ts`, `rtc.ts`
- `lib/vault.ts` and `lib/db.ts`
- `next.config.mjs` (CSP and headers)
- attachment validation in `lib/attach.ts`
- anything that handles incoming network data

Describe the threat model impact in the pull request. Do not weaken validation to make a test pass.

### Translations

See [docs/TRANSLATIONS.md](docs/TRANSLATIONS.md). Keep key order and placeholders identical to `langs/en.json`, then run `npm test`.

## Good first issues

- Fix an accessibility issue.
- Improve a translation.
- Add a protocol edge-case test.
- Improve documentation or examples.
- Polish empty states and error messages.

## Code of conduct

All contributors must follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Be respectful, assume good intent, and keep discussions technical.

## License

By submitting a contribution, you agree that it is your original work (or you have the right to submit it) and that it is licensed under the **Mozilla Public License 2.0**. No contributor license agreement is required.
