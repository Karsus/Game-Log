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
2. Set `MONGO_URI` to your MongoDB database. A replica set, such as a MongoDB Atlas cluster or a local replica set, is recommended and required for backup imports. Creating/editing hunts and cascading game deletion also work on standalone MongoDB servers. Keep `PORT=4050`, `SITE_URL=http://localhost:5040`, `SERVER_URL=http://localhost:4050`, and `VITE_API_URL=/api` for the default development setup.
3. Run `npm run dev`, open **http://localhost:5040**, and create your account. This starts an empty personal collection with the shared platform catalog. No demo records are inserted.

The app stores collection data and sessions in MongoDB. A development session secret is generated in `.runtime/session-secret` when none is configured. Preserve that file to keep existing sessions across restarts. The API binds to localhost by default.

The development API uses Node's built-in watch mode to restart when its source modules change. Restart development processes manually after editing `.env` configuration.

If port 5040 is already in use, stop the previous development process you own before restarting. Vite deliberately fails instead of silently selecting a different port. If changing the development API port, also update the proxy target in `client/vite.config.js`.

If Windows denies port 5040 with `EACCES`, set `SITE_URL=http://localhost:5173` in `enviroments/.env`, restart both development processes with `npm run dev`, and open that URL. Vite reads its development port from `SITE_URL`, keeping it aligned with the API's allowed origin and password-reset links. Choose another available port if needed; use the exact `SITE_URL` address in your browser.

## Collection model

- **Platform catalog:** shared platform definitions plus private custom platforms. PC hardware and achievement services such as Steam are separate concepts.
- **Owned hardware:** individual devices with their own nickname, model, storage, color, serial number, condition, acquisition details, location, and notes. Two PS5 units remain two records under one platform.
- **Games:** one editable entry with release platforms, metadata, personal notes/rating, and wishlist selections.
- **Copies:** any number of physical or digital copies per game/platform, with edition, region, packaging, storefront, purchase information, and owned/lent/sold/lost state. Owned and lent copies count toward the current collection.
- **Storefronts:** choose a standard store such as Steam, Xbox Store, GOG, or Epic Store for each copy. Stores use stable IDs shared by the client and server, ready for future sorting and grouping. **Other** keeps a custom shop name; **Not specified** leaves the store blank. Existing names and older backups are normalized without discarding custom shops.
- **Subscription sources:** mark a game with Game Pass (or a specific Game Pass tier), PS Plus Basic, PS Plus Extra, or PS Plus Premium. These game-level choices do not need a platform and never count as owned games or copies. Use Basic for claimed monthly games and Extra/Premium for catalog access; choose the source of the game even if your membership includes a higher tier. A separate owned copy of the same game still counts normally.
- **Hunts:** separate progress for each game, platform, achievement service, and optional edition/list label. Copies on the same platform can share a hunt; an additional label creates a separate regional or edition trophy list.

Adding a game or changing its title/IGDB identity cannot duplicate another game in your account. Matches use the same IGDB ID or title after ignoring capitalization and extra whitespace; punctuation and accents remain significant. Release year and platform do not distinguish duplicates. The form shows the existing entry and offers **Open existing game**; add another copy or hunt there. Existing duplicates are preserved and still accept unrelated edits, so you can review and remove them yourself. This protection also applies to backup imports and simultaneous save requests.

**Delete game** removes the game, its copies, and its hunts/notebooks after confirmation. Replica sets commit the deletion together. Standalone MongoDB deletes related records first and the game last; if cleanup fails, the error explains that some records may already be removed and asks you to reload and retry. Export a backup before deleting anything you want to keep.

In **Add game** or **Edit game**, check the applicable sources under **Subscription access** and save. Existing games also have an **Edit subscriptions** button. Keep these source labels when your membership ends: current membership status is managed separately in Settings. Platforms remain part of copies and hunt setup. A new PC hunt defaults to Xbox for a Game Pass-only game or PlayStation for a PS Plus-only game; when both providers are selected it keeps the platform default, and you can always choose a different achievement service.

Library cards, tables, game details, hunt views, and CSV exports show **Active** or **Inactive** for each subscription source separately from ownership. Inactive games stay visible and editable; their tags, hunts, and notebooks are kept. Filter by all subscriptions, all Game Pass, all PS Plus, or a specific tier; these filters include active and inactive sources. Subscription selections apply to the whole game; platform filters still use its releases, copies, wishlist versions, and hunts. **Not owned** includes subscription games without an owned copy on the selected platform. Format filters apply to owned copies.

## Current memberships and expiration

All displayed and entered dates use **day/month/year (DD/MM/YYYY)**. Date fields accept this format or eight digits and retain a calendar picker. Invalid calendar dates are rejected. Collection tables, completion dates, backup previews, and CSV dates use the same order. Download filenames use DD-MM-YYYY; JSON backups and API values retain ISO dates for compatibility.

Use **Settings → My subscriptions** to select your current Game Pass and PS Plus tiers, optionally enter an **Active through** date, then choose **Save subscriptions**. New and older accounts start with both memberships set to **None**, so subscription sources are inactive until configured. Failed saves keep the entered draft. Set a provider to None to disable it, select a tier to reactivate it, or update/clear an expired date to renew access.

The end date is inclusive in the saved account time zone: access ends at the start of the following local day. Blank means no scheduled end. The first save uses your browser time zone; **Use browser time zone** changes the draft if you later want to update it. Status refreshes on load, local midnight, and when you return to the app. Saved membership status is separate from an unsaved form draft. Overlapping theme/filter and membership saves cannot overwrite each other's client state.

| Membership | Sources marked active while the membership is current |
| --- | --- |
| PS Plus Basic | Basic |
| PS Plus Extra | Basic, Extra |
| PS Plus Premium | Basic, Extra, Premium |
| Game Pass Essential (Core) | Essential (Core) |
| Game Pass Premium (Standard) | Essential (Core), Premium (Standard) |
| PC Game Pass | PC Game Pass |
| Game Pass Ultimate | Essential (Core), Premium (Standard), PC Game Pass, Ultimate |

Legacy **Game Pass** tags do not identify a tier and are marked active with any current Game Pass membership. Choose a specific source tier when known for precise coverage. Labels reflect the membership and sources you recorded; the app does not sync providers, check catalog departures, manage billing, or send renewal notifications. See the official [Xbox Game Pass plans](https://www.xbox.com/en-US/xbox-game-pass) and [PlayStation Plus plans](https://www.playstation.com/en-us/ps-plus/) for provider details.

Memberships are stored separately from theme/filter preferences through authenticated `PUT /api/memberships`. Changing memberships never edits game sources, copies, or trophy progress. JSON backups include membership tiers, dates, and time zone. Import preview explicitly shows when these settings will replace your current memberships; older version-1 backups without memberships preserve the current settings.

## Hunt board rules

Enable **Show on Trophy Hunts** from a game, or choose **Add hunt** on the board. The setup form includes **expected difficulty / 10** and **expected hours**. Difficulty accepts whole numbers from 1 to 10; hours can include decimals. Both can remain unknown. Estimates are your own, not official trophy-guide ratings.

Hunt saving and board visibility are committed together on replica sets. On standalone MongoDB, the hunt saves first, followed by board visibility. If that second update fails, the form explicitly reports that the hunt was saved; reload the page and show the saved hunt again. Opening `/api/hunts` directly in the browser is not a creation test: creation uses `POST`, while the app loads hunts through `/api/bootstrap`.

Difficulty is always the outer grouping. Columns run from easiest to hardest, with a separate unknown column last. Different whole-number difficulties never share a column. Legacy fractional estimates and saved difficulty filters round to the nearest integer on server startup (2.5 becomes 3); older JSON backups are normalized during import. Hours and progress are preserved. Horizontal scrolling on smaller screens preserves this layout. The board uses compact, read-only rows with the entire row colored by status. Click the pencil to edit in a dialog, or the game title to open its trophy log. Click a difficulty heading to collapse or expand its list; the count and column remain visible.

Sort by expected time, status, date added, or game title in either direction **within each difficulty column**. Unknown times remain last in both directions. Forward status order is Priority, In progress, Planned, Completed, Dropped. Date added is the hunt's original creation time; hiding and showing a game does not reset it.

Status colors are yellow for In progress, red for Dropped, green for completion, and orange/gold for Priority. Completed PlayStation platinum goals say **Platinumed**; achievement goals use **Achievements completed**. A game without a platinum can still have an achievement or custom goal. Platinum, base-game completion, and 100% including DLC are separate milestones. Completing a checklist never silently awards a platinum.

Use platform, ownership, achievement service, status, and difficulty filters. **Save defaults** stores the current page's filters and sort for your account. Catalog and board defaults are independent. Search text is temporary. Explicit URL parameters override saved values; **Restore defaults** reapplies saved preferences and **Clear** resets only the current view. Games you hide keep all progress and notebooks.

## Trophy notebook

Each hunt has its own trophy notebook. Trophies are top-level tasks: give a trophy its own checkbox or counter, optional description, section links, guide link, and missable marker. Add subtasks only when useful, or paste one task per line. A trophy’s earned checkbox is always manual and independent: completing subtasks or reaching its counter target never marks it earned. Checking or unchecking the trophy preserves all counters and subtask progress. Notebook completion does not change the hunt’s separate completion milestones.

**General** shows each trophy’s task tree. A trophy or task’s main section prefixes its displayed title, for example **Chapter 3 - Get all flowers**. **Sections** shows linked tasks directly, without repeating their trophy as a group heading. A trophy appears as a task there only when it is itself linked. **Grid** compares trophy rows against section columns, showing individual objectives, standalone trophies, and trophy counters; unlinked objectives appear in **No section**. Checking an item in any view updates every appearance. Overall task progress counts each leaf objective and each trophy counter once, even if it appears in several sections; checkbox parents are not counted again.

Use a trophy or task’s editor to select direct section links and its main section. Linking a parent includes all its current and future subtasks. Direct trophy subtasks can turn off **Inherit trophy section links** for their branch; independent copies do this automatically. Children may add their own links and choose a different main section. The editor distinguishes direct and inherited membership; removing a direct link still leaves any inherited membership in effect. If a main section becomes unavailable, the task uses its closest parent’s valid main section, its trophy’s main section when inherited, or the first available linked section. Categories are no longer used.

Use a task’s **Duplicate task into sections** button to select several destinations, or **Select all**, and create independent copies at once. Each destination gets the task and its subtasks under the same trophy, with unchecked tasks and counters reset to zero. Copies start at the top level and link only to their destination section; the original task stays unchanged. Progress is independent for each copy. **Section links** still displays one shared task in several sections.

Each trophy’s **Mark all** button completes all its subtasks and fills its own counter, including collapsed subtasks and tasks hidden by a filter or shown in other sections. Its earned checkbox stays unchanged. The button hides when there is no task or counter work to complete, and returns if progress becomes incomplete or tasks are added. Counter controls appear beside trophy and task titles and wrap when space is limited.

On desktop, grip handles reorder trophies and sections. In General, drop near a task’s top or bottom edge to reorder, onto its center to nest, or into a trophy’s top-level area to promote it. Dropping a trophy or task into a section adds a link without removing other links. Grid drops add section links, reorder objectives, or move tasks to another trophy row; Grid does not create nesting. Use the editor to remove links; dropping linked work into No section does not silently unlink it. The page and grid scroll near their edges while dragging. Edit dialogs and movement buttons remain available for keyboard and touch use.

Chevrons collapse trophy and task branches in General and Sections; Grid still shows their individual objectives. Parent-task checkboxes complete or clear their whole branch, including collapsed subtasks; trophy-earned checkboxes only change the trophy’s earned state. **Unlink from section** removes a direct link, while **Delete task** removes that task and its subtasks from every view after confirmation. Trophies can be deleted when they have no subtasks, and sections only when they have no linked trophies or tasks. Filtered-out and inherited tasks still make a section nonempty.

Changes save immediately. Failed saves keep the draft visible, with retry, download, and reload controls. Unsaved drafts also remain in this browser tab's session storage, scoped to the account and hunt, so navigating away and returning can recover them. Concurrent writes are rejected instead of overwriting another window's notebook. Download a conflicting draft before reloading the current server version.

**Copy to hunt** replaces the destination notebook with a copy, preserving its task trees, section links, and main sections while resetting trophy checkboxes and task progress. The source remains unchanged.

Notebook format 2 separates trophies from reusable sections. Older notebooks and drafts convert their original sections into unchecked trophies and preserve task hierarchy and progress; new section links start empty and obsolete category metadata is discarded. Conversion also applies to copied notebooks and backup import/export. The notebook’s revision remains a separate concurrency token.

## Optional IGDB lookup

Manual entry works without an external account. IGDB's API is [free for non-commercial use](https://api-docs.igdb.com/#account-creation) and requires a confidential Twitch developer application. Configure these **server-only** values in `enviroments/.env`, then restart the server:

```dotenv
IGDB_CLIENT_ID=your-client-id
IGDB_CLIENT_SECRET=your-client-secret
```

Follow the [official IGDB setup instructions](https://api-docs.igdb.com/#getting-started) when creating credentials. Do not use a `VITE_` prefix for secrets. Search fills the unsaved form with title, cover, summary, developers/publishers, genres, year, and mapped release platforms/dates. Review before saving. Unrecognized platforms can be added manually; the earliest dated regional release is used per mapped platform. The server caches results, renews OAuth tokens, and serializes API calls within IGDB's rate limit. Provider failures leave manual entry available.

Gaming account synchronization and automatic trophy imports are not part of this version.

## Image URLs and uploads

Game covers and device photos each have **URL / Upload** choices, a preview, and **Clear image**. URL remains the default and works without an image host. Uploads use Cloudinary; images are publicly viewable by anyone with the direct image link, while your Game Log records still require sign-in.

Choose one still JPEG, PNG, or WebP image up to **10 MiB** and **40 megapixels**. The image uploads only when you save the form. Canceling before Save sends no file. Switching between URL and Upload preserves each draft; Save uses the selected mode. Choosing an IGDB result replaces the image selection with its cover URL. Invalid uploads leave your draft available for correction or retry. If the upload succeeds but the record cannot save, retrying within that dialog reuses the uploaded URL.

The server validates the image contents, rejects animation (including animated PNG/WebP), corrects orientation, fits the image within 1600 × 1600 without enlarging it, strips metadata, and stores a quality-85 WebP. Uploads require sign-in and CSRF protection and are limited to 30 attempts per account per 15 minutes. Cloudinary credentials are never sent to the browser. The demo does not load these credentials.

### Cloudinary setup checkpoints

For a guided setup, complete **one checkpoint at a time**, then review its result before continuing. Never paste your API secret into chat or commit it to Git.

1. **Create the account:** use the [Cloudinary Free plan](https://cloudinary.com/pricing) and sign in to the Console. Stop when you can see your product environment. The current Free plan includes 25 monthly credits with no credit card required; storage, delivery, and processing consume the allowance. Review the current plan and usage in the Console.
2. **Locate credentials:** find the cloud name and API key/secret for that product environment in the Console's API Keys settings. Keep them locally. Stop once you have located all three values.
3. **Configure the server:** add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` to your existing ignored `enviroments/.env`, preserving its other values. In production, set these in the server's environment/secret settings instead. Do not use a `VITE_` prefix or an unsigned upload preset. Stop after saving the configuration locally.
4. **Restart:** restart the Game Log server and reload the browser. Open a game or device editor and select Upload. Stop when the file picker is enabled without the configuration message.
5. **Verify:** select a small image, inspect its preview, save, and reload the page. Confirm the image remains visible and appears in Cloudinary under the server-generated `game-log/<account-id>/<random-id>` asset path. Review this result before trying more uploads.

If uploads are unavailable, check that all three server variables are populated and restart the server. For provider errors, check the matching cloud name/API credentials, network access, and Cloudinary usage limits; your form remains open, and URL entry is still available. A file-validation error requires a supported still image within both limits. A rate-limit message requires waiting before retrying. Consult the [Cloudinary Node upload documentation](https://cloudinary.com/documentation/node_image_and_video_upload) for provider details.

Replacing/clearing an image or deleting a record does **not** delete the hosted file. This preserves links in older JSON backups; a successful upload followed by an abandoned form can also leave a file in Cloudinary. Review assets and usage in Cloudinary's Media Library/Dashboard and delete files there only when no live records or retained backups need their URLs. JSON backups contain image links, **not the image files**; keep separate copies of originals you want to preserve. TrueNAS storage is not required for this integration.

## Backups and exports

Settings provides versioned JSON export and a validated preview before import. A backup contains private platforms, games, copies, devices, hunts/notebooks, and preferences, with no passwords or session data.

Import **adds** new records with remapped IDs and restores the backup's preferences. It does not merge duplicate games or overwrite existing collection records. Preview and import reject the entire backup if it contains duplicate games or matches games already in your account, including a repeated import of the same games. Resolve those conflicts before importing. Import checks again when you confirm; writes are transactional, so a conflict leaves collection records, preferences, and memberships unchanged. Existing duplicates can still be exported for safekeeping. The maximum upload is 10 MB. The catalog and hunt board also export their current filtered view as CSV, with spreadsheet formula injection protection.

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
