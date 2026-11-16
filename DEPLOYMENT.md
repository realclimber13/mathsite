# Mathsite browser

The new browser interface is in `public/`. It uses the existing authenticated Node server, pinned Scramjet engine, and Wisp relay without changing access controls.

## Full proxy server

Deploy this repository's **root directory** on a host supporting Node 22–24, WebSockets, and outbound TCP. Use:

- Build: `npm ci --omit=dev`
- Start: `npm start`
- Health check: `/healthz`
- Secret environment variable: `ACCESS_PASSWORD` (at least 12 characters)
- Public HTTPS endpoint; one instance (sessions are held in memory).

The root `package.json` is already standalone. The old README's `proxy-deployment` folder instructions do not apply to this checkout.

Open the server URL directly and sign in. The UI loads Scramjet and its service worker, then creates a proxied frame per tab. Site compatibility varies; DRM, anti-bot challenges, and certain login flows are not guaranteed.

## Sites workspace

Run `node scripts/build-workspace.mjs` to build the static launchpad for Sites. Sites cannot run the existing Node TCP relay. In Settings, save the HTTPS URL of your separately deployed Mathsite server. Opening a website then transfers you to that server's complete browser, where its password sign-in applies. It is deliberately not embedded across origins.

Bookmarks, shortcuts, theme, search preferences, and up to 300 history entries are stored on each browser origin. Bookmarks can be exported/imported. Tabs last for the current page session. The interface does not claim anonymity or universal website support.

Source: https://github.com/realclimber13/mathsite · AGPL-3.0-only. Scramjet, Libcurl transport, and Wisp retain their upstream licenses.
