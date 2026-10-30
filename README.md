# Mathsite deployment

A deployable, password-protected Scramjet browser and Wisp relay for
[`realclimber13/mathsite`](https://github.com/realclimber13/mathsite).

This folder is a standalone Node application. It uses pinned, prebuilt packages
from the same Scramjet project, so deployment does not compile the repository's
Rust rewriter or install its pnpm development workspace. The repository's
existing engine source stays available for development; edits to that source do
not change the published engine used by this application.

## 1. Add the folder to your existing fork

1. Unzip `mathsite-deployment.zip`.
2. Open <https://github.com/realclimber13/mathsite>.
3. Choose **Add file → Upload files** and drag the entire `proxy-deployment`
   folder into the upload area.
4. Check that the paths include `proxy-deployment/package.json`,
   `proxy-deployment/package-lock.json`, `proxy-deployment/server.mjs`, and
   `proxy-deployment/public/index.html`.
5. Commit the uploaded files to the branch you deploy, normally `main`.

Upload the extracted folder, not the ZIP itself. These files have been prepared
locally; downloading them does not automatically change your GitHub repository.

## 2. Configure the Render web service

Use your existing `realclimber13/mathsite` repository. In the service's settings,
set the following values:

| Setting | Value |
| --- | --- |
| Service type | Web Service |
| Branch | `main` |
| Runtime / Language | Node |
| Root Directory | `proxy-deployment` |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |

Add these environment variables in Render:

| Name | Value |
| --- | --- |
| `NODE_VERSION` | `24` |
| `ACCESS_PASSWORD` | A password you choose, containing at least 12 characters |

Keep your password in Render's environment settings. Do not put it in a GitHub
file. The application intentionally refuses to start without this password.

Save the settings, then deploy the latest commit. If your previous attempts used
Rust or the repository root, clear the old build cache for the first deployment
with these settings.

The **Root Directory** setting is essential: the commands must run inside
`proxy-deployment`. Running npm at the original repository root still encounters
the pnpm workspace's `catalog:` dependency references.

Render provides `PORT` and `RENDER` automatically. The server listens on
`0.0.0.0:$PORT`, serves the app and WebSocket relay on that one port, and uses
Render's HTTPS endpoint. You do not need a separate Wisp deployment.

After deployment, open the service's HTTPS URL directly, enter your access
password, and try `https://example.com/` in its address bar.

### If deployment fails

| Message / symptom | Check |
| --- | --- |
| `Could not find Cargo.toml` | Select Node and remove the old Cargo build command. |
| `Unsupported URL Type "catalog:"` | Set Root Directory to `proxy-deployment`, and confirm that folder was committed. |
| `Missing script: start` | You are running against the old root package or an old commit. |
| `Set ACCESS_PASSWORD...` | Add `ACCESS_PASSWORD` with at least 12 characters in Render. |
| `Cannot deploy` before any build log | Capture the complete on-screen error; build commands cannot diagnose an account or repository-access rejection. |
| App opens, but engine cannot start | Open the HTTPS URL directly, reload, and expand the page's technical details. |

These changes address application build and startup errors. Deployment and use
still depend on the hosting provider accepting the application and its intended
use. The package preserves the project's identity and attribution.

## Local development

From this folder, with Node 24 installed:

```sh
npm ci --omit=dev
```

Set `ACCESS_PASSWORD` in your shell, then run:

```sh
npm start
```

The local default URL is <http://localhost:8080>. Service workers require a secure
context; `localhost` works for local development, while remote deployment uses
HTTPS. On hosts other than Render, configure HTTPS and the trusted reverse proxy
appropriately before exposing the service.

## Application behavior

- Serves the browser interface, Scramjet JavaScript/WebAssembly, service worker,
  libcurl transport, and Wisp WebSocket endpoint from the same origin.
- Requires the access password for both the interface and the relay. Session
  cookies are HttpOnly and expire after 24 hours or a server restart.
- Limits failed password attempts and rejects relay WebSocket requests from
  other origins.
- Allows TCP destinations on ports 80 and 443. Private addresses, loopback
  addresses, direct IP destinations, and UDP streams are disabled in Wisp.
- Provides URL entry, back, forward, reload, and visible initialization errors.
- Uses an in-memory session secret. Run one server instance; restarting it signs
  everyone out.

This is a website compatibility layer, not a guarantee that every website will
work. Site-specific authentication, anti-bot checks, protected video, and browser
features can need additional work. The packages are pinned; review and test
updates before changing their versions.

## Connecting your Base44 app

First confirm the deployed URL works by opening it directly. Your Base44 UI can
then link to that URL, or to `/?url=` followed by a URL-encoded website address.
Users still sign in with the service password. A first-time sign-in returns to
the main page; enter the destination again if needed.

This package does not modify the Base44 app. Embedding the service inside a
cross-origin iframe needs separate work because the engine uses cross-origin
isolation and this application's login cookie is `SameSite=Lax`.

## Validation

Checked locally on Node 24.22.1: a clean dependency install outside the original
workspace, server startup, native browser login, service-worker and engine
initialization, authenticated WebSocket access, and cross-origin rejection.
A controlled local HTTP fixture also passed through the complete proxy path,
including relative CSS and JavaScript, a button interaction, a relative JSON
fetch, reload, mobile layout, and logout. The fixture's temporary network
settings existed only in the test process; this package retains its production
destination restrictions.

The test environment could not complete the external HTTPS check. External
website compatibility and the actual Render deployment still need verification
after uploading these files and applying the settings above.

## Components and source

| Component | Pinned version | Source |
| --- | --- | --- |
| Scramjet | `2.0.67-alpha.2` | <https://github.com/MercuryWorkshop/scramjet> |
| Scramjet controller | `0.0.14` | <https://github.com/MercuryWorkshop/scramjet> |
| Libcurl transport | `2.0.5` | <https://github.com/MercuryWorkshop/libcurl-transport> |
| Wisp | `0.4.1` | <https://github.com/MercuryWorkshop/wisp-js> |
| Express | `5.3.0` | <https://github.com/expressjs/express> |

The local navigation plugin follows the URL-watching and escaped-link hooks in
Scramjet's `packages/utils/src` source. The published `scramjet-utils@0.0.3`
targets older engine versions and is deliberately not loaded.

This deployment package is provided under AGPL-3.0-only; see `LICENSE`. Upstream
components retain their respective licenses and notices. The interface links
back to the fork and to Mercury Workshop's source.

## Reference documentation

- [Render: setting a root directory](https://render.com/docs/monorepo-support)
- [Render: Node web services](https://render.com/docs/deploy-node-express-app)
- [Render: Node versions](https://render.com/docs/node-version)
- [Render: default environment variables](https://render.com/docs/environment-variables)
- [GitHub: uploading files](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
- [pnpm: catalogs](https://pnpm.io/catalogs)
