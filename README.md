# Gbo / 25 — The Birthday Archive

A complete birthday tribute for **Gbo**, turning **25 on 16 November 2026**, using the Africa/Lagos timezone. Original red-and-black streetwear art direction, oversized lettering, angled folder tabs and a portrait selected from the open Google Photos collection. No Corteiz logos or affiliation claims.

## Run locally

Install **Node.js 24 LTS** (includes npm), then open a terminal in this folder:

```sh
npx pnpm@11.25.0 install --frozen-lockfile --ignore-scripts
npm run setup
npm start
```

Open **http://localhost:3000**. Open **http://localhost:3000/admin** to review submissions. Your randomly generated host password is the `ADMIN_PASSWORD` value in the new `.env` file. Keep this file private. Setup never overwrites existing settings.

Alternatively, `npm install` works, but pnpm uses the supplied lockfile to reproduce the tested dependency selection. There is no frontend build step.

## What works

- Anyone with the deployed link can leave a name, birthday message and optional JPEG, PNG or WebP photo; no visitor account required.
- Wishes and photos are saved in **SQLite**, including image bytes as BLOBs. This is actual server persistence, shared across browsers, not browser local storage.
- New submissions are **pending**. The `/admin` desk lets the host preview photos, approve, unpublish, and permanently delete entries. Only approved entries and photos can be read publicly.
- The public archive has wishes and photos filters, counts, pagination, image lightboxes, a copy-link button, loading/error/empty states, and a birthday countdown that changes on the date.
- Responsive layout, keyboard focus, labeled controls, native accessible dialogs, reduced-motion support, and text-only rendering of user content.

## Deploy on Render (simple hosted option)

This application needs a server and **persistent disk**. A static-only deployment to GitHub Pages, Netlify static hosting or Vercel static hosting will not run it.

1. Put this folder's files in your own Git repository. Do **not** commit `.env`, `data/`, or test/preview data. The portrait is included in the source; keep the repository private if you do not want the source asset publicly downloadable there.
2. In Render, create a **Web Service** from that repository and select **Docker**. The supplied Dockerfile installs locked dependencies and runs the server as a non-root user. Keep one service instance.
3. Choose a plan that supports a persistent disk. This is a paid hosting feature; check the current plan and disk charges before ordering.
4. Add a persistent disk mounted at **`/app/data`**, at least **2 GB**. Only data written on this mount survives redeployment.
5. Set these environment variables in the hosting dashboard:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `APP_ORIGIN` | Your exact `https://your-service.onrender.com` origin, no trailing slash |
| `ADMIN_PASSWORD` | A unique random secret, at least 24 characters |
| `RATE_SECRET` | A different random secret, at least 32 characters |
| `DATA_DIR` | `/app/data` |
| `TRUST_PROXY` | `0` initially; see proxy setup below |

   The Dockerfile already sets production, host, data path and port defaults. Render may supply `PORT`; the app respects it. Generate secrets locally with `npm run setup`, then copy the two values from `.env` into the dashboard. Do not place secrets in browser code, URLs or Git.
6. Set the health-check path to **`/health`**. Deploy, open the HTTPS site, submit a real test wish, then approve it through `/admin`. Reload in a different browser to verify it appears. Test one photo too, then delete the test entry from the host desk.
7. Share the public homepage URL. If you add a custom domain later, update `APP_ORIGIN` to that exact HTTPS origin and redeploy. Redirect the old origin to the new one so forms work consistently.

The code has been tested locally. No hosting account, domain or paid service has been provisioned as part of this delivery. The Docker image has not been built here because Docker is not installed.

Provider reference: [Render persistent disks](https://render.com/docs/disks).

## Deploy with Docker on a server

The included Compose file keeps the app on loopback port 3000, ready for an HTTPS reverse proxy:

1. Run `npm run setup` locally, then securely place the generated `.env` alongside the application on your server. Edit `APP_ORIGIN=https://birthday.your-domain.com` and `NODE_ENV=production`.
2. Run `docker compose up -d --build` on the server. The named `tribute-data` volume stores the database and photos. **Do not run `docker compose down -v`** unless you intend to erase this volume.
3. Point your domain's DNS to your server and configure Caddy using `Caddyfile.example`, replacing the example hostname. Caddy should run on the same server and proxy to `127.0.0.1:3000`; expose HTTPS through Caddy.
4. Verify the health page, a submission, host approval and photo retrieval before sharing.

Use exactly **one application instance** with a local persistent volume. Do not use ephemeral container storage or a network filesystem for SQLite. For multiple replicas, migrate the storage layer to a shared database and object storage first.

## Proxy setup and abuse limits

By default the app ignores forwarded IP headers and rate-limits the socket peer. Behind a proxy this can group visitors into the same limit. Set `TRUST_PROXY=1` only if the backend is reachable exclusively through a trusted proxy that strips or correctly appends `X-Forwarded-For`. The app uses the **rightmost** forwarded address (one trusted proxy hop). Configure and test your provider's actual proxy chain; do not enable this blindly or expose a directly reachable backend with this setting.

Limits are stored in SQLite and survive restarts: 8 submission attempts per network address per hour, 40 writes per 10 minutes, 5 login attempts per 15 minutes, and 300 total submission attempts per day. These are small-event defaults in `server.mjs`; a shared Wi-Fi network can hit the same limit. Edge rate limiting or a CAPTCHA service is recommended if the link spreads widely. The signed form token and honeypot are modest spam friction, not proof of a human.

## Photo handling and moderation

- Maximum input file size: **4 MB**. Maximum decoded image area: **24 megapixels**. Only still JPEG, PNG and WebP inputs are accepted; animated files and SVG are rejected.
- The server checks the decoded format and uses Sharp to decode, rotate, resize to fit 1600 × 1600, flatten transparency and re-encode as JPEG. Original filenames and original image bytes are discarded; EXIF/GPS and other metadata are not retained. See [Sharp output documentation](https://sharp.pixelplumbing.com/api-output/).
- Pending photos are available only through the authenticated host API. Public image routes also check approval, and use `no-store` so unpublishing takes effect on subsequent requests.
- All content needs **human approval** before it appears publicly. There is no automated nudity, face, copyright or malware classification service. Review each entry and photograph before approving it; a failed/broken preview should be deleted.
- Upload concurrency is limited to 3; the archive is capped at 3,000 entries and 512 MiB of stored image bytes. A full archive returns a clear error. These limits can be edited for the event.
- Parameterized database queries, restrictive security headers, exact-origin checks on writes, random IDs, server-side validation, constant-time password comparison, short-lived HttpOnly sessions and login throttling protect the application.
- Approved content is visible to anyone who has the URL. `noindex` is a request to search engines, **not access control**. Visitors can download or forward published photos.

## Personalize

Edit `site.config.json` for the name, age, birthday, timezone, intro and portrait alternative text. Restart the server after edits. The date is deliberately absolute: “tomorrow” in the request is **16 November 2026**, not the year mentioned in the older conversation preview.

For a future celebrant, also update the fixed wordmarks, headings and social metadata in `public/index.html` and `public/admin.html`. Replace `public/assets/gbo.jpg` to change the portrait. Colors, type and layout are in `public/style.css`; the hero uses a grayscale CSS treatment while keeping the underlying portrait in color.

## Database, migrations and backups

`schema.sql` creates the initial schema on first boot and is safe to run again. SQLite and its WAL files live under `DATA_DIR`; all photo bytes live in the same database. Node's [built-in SQLite API](https://nodejs.org/api/sqlite.html) is used, so Node 24 or newer is required.

Back up the entire persistent data directory **with the app stopped**, or use SQLite's online backup API. Do not copy only `tribute.sqlite` while the app is writing: recent transactions can still be in `tribute.sqlite-wal`. For a simple deployment, stop the service, snapshot/copy the volume, then restart. Store backups privately and test restoration to a separate volume. Keep `.env`/host secrets in a separate secure backup.

Restore while the app is stopped, preserving file ownership for the container's `node` user (UID 1000), then restart against the restored directory. Future schema changes should use explicit versioned migrations and a backup first; do not replace an existing live database.

Deletion removes an entry and its photo from live access. SQLite can retain unused pages and backups can retain deleted records. For physical reclamation, run SQLite `VACUUM` during a maintenance window and expire old backups according to your retention policy. Never publish database files or backups under `public/`.

## Tests and project map

```sh
npm test
```

Integration tests exercise real HTTP requests and a temporary SQLite database: photo re-encoding and metadata removal; pending-photo privacy; login and logout; approval, unpublishing and deletion; restart persistence; idempotent submission retries; invalid images; consent, validation and origin checks; and persistent rate limits. Test records are isolated from the real archive.

| File | Purpose |
| --- | --- |
| `server.mjs` | HTTP server, API, validation, sessions, rate limits and image processing |
| `schema.sql` | Database tables and indexes |
| `site.config.json` | Birthday and editable personal details |
| `public/index.html`, `public/style.css`, `public/app.js` | Responsive guest website |
| `public/admin.html`, `public/admin.js` | Host review desk |
| `public/assets/gbo.jpg` | Selected portrait, with metadata stripped |
| `tests/integration.test.mjs` | HTTP, persistence and security tests |
| `Dockerfile`, `compose.yaml`, `Caddyfile.example` | Deployment configuration |

If a form says “submit from the website itself,” check `APP_ORIGIN` exactly matches the URL in the browser. If submissions return 429, wait for the limit window or review trusted-proxy configuration. If photos fail validation, export a smaller JPEG/PNG/WebP from your photo app. If the host password is lost, replace `ADMIN_PASSWORD`, stop the server, clear the `sessions` table in the private database, and restart; do not expose database access publicly.
