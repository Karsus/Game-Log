# Game Log

A private collection and trophy-hunting app built with React, Vite, Express, and MongoDB.

## Try the sample collection

Requires Node.js **24.15 or newer** and npm 10 or newer. From this repository:

```powershell
npm ci
npm run demo
```

Open **http://localhost:5041** and choose **Fill demo sign-in**, then **Sign in**.

The demo uses `demo@gamelog.local` / `GameLog-demo-2026!`. It starts a disposable MongoDB replica set and API on port 4051. It never uses the database in your `.env`. Sample progress and estimates are illustrative; all demo edits disappear when the process stops. The first demo or test run downloads a MongoDB binary into `.runtime/mongodb`. Stop with Ctrl+C.

## Use your own persistent collection

1. Install dependencies with `npm ci` if needed. Keep the existing `enviroments/.env`; the directory spelling is retained from the original project. For a fresh checkout, copy `enviroments/.env.example` to `enviroments/.env`.
2. Set `MONGO_URI` to a MongoDB replica set, such as a MongoDB Atlas cluster or a local replica set. Transactions are used for imports, hunt activation, and cascading deletion; standalone MongoDB servers are not supported for these operations. Keep `PORT=4050`, `SITE_URL=http://localhost:5040`, `SERVER_URL=http://localhost:4050`, and `VITE_API_URL=/api` for the default development setup.
3. Run `npm run dev`, open **http://localhost:5040**, and create your account. This starts an empty personal collection with the shared platform catalog. No demo records are inserted.

The app stores collection data and sessions in MongoDB. A development session secret is generated in `.runtime/session-secret` when none is configured. Preserve that file to keep existing sessions across restarts. The API binds to localhost by default.

If port 5040 is already in use, stop the previous development process you own before restarting. Vite deliberately fails instead of silently selecting a different port. If changing the development API port, also update the proxy target in `client/vite.config.js`.

## Collection model

- **Platform catalog:** shared platform definitions plus private custom platforms. PC hardware and achievement services such as Steam are separate concepts.
- **Owned hardware:** individual devices with their own nickname, model, storage, color, serial number, condition, acquisition details, location, and notes. Two PS5 units remain two records under one platform.
- **Games:** one editable entry with release platforms, metadata, personal notes/rating, and wishlist selections.
- **Copies:** any number of physical or digital copies per game/platform, with edition, region, packaging, storefront, purchase information, and owned/lent/sold/lost state. Owned and lent copies count toward the current collection.
- **Hunts:** separate progress for each game, platform, achievement service, and optional edition/list label. Copies on the same platform can share a hunt; an additional label creates a separate regional or edition trophy list.

## Hunt board rules

Enable **Show on Trophy Hunts** from a game, or choose **Add hunt** on the board. The setup form includes **expected difficulty / 10** and **expected hours**. Difficulty accepts whole numbers from 1 to 10; hours can include decimals. Both can remain unknown. Estimates are your own, not official trophy-guide ratings.

Difficulty is always the outer grouping. Columns run from easiest to hardest, with a separate unknown column last. Different whole-number difficulties never share a column. Legacy fractional estimates and saved difficulty filters round to the nearest integer on server startup (2.5 becomes 3); older JSON backups are normalized during import. Hours and progress are preserved. Horizontal scrolling on smaller screens preserves this layout. The board uses compact, read-only rows with the entire row colored by status. Click the pencil to edit in a dialog, or the game title to open its trophy log. Click a difficulty heading to collapse or expand its list; the count and column remain visible.

Sort by expected time, status, date added, or game title in either direction **within each difficulty column**. Unknown times remain last in both directions. Forward status order is Priority, In progress, Planned, Completed, Dropped. Date added is the hunt's original creation time; hiding and showing a game does not reset it.

Status colors are yellow for In progress, red for Dropped, green for completion, and orange/gold for Priority. Completed PlayStation platinum goals say **Platinumed**; achievement goals use **Achievements completed**. A game without a platinum can still have an achievement or custom goal. Platinum, base-game completion, and 100% including DLC are separate milestones. Completing a checklist never silently awards a platinum.

Use platform, ownership, achievement service, status, and difficulty filters. **Save defaults** stores the current page's filters and sort for your account. Catalog and board defaults are independent. Search text is temporary. Explicit URL parameters override saved values; **Restore defaults** reapplies saved preferences and **Clear** resets only the current view. Games you hide keep all progress and notebooks.

## Trophy notebook

Each hunt has its own chapter/section notebook. Add a single reminder or paste one item per line. Items support categories, nested subtasks, counters, notes, guide links, and a missable flag. Reorder sections/items, and switch between the list and chapter-by-category grid; both edit the same data.

Changes save immediately. Failed saves keep the draft visible, with retry, download, and reload controls. Unsaved drafts also remain in this browser tab's session storage, scoped to the account and hunt, so navigating away and returning can recover them. Concurrent writes are rejected instead of overwriting another window's notebook. Download a conflicting draft before reloading the current server version.

**Copy to hunt** replaces the destination notebook with a copy and resets its checkboxes/counters. The source remains unchanged.

## Optional IGDB lookup

Manual entry works without an external account. IGDB's API is [free for non-commercial use](https://api-docs.igdb.com/#account-creation) and requires a confidential Twitch developer application. Configure these **server-only** values in `enviroments/.env`, then restart the server:

```dotenv
IGDB_CLIENT_ID=your-client-id
IGDB_CLIENT_SECRET=your-client-secret
```

Follow the [official IGDB setup instructions](https://api-docs.igdb.com/#getting-started) when creating credentials. Do not use a `VITE_` prefix for secrets. Search fills the unsaved form with title, cover, summary, developers/publishers, genres, year, and mapped release platforms/dates. Review before saving. Unrecognized platforms can be added manually; the earliest dated regional release is used per mapped platform. The server caches results, renews OAuth tokens, and serializes API calls within IGDB's rate limit. Provider failures leave manual entry available.

Gaming account synchronization and automatic trophy imports are not part of this version.

## Backups and exports

Settings provides versioned JSON export and a validated preview before import. A backup contains private platforms, games, copies, devices, hunts/notebooks, and preferences, with no passwords or session data.

Import **adds** new records with remapped IDs and restores the backup's preferences. It does not merge duplicate games or overwrite existing collection records. Importing the same backup twice creates duplicates. Import writes are transactional. The maximum upload is 10 MB. The catalog and hunt board also export their current filtered view as CSV, with spreadsheet formula injection protection.

## Account recovery

Password changes require the current password and revoke other sessions. Email recovery is optional; configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and the correct `SITE_URL`. Without SMTP, the UI explains that email recovery is unavailable. Reset links expire after 30 minutes and are single use. Test SMTP with a local mail capture service before enabling delivery.

## Production deployment

The repository is prepared for a single-origin deployment; it has not been published.

1. Provide MongoDB replica-set access and a persistent, random `SESSION_SECRET` in server environment variables. Configure `NODE_ENV=production`, `SITE_URL` and `SERVER_URL` to the public HTTPS origin, and `PORT` to the application port. Keep `VITE_API_URL=/api`.
2. Run `npm ci` and `npm run build`. The server serves `client/dist` plus `/api` in production.
3. Run `npm start` behind an HTTPS reverse proxy. Set `TRUST_PROXY` to the actual number of trusted proxy hops (usually `1` for one proxy). Secure cookies require HTTPS. `HOST` defaults to `127.0.0.1`; explicitly configure it for the hosting environment when needed.
4. After creating intended accounts, optionally set `ALLOW_REGISTRATION=false`. Configure SMTP if password recovery is needed. Back up MongoDB and verify JSON exports before relying on the deployment.

Useful health endpoint: `/api/health`. Never expose `.env`, `.runtime`, or `.local-backups` as public assets. The only static directory served is `client/dist`.

## Verification and code layout

```powershell
npm test
npm run build
npm audit
```

Tests use their own disposable database and never read `MONGO_URI`. They cover authentication/CSRF, cross-account isolation, hardware/copies, hunt visibility and estimates, completion rules, notebook revisions/copying, password session revocation, backup integrity, mocked metadata responses/failures, every board sort/direction, saved filters, combined catalog filters, CSV safety, and notebook interactions/draft recovery.

| Location | Responsibility |
| --- | --- |
| `client/src/pages` | Dashboard, collection, platforms, hunts, account settings |
| `client/src/components` | Forms, notebook, filters, shared controls |
| `client/src/lib/domain.js` | Difficulty grouping, sorting, filtering, progress |
| `server/domain` | Active Mongoose models, Zod validation, platform seeds, security |
| `server/app.js`, `auth.js`, `api.js` | Application setup, sessions/authentication, private CRUD |
| `server/metadata.js`, `backup.js` | IGDB adapter and backup handling |
| `server/scripts/demo.js` | Isolated sample environment |

The old draft files in `server/models` are preserved and are not loaded by the application. Pre-implementation copies of the existing server/draft files are in the ignored `.local-backups/pre-implementation` folder. See `IMPLEMENTATION_STATUS.md` for the implementation checkpoint and usage-limit handoff rule.
