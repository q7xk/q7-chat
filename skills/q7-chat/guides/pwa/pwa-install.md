# Installing the Q7 Chat web app

Use the Web Install API to give users an explicit, in-page way to install Q7 Chat as a standalone desktop/PWA application. Installation is always completed through browser-controlled consent UI; websites cannot silently install an app.

Use either the HTML `<install>` element or the JavaScript `navigator.install()` method.

## Choose which install approach to use

Decide based on the following considerations.

- `<install>` element:
  - Pros:
    - The browser provides the install control, ensuring a consistent and trustworthy installation experience.
    - No JavaScript required to trigger installation.
  - Cons:
    - Visual customization is restricted.
    - Capped by user-agent anti-spam limits; `navigator.install()` is a better fit for install UIs repeated across many views.

- JavaScript `navigator.install()` method:
  - Pros:
    - The installation UI can be fully customized to match Q7 Chat's M3 design.
    - No browser-imposed cap on the number of install UI elements.
  - Cons:
    - Requires JavaScript to trigger installation.
    - Triggers an initial `web-app-installation` permission prompt before the confirmation dialog.

## Prepare the web app manifest

The app being installed must have a web app manifest. Give the manifest a stable `id` so the browser can keep Q7 Chat's identity separate from its launch URL. Link the manifest from the document root layout.

```html
<link rel="manifest" href="/manifest.webmanifest" />
```

```json
{
  "id": "/",
  "name": "Q7 Chat",
  "short_name": "Q7 Chat",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0b0b0f",
  "theme_color": "#0b0b0f",
  "icons": [
    { "src": "/logo.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

Keep the manifest URL stable. The manifest must declare an `id` that is same-origin with the document.

## Use the HTML `<install>` element

The `<install>` element renders a user-agent-controlled button. Prefer it when the browser's standard label and presentation are appropriate, because the browser-owned control gives users a trustworthy installation affordance.

```html
<install></install>
```

Do not imitate, overlay, or transform the browser-controlled element. Its presentation and activation restrictions protect users from deceptive installation prompts.

## Use the JavaScript `navigator.install()` method

Use `navigator.install()` in a secure context (HTTPS) when custom page UI is necessary. Keep the button hidden until a supported installation mechanism is available. Call `navigator.install()` directly from the click handler so the call retains the required transient user activation.

```js
const supportsWebInstall = typeof Navigator.prototype.install === 'function';
let deferredInstallPrompt;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
});
```

Call `navigator.install()` with no arguments to install the current document's linked app; the manifest must declare an `id`.

## Fallback strategies

The Web Install API is a progressive enhancement. Browsers without either modern entry point still provide their own installation UI when they support installing web apps. Treat installation and standalone display as enhancements; do not block access to core messaging when manifest-based installation is unavailable. Use `beforeinstallprompt` as a fallback for browsers that do not support `navigator.install()`.
