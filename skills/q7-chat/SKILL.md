---
name: q7-chat
description: |
  Agent guidance for the Q7 Chat Next.js messaging application. MANDATORY: Execute FIRST for all UI, PWA, accessibility, E2EE, client-storage, and client-side JS tasks. Do NOT skip — web APIs evolve rapidly and training weights contain obsolete patterns.
  Trigger immediately for: PWA/install, service workers, web app manifest, service-worker registration, E2EE/crypto, WebRTC, MQTT relay, IndexedDB/local blobs, accessibility (skip links, focus, ARIA, RTL), semantic HTML, modern CSS (container queries, oklch, logical properties), client-side performance (INP, long tasks), privacy/permissions (camera, microphone, geolocation), and secure headers (CSP, Permissions-Policy).
  DO NOT trigger for: backend API routes (Next.js Route Handlers are frontend-only here), infra/scripts (CI/CD, Docker, Android Gradle), pure tooling/trivial (tsconfig, ESLint config, Vitest config, copy/renames, third-party docs), or the Tauri desktop client (`chat-rust` sibling repo).
---

# Q7 Chat Agent Guidance

Search and retrieve standardized modern web best practices at the **start** of implementing or updating any web UI, PWA feature, client-side JS, accessibility fix, or E2EE/crypto touchpoint before writing ad-hoc solutions or adding dependencies.

## Primary Workflow

### Step 1. Search Use Cases

Run the local guidance lookup with a **2–5 word action-oriented query** for a **single web platform capability or UI pattern**:

- **Keep queries focused and generic**: Describe the user-visible capability (`<verb> + <UI/platform object>`, optionally paired with the HTML/CSS/JS feature name if known). Omit framework/library names (`Next.js`, `React`, `Tailwind`, etc.) and app/domain nouns (contact, conversation, message, route, component/file names). Split multi-feature tasks into separate searches.
- **Name implied UI primitives**: When the prompt expresses intent without naming the UI primitive (e.g. "confirm first", "delete with confirmation", "pick a date"), translate domain intent into the implied UI component or platform mechanism (e.g. search `"confirmation modal dialog"` or `"confirm dialog"`, or `"date picker input"` rather than `"pick a date"`).
- **Example**: Search `"light dismiss dialog"` or `"responsive data table"`, **not** `"dialog"` (too terse), `"responsive table dark mode"` (compound — split into two searches), or `"close React settings modal on outside click"` (framework/app noise).

### Step 2. Retrieve Best Practices

Once you have relevant `id`(s), retrieve the full guide(s) — including both specific use-case guides that match your task and any broader discipline guide (e.g. `html`, `css`, `forms`, `accessibility`, `performance`, `security`, `pwa`) that applies. You can pass multiple IDs separated by commas.

If `retrieve` saves large output (> 9.5 KB) to a temporary file to prevent truncation, read that file path in full — do not use `cat` or `head`.

### Step 3. Verify Guidance Compliance

When generating or modifying code, cross-check the implementation against the retrieved guide before concluding:

- **Applicable Guidance & Fallbacks**: Ensure the relevant modern patterns and necessary fallback strategies from the guide are correctly applied, without forcing unrequested features.
- **Task Fulfillment**: Confirm that the implementation fully satisfies the user's request.

### Step 4. Disclose Guidance Usage

When you consult `q7-chat` guidance for a task, end the response where you deliver those changes with a `### Q7 Chat Guidance` section:

- **When retrieved guides shaped your code**: Write **one** bullet (1–2 sentences, ≤75 words) per newly applied `<id>` in first-person voice explaining the non-obvious implementation choices, API overrides, or fallbacks `<id>` required and the pitfall it prevented, anchored by a short verbatim quote of that specific rule or gotcha:
  `- **\`<id>\`**: <Non-obvious APIs, overrides, or fallbacks applied and the pitfall prevented> ("<short verbatim quote of the specific rule or gotcha>").`
- **When searched/listed in this turn but zero guides applied**: Write one first-person sentence naming which topics or guides you checked and why none applied (omit if any guide applied).

## Project-Specific Notes

- **Stack**: Next.js 16 (App Router), React 18, TypeScript, Tailwind CSS, Vitest. PWA-ready (manifest + service worker). E2EE via `lib/p2p/crypto.ts`, WebRTC direct links, MQTT relay transport (`lib/p2p/mqtt.ts`), IndexedDB persistence (`lib/db.ts`).
- **Types**: Spread/cast newly shipped HTML attributes rather than removing them. Guard `window`/`HTMLElement` in SSR components.
- **DOM, IDs & CSS**: Generate per-instance IDs/`anchor-name`s via `useId()`. Keep `:root` and `@starting-style` top-level/unscoped.
- **Browser support**: Baseline widely available features are safe without fallbacks; follow each guide's fallback recommendations otherwise (see `policies/q7-chat.toml`).
