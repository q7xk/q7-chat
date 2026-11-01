// Phase 1 CSP: script-src keeps 'unsafe-inline' because Next injects inline
// bootstrap scripts. Tighten with per-request nonces before production.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:", // https: only used for opt-in external image previews
  "connect-src 'self' wss: https://api.giphy.com", // GIF picker talks to GIPHY directly
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          // Camera/QR scanning, voice notes and location sharing are opt-in and
          // only allowed for this origin. Adjust if you remove those features.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
        ],
      },
    ];
  },
};
export default nextConfig;
