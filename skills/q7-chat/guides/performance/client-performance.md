# Client-side performance in Q7 Chat

Q7 Chat is a PWA-ready Next.js app with 72-hour message expiry. Keep interactions responsive and minimize long tasks on the main thread.

## Break up long tasks

Break heavy synchronous processing (complex computations, long loops, large DOM updates) into chunks using `scheduler.yield()` or `setTimeout(..., 0)` so the browser can handle user input and repaint. This improves Interaction to Next Paint (INP).

```js
await scheduler.yield(); // let the browser breathe between chunks
```

## Optimize First Load JS

Next.js static prerenders pages. Keep route segments small and avoid importing heavy libraries into shared chunks. The composer, thread, and chat list should lazy-load only what they need per view.

## Cache static assets

The service worker (`public/sw.js`) caches core assets (`/`, `/manifest.webmanifest`, `/logo.svg`) for offline-first loading. Keep this cache list small and versioned (`CACHE = "q7-v1"`).

## Respect prefers-reduced-motion

Disable or simplify animations when the user prefers reduced motion. This reduces compositor work and respects accessibility settings.

## Fallback strategies

If `scheduler.yield()` is unavailable, fall back to `await new Promise((r) => setTimeout(r, 0))`.
