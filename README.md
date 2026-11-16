# Gbo / 25 — ready for Render Free + Supabase Free

The website uses Supabase Postgres for wishes, photos, host sessions and spam limits. Render can restart or redeploy without losing them. No paid persistent disk is needed.

## Your database is set up

The `supabase-setup.sql` script was run successfully on your project on 16 November 2026. A live test verified saving a wish/photo, keeping pending photos private, approval, retrieving identical photo bytes from a new connection, and deleting the temporary test record.

For another project, run the entire script in its Supabase SQL Editor once. It creates an isolated `gbo` schema and a server-only function. Anonymous and signed-in browser users have no direct access. The publishable key is not used by this app.

## Deploy on Render — free plan

1. Use repository `sopeBoyega/gbo-25`, branch `main`.
2. Choose **Docker** as the runtime and **Free** as the instance type. The Dockerfile installs dependencies and starts the server.
3. Add these environment variables privately in Render:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://krhqxgtmmzmpsecwqkhk.supabase.co` |
| `SUPABASE_SECRET_KEY` | Your Supabase `sb_secret_...` key (server only) |
| `ADMIN_PASSWORD` | A random password of at least 24 characters |
| `RATE_SECRET` | A different random string of at least 32 characters |

The existing Dockerfile sets `NODE_ENV=production`, `HOST=0.0.0.0` and the port. The server automatically uses Render's `RENDER_EXTERNAL_URL` for form-origin validation. If you later add a custom domain, set `APP_ORIGIN` to that exact HTTPS origin without a trailing slash.

4. Set health check path to `/health` and deploy. **Do not add a persistent disk.**
5. Open the site and submit a wish. Open `/admin`, sign in with `ADMIN_PASSWORD` and approve it. Share the homepage URL.

Render Free can sleep after inactivity, so the first visitor may wait for it to wake. Supabase Free can pause inactive projects; check the dashboard if you return after a long gap. Both services have usage quotas.

## Photos and safeguards

Photos are stored durably inside Postgres as binary data. This avoids needing a separate bucket for this small event. The app caps stored image data at 256 MiB to leave room within the free database allowance, and caps entries at 3,000. Monitor project usage in Supabase.

Uploads accept still JPEG/PNG/WebP up to 20 MB and 50 megapixels, covering 48 MP iPhone JPEGs. HEIC/HEIF originals must be exported or shared as JPEG first. The server decodes, resizes and re-encodes photos as JPEG, stripping EXIF/GPS metadata. One large upload is processed at a time to fit Render Free memory, with up to two minutes to receive the request. Every submission waits for host approval. Pending photos are accessible only to the host; public photo routes recheck approval. The host can unpublish or delete entries.

Other safeguards include exact-origin write checks, escaped text rendering, restricted security headers, expiring HttpOnly host sessions, signed form tokens, rate limits stored in Supabase and an atomic database capacity check. The database function accepts only the application's fixed query list and is executable only with the server role.

Default rate limits group visitors by the direct peer address. Behind Render's proxy this can group visitors together. Set `TRUST_PROXY=1` only after verifying that the service is exclusively behind a trusted proxy which strips or appends `X-Forwarded-For` correctly; the app uses its rightmost address.

## Run locally

Install Node.js 24 LTS, then:

```sh
npm install
npm run setup
npm start
```

Without `SUPABASE_URL`, development uses local SQLite. To use the hosted database locally, add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` to the ignored `.env` file. Never commit that file. Production requires Supabase so an accidental Render configuration cannot silently use temporary storage.

## Tests

```sh
npm test
node --env-file=.env tests/supabase-live.mjs
```

The first command tests HTTP submission, moderation, privacy, invalid uploads, origin checks, rate limiting and restart persistence using isolated local data. The second is an opt-in test against the configured Supabase project; it creates and deletes one temporary test record.

## Personalize and back up

Edit `site.config.json` for the name, age, intro, absolute birthday and timezone. Gbo's birthday is 16 November 2026, Africa/Lagos. Replace `public/assets/gbo.jpg` for a different portrait. The portrait was selected from your open Google Photos collection and stripped of metadata.

Export the `gbo` schema and its data regularly using a Postgres-compatible backup tool. Photos are included in the database, so no separate file backup is needed. Keep backups private and test restoration. Deletion removes live access; old backups can retain deleted records until expired. Existing local SQLite submissions are not automatically migrated; check them before switching a previously used live site.
