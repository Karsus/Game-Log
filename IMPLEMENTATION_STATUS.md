# Game Log implementation handoff

## Game deletion and duplicate protection — November 2, 2026

Game deletion now works on standalone MongoDB as well as replica sets. Replica sets retain transactional cascades; only the exact unsupported-transaction rejection enables ordered, session-free cleanup of copies, hunts/notebooks, then the game. Partial standalone failures explain that some related records may already be removed and ask for a reload/retry. Uncertain commits and unrelated failures never trigger a fallback.

Add/Edit game and backup preview/import block duplicates within an account by IGDB ID or title after trimming, collapsing whitespace, and lowercasing. Punctuation and accents stay significant; platforms and release years do not distinguish duplicates. Forms show existing matches, block known conflicts before cover uploads, preserve drafts, and link to the saved game even when browser data is stale. Internal partial unique identity indexes protect concurrent writes; legacy duplicates are not backfilled, merged, or deleted, and still accept edits that leave their identity unchanged. Internal keys stay out of responses and exports. Backup conflicts reject the entire import, including settings changes; imports still require a replica set.

Validation: **441 tests pass (128 server, 313 client)**, production build and whitespace checks pass. Coverage includes real DELETE requests on both database topologies, empty games, rollback/retry, account isolation, concurrent create/edit/import conflicts, startup with legacy duplicates, private identity fields, stale form errors, and backup compatibility. Server tests use disposable databases with process-scoped TEMP/TMP set to `.runtime/test-temp`; sandbox localhost restrictions require running those tests outside the sandbox. The existing development API automatically restarted and `/api/health` reports healthy. Next review: reload Game Log and retry deleting Pragmata; no personal game was deleted during verification.

## Normalized storefronts — November 2, 2026

Owned copies now select storefronts from a shared catalog, including Steam, Xbox Store, GOG, and Epic Store. Stored IDs are stable for future sorting/grouping; copy details display the readable labels. Other keeps a separate custom store name, and Not specified remains available. Startup migration and older backup imports normalize recognized aliases and preserve custom shops, including legacy literal Other values. Migration preserves copy details/timestamps and is idempotent. API and model validation enforce the catalog and custom-name requirements.

Validation: 80 affected tests pass (41 client, 39 server), production build and whitespace checks pass. Server checks use disposable MongoDB and cover startup migration, copy create/update, and backup round trips. Review in **Game library → open a game → Add owned copy / Edit copy → Store / storefront**.

## Trophies as top-level tasks — November 1, 2026

Trophies now support their own checkbox or counter, section links/main section, description, missable flag, and guide URL. Per the user’s clarified preference, trophy-earned checkboxes stay manual and independent of subtasks and counters. Toggling an award changes only its earned flag; Mark all completes subtasks and fills the trophy counter without changing that flag. Sections shows linked work directly, without an extra trophy grouping header; linked trophies appear as tasks with inherited subtasks. General supports trophy collapse, and Grid includes standalone trophies and trophy counters. Counters stay beside titles.

Notebook format 2 gains compatible defaults without replacing existing records or progress. Trophy section links inherit through task trees, with an explicit opt-out for direct trophy subtasks. Independent copies opt out automatically and retain one destination section per copied branch. Server validation, copy/reset, autosave retry, and backup round trips cover the new fields. The separate hunt completion milestones remain unchanged. Existing counter subtasks are preserved; users can choose Counter in the trophy editor for future direct tracking.

Validation: full client suite and production build pass; the affected server notebook and API suites pass (41 unit tests and 34 integration tests). No new live-browser visual verification was performed because Chrome access was previously denied. Prior notebook UI behavior below is historical and superseded by this update.

## Notebook creation runtime fix — November 1, 2026

The live API on port 4050 was still running pre-v2 notebook validation loaded at 13:27. This caused trophy/task creation to require legacy `sections` and item `sectionId`, and could reinterpret newly created sections in legacy responses. Restarted only the verified API and supervisor, preserving the frontend, MongoDB, session secret, and browser drafts.

Diagnosed the recurrence: nodemon detected source changes but its Windows matching rules filtered every tested change out (1 file before filtering, 0 afterward). Replaced the `dev:server` command with Node's built-in `--watch --watch-preserve-output`; verified an actual change to `server/domain/notebook.js` restarts the API and returns it to health. The temporary probe was removed. The API remains a hidden background process, with logs in `.runtime/dev-api.log` and `.runtime/dev-api-error.log`; inspect the current port-4050 listener before future restarts. Existing nodemon configuration changes were preserved, though the development script no longer uses nodemon.

Added regressions for saving a first trophy before any sections/tasks exist (22 notebook server tests pass) and creating consecutive sections while preserving previous sections, trophies, tasks, and revision state (34 Notebook interaction tests pass). Chrome access was not approved, so the user's open draft was not submitted; next review is to close the failed editor and use **Retry saving** in the notebook before refreshing.

## Trophies and shared notebook sections — November 1, 2026

Rebuilt notebooks around manually earned trophies, owned task trees, and reusable sections. General shows collapsible trees with main-section prefixes; Sections groups shared branches by trophy; Grid shows leaf objectives in trophy rows and section columns, including No section. Direct links inherit through current and future descendants, main selections stay valid after movement, and overall progress counts each leaf once. Trophy completion stays independent from task completion. Categories are removed.

Native desktop drag handles reorder trophies, sections, and objectives; General supports nesting, promotion, and movement between trophies, while section/grid drops add links. Keyboard/touch editors and sibling arrows remain available. Nested rows use compact spacing. Delete controls appear only for empty trophies/sections, including the final group; unlinking remains separate from confirmed global task deletion.

Notebook `formatVersion: 2` is separate from concurrency revisions. Legacy sections become unchecked trophies, retaining task IDs, hierarchy, progress, counters, notes, guide links, and missable flags. Conversion covers loading, saving, recovered drafts, copying, and backup import/export. New notebooks start empty. Copying resets both trophy and task completion. Existing autosave, conflict checks, and failed-save recovery remain; regression tests also cover revision updates received during saves.

Validation: **293 tests pass (217 client, 76 server)**, production build and whitespace checks pass. Server integration tests use disposable MongoDB outside the sandbox and cover migration, repeat conversion, malformed references, revision conflicts, copy/reset, and backup round trips. Browser QA in an isolated fixture confirmed shared completion without duplicate totals, manual trophy completion, main-section editing and reload persistence, native nesting, and desktop/390px layouts without page horizontal overflow. Drag indicators, promotion, cancellation, and edge scrolling are covered by interaction tests; the browser automation's short promotion gesture did not dispatch an event at its destination. Screenshots: `.runtime/qa/notebook-v2-desktop.jpg` and `.runtime/qa/notebook-v2-mobile.jpg`. The temporary fixture and tab were removed; personal notebook data and unrelated workspace changes were preserved.

## Active subscriptions on library cards and Trophy Hunts — November 1, 2026

Game library cards, Trophy Hunts board rows, hunt details, and hunt CSV exports now show only active subscriptions. Expiration or deactivation hides the badge while retaining the game, hunt progress, and saved sources. Owned badges remain; unowned games with no active sources use the existing Not owned label. Library table view, game details, library exports, and provider filtering retain full source information. Validation: 71 affected library/hunt/date/domain tests pass, production build and whitespace checks pass.

## Day/month/year dates — November 1, 2026

Standardized user-facing dates as **DD/MM/YYYY** across subscription expiration, acquisition and release-date inputs, library Added dates, owned-copy/device acquisition dates, completion dates, backup previews, and hunt CSV exports. A shared DateInput provides explicit day-first entry, eight-digit mobile input, a calendar picker, and real-calendar validation. Invalid drafts stay visible and block saving; clearing/resetting works. ISO storage/API/JSON values and membership expiration rules are unchanged. Timestamps use the saved account time zone when available; date-only values never shift days. Backup filenames use DD-MM-YYYY.

Validation: all **147 client tests pass**, production build and whitespace checks pass. Tests cover ambiguous dates, leap years, invalid/partial input, ISO round trips, timezone boundaries, calendar selection, acquisition/release editors, summaries, and CSV/backup output. Isolated browser QA confirmed 08/04/2027 remains 8 April after save/reload, calendar selection returns day-first text, invalid dates cannot overwrite saved dates, and desktop/390px mobile layout has no horizontal overflow. Screenshots: `.runtime/qa/dates-ddmmyyyy-desktop.png` and `.runtime/qa/dates-ddmmyyyy-mobile.png`.

## Membership save runtime fix — November 1, 2026

The personal app at `http://localhost:5173/settings` reported `API route not found` because its API on port 4050 was still running code loaded at 12:18, before `/api/memberships` was added. Confirmed client/server routing was correct. Restarted only the verified stale API and its nodemon supervisor; the frontend, demo, MongoDB, session secret, and browser draft were preserved. The replacement API passes `/api/health` and remains running. It is currently a hidden background nodemon process, with logs in `.runtime/dev-api.log` and `.runtime/dev-api-error.log`; identify its current port-4050 listener before stopping/restarting development services to avoid a duplicate listener.

Enabled `legacyWatch` in `server/nodemon.json`; effective nodemon configuration confirms polling is enabled, although a timestamp-only touch did not demonstrate a reload. The user should retry **Save subscriptions** without refreshing. Their live form's end date was blank at the final check, so no membership values were submitted on their behalf.

## Current memberships and inactive access — November 1, 2026

Implemented **Settings → My subscriptions** with explicit saves, optional inclusive Active through dates, saved account time zone initially taken from the browser, and inactive defaults. Game Pass now supports Essential (Core), Premium (Standard), PC, and Ultimate; Ultimate covers all four sources, Premium covers Essential and Premium, and PC remains independent. PS Plus Premium covers Extra and Basic; Extra covers Basic. Legacy generic Game Pass tags remain compatible and use any active Game Pass membership, with guidance to select a precise tier when known.

Cards, tables, game details, hunt views, and CSV exports show each source's Active/Inactive status independently. Expiration refreshes at the account's midnight, on page load, and on return to the app, including daylight-saving boundaries. Ownership, source tags, wishlists, hunts, notebooks, and completion remain unchanged. Failed saves preserve drafts, and overlapping preference/membership responses cannot overwrite each other's client state.

Memberships are separate account data, saved through authenticated, CSRF-protected `PUT /api/memberships` and included in session/bootstrap responses. JSON backups optionally restore memberships; preview and confirmation disclose replacement, while older backups preserve current settings. Active tiers or saved expiration dates require a valid account time zone in imports.

Validation: **178 tests pass** (50 server, 128 client), production build passes, and whitespace checks pass. Coverage includes activation/deactivation/renewal, tier changes, multiple sources, inclusive expiry and daylight-saving boundaries, focus/midnight refreshes, failed saves, preference-response races, account isolation, authentication/CSRF, persistence, and old/new backup imports with rollback. Server tests use disposable MongoDB outside the sandbox because sandbox localhost access is denied.

The isolated demo on ports 4053/5043 verified inactive defaults, activation, tier downgrade coverage, expiration and reload persistence, independent sources, zero owned copies, and preserved 18/40 hunt progress. Desktop and 390px mobile checks passed with no page horizontal overflow. Screenshots: `.runtime/qa/memberships-desktop.png`, `.runtime/qa/memberships-mobile.png`, and `.runtime/qa/membership-hunt-desktop.png`. The QA demo and tab are stopped; existing app processes and personal data were preserved. Next review: open **Settings → My subscriptions**. Automatic provider syncing, catalog departures, billing, and renewal notifications remain out of scope.

## Subscription access — November 1, 2026

Implemented game-level subscription checkboxes for **Game Pass**, **PS Plus Basic**, **PS Plus Extra**, and **PS Plus Premium** in Add/Edit game. Per the user's final preference, subscription access has **no platform selector**. Basic marks claimed monthly games; Extra/Premium mark catalog access. Multiple selections are allowed. Subscription entries stay separate from owned copies, counts, wishlists, and progress; unchecking access preserves the game and hunts. Availability/expiration is manual.

Library cards/tables, game details, hunt rows, CSV exports, and saved filters show the services and distinguish the PS Plus tiers. JSON backups preserve subscriptions and accept older version-1 backups. New PC hunts infer Xbox for Game Pass-only access or PlayStation for PS Plus-only access, retain the platform default when both provider families are selected, and preserve existing explicit hunt services.

Validation: **121 tests pass** (43 server, 78 client), production build passes, and whitespace checks pass. Tests cover service validation, duplicate rejection, account isolation, backups, old records, zero subscription ownership counts, mixed owned/subscription games, filters, checkbox changes, and hunt defaults. An isolated demo on ports 4053/5043 verified saving without a platform, reload persistence, Basic/Premium labels, unchanged dashboard owned totals, and desktop/390px mobile layout. Screenshots: `.runtime/qa/subscription-choices-desktop.png` and `.runtime/qa/subscription-choices-mobile.png`. QA demo stopped; existing processes and personal database were preserved. Next review: refresh the running app and open a game's **Edit subscriptions** control.

## Standalone MongoDB hunt fix — November 1, 2026

Confirmed that the configured personal database uses standalone MongoDB. Hunt creation/editing with board visibility previously failed because these requests required transactions. They now retain transactional saves on replica sets and use a narrowly scoped standalone fallback: save the hunt, then enable board visibility. If visibility fails after saving, the form explicitly reports that progress was saved and asks for a reload. Network/commit errors never trigger the fallback.

Validation: all **39 server tests pass**, including seven new regression tests covering the reported PlayStation form values, standalone edits and notebook preservation, duplicate protection, account isolation, partial-save errors, and rejection of unsafe retries. Tests use disposable databases. The personal database was inspected read-only; final retry in the user's running app remains to be confirmed. Backup imports and cascading game deletion still require a replica set.

## Image upload addition — November 1, 2026

Implemented URL / Upload controls for game covers and device photos, local previews/clear actions, deferred uploads on Save, and reuse of successful uploads after record-save failures. Added authenticated, CSRF-protected multipart uploads to Cloudinary with server-only credentials, account rate limits, JPEG/PNG/WebP content validation, animation/pixel/byte limits, orientation correction, metadata removal, and bounded WebP output. Existing URL records and version-1 backups remain compatible; hosted assets are retained when records/images are removed.

Validation: all **78 tests pass** (32 server, 46 client), production build passes, and diff whitespace checks pass. Tests use disposable MongoDB and a mocked Cloudinary provider; no real upload was attempted. Browser checks verified cover/photo controls, preview/clear/cancel, missing-configuration guidance, and desktop/390px mobile layout. Preview: `.runtime/qa/image-upload-desktop.jpg`. Existing artwork changes and the personal `.env` were preserved. Dependency audit reports two moderate development-only advisories in existing `nodemon`/`minimatch`; no new image dependency is affected.

Next image setup checkpoint: create/sign in to a Cloudinary Free account and stop at its Console for user review. Then guide credential location, local server configuration, restart, and one real upload/reload check **one step at a time**. Full reference and troubleshooting are in README's Image URLs and uploads section. Three optional server variables are documented in `enviroments/.env.example`. Real Cloudinary verification remains pending those credentials. Latest shared weekly allowance check: **7% used / 93% remaining**.

## Current state

The approved implementation is complete locally as of October 29, 2026. It has not been deployed or committed.

Implemented: private accounts/session authentication, platform catalog and individual hardware units, games and physical/digital copies, wishlists, optional IGDB metadata prefill, independent platform/service hunts, completion milestones, chapter notebooks with nested checklists/counters and synchronized list/grid views, permanent difficulty columns, within-column sorting, independent saved catalog/board defaults, dashboard, themes, JSON backup preview/import, and CSV exports.

Validation: all **46 automated tests pass** (19 server, 27 client). Production build passes. A production-mode smoke check passes for HTML/assets, SPA routing, health, authenticated API boundaries, and secure cookies. Dependency audit reported zero vulnerabilities. Browser checks covered sign-in, game/hunt creation, whole-number difficulty validation, decimal hours, compact rows, editing dialogs, and collapsible columns, platform filtering, saved sorting after navigation, notebook completion after reload, desktop/light themes, and 390px mobile layout with no page-level horizontal overflow.

Browser testing used an isolated sample database, never the configured personal MongoDB. The demo includes an explicit sample-data banner and resets on restart. Preview screenshots are saved in `.runtime/qa/` (ignored). QA-owned demo/test processes are stopped at handoff.

The existing `enviroments/.env` was preserved. Existing draft files in `server/models` remain untouched and inactive; the live models are in `server/domain/models.js`. Pre-implementation copies are saved in `.local-backups/pre-implementation/`. The user's existing deletion of `server/models/Example.js` remains. Do not reset Git, delete these drafts, or drop database data.

Setup and operation are documented in `README.md`. No live IGDB request or SMTP email was sent; credentials are optional and unconfigured. IGDB normalization/failure behavior was tested with mocked provider responses. Persistent normal-mode startup against the user's configured MongoDB still needs the user's local review; the tested demo and integration suites use disposable replica sets.

## Confirmed product decisions

- Multiple accounts, each with private collections, wishlists, notes, and progress.
- Complete and test locally first; retain React/Vite, Express, MongoDB, JavaScript, and the existing monorepo. Provide hosting instructions without deploying.
- Dark gaming-library interface with a light-theme switch, responsive cover cards, and compact tables.
- Manual achievement progress in this release. IGDB supplies optional, editable game metadata through a server-side integration; gaming-account syncing is out of scope.
- Trophy notebooks have checklist and chapter-grid views of the same records.
- Navigation: Dashboard, Games, Platforms, Trophy Hunts, Settings.

## Latest requirements: hunt setup, permanent difficulty columns, and saved filters

- Enabling a hunt opens setup with its target platform/achievement service, **Expected difficulty (1-10)**, and **Expected time to complete (hours)**.
- Store difficulty and expected hours on the individual hunt, not on shared game metadata or a physical copy. Different platforms can have different estimates.
- Both estimates are editable during setup and through an edit dialog or the hunt detail page. The board is read-only and has no inline inputs or status selects. Difficulty must be a whole number from 1 to 10; hours may be decimal and must be greater than zero. Blank means unknown and must not block creation.
- A game-level visibility toggle controls inclusion on the hunt board. When adding a hunt through that toggle, show the setup fields above. Re-enabling an existing hunt preserves its saved estimates and progress.
- The hunt board always separates games into distinct difficulty columns, matching the reference spreadsheet. This grouping is mandatory, not an optional view or sort setting: games with different expected difficulties must never be interleaved.
- Each whole-number difficulty has its own labeled column, ordered from easiest to hardest. Legacy decimals round to the nearest integer on startup and during backup import (2.5 becomes 3); new decimal difficulty values are rejected. Saved decimal filters also migrate. Unknown difficulty has a separate final column. Hide empty columns after filtering; use horizontal scrolling and persistent difficulty headings on narrow screens.
- Each difficulty column can be collapsed from its heading and contains compact, read-only game rows with full-row status colors showing title, platform/service, ownership, expected completion hours, platinum availability, status, and progress. The column heading supplies the expected difficulty.
- Provide a **Sort within difficulty** selector for status, expected completion time, date added, and game title, with ascending/descending controls. Apply the chosen ordering separately within every difficulty column; never reorder or merge the difficulty columns themselves.
- Default sorting within each column is expected hours ascending, then title. Unknown expected hours remain last in either sort direction. Resolve remaining ties with hunt creation time and stable record ID.
- Status sorting uses Priority, In progress, Planned, Completed, Dropped in its forward order; reverse sorting reverses that order. Display platform-appropriate completion labels without changing the underlying status order.
- Date added means when the hunt was first created, not the game's release/import date or the last time board visibility was toggled. Offer newest-first and oldest-first ordering.
- Editing a hunt's difficulty moves it into the matching difficulty column. Filtering, searching, saved defaults, URL parameters, and any future alternate board presentation must preserve separation by difficulty.
- Provide prominent multi-select platform filters on both the Games catalog and Trophy Hunts board. PS3, PS4, and PS5 are independently selectable. Achievement-service filtering supports distinguishing Steam and other services on PC.
- Provide **Save current filters as default** and **Restore my defaults** independently on the catalog and hunt board. Persist defaults per account on the server so they work across sessions and devices.
- Save structured filters and sort order, not search text or pagination. Hunt-board sort preferences control only ordering within difficulty columns; the required grouping cannot be disabled through preferences or URL parameters. Changing or clearing current filters must not silently overwrite saved defaults. Explicit filters and sort choices in a shared/bookmarked URL take precedence over saved defaults.
- Without user-saved defaults, the catalog shows all library entries and the board shows all opted-in hunts in separate difficulty columns, ordered within each column by expected hours ascending. Do not assume a particular preferred platform.

## Collection and progress model

- Platform catalog records describe platforms and model variants; owned hardware records represent individual physical units. Support nickname, model, color, storage, region, condition, serial number, acquisition details, and notes.
- Separate game metadata, platform releases, private library entries, and individual owned copies/licenses. Record physical/digital format, storefront, edition, region, purchase details, location, lending information, and sold/lost state where applicable.
- Derive ownership summaries from active copies/units. Display distinct-title/platform counts separately from individual-copy/unit counts.
- A user may own one platform version while wishlisting another. Keep PC hardware separate from achievement services.
- Hunts are independent per game/platform/achievement service, with optional edition or regional trophy-list distinctions. Duplicate physical copies do not create duplicate progress records.
- Imported catalog metadata can be reused; personal corrections and manual entries remain private.
- Separate platinum earned, base-game completion, and 100% including DLC. Support games without achievements or platinum trophies, earned/total counts, and completion dates.
- Trophy notebook completion does not automatically award an achievement or platinum.

## Trophy notebook and hunt board

- Support ordered chapters/sections, categories, checkboxes, nested subtasks, counters, notes, guide links, and missable markers, plus general trophy reminders outside chapters.
- Grid columns represent sections/chapters; category rows contain the same checkable items used in list view.
- Include reordering, bulk multiline paste, and copying notebook structure to another hunt with completion reset.
- Support selected owned and wishlisted games. Board visibility starts off for newly added library games.
- Exclusive hunt statuses: Planned (neutral), In progress (yellow), Dropped (red), Completed (green), Priority (orange/gold). Display Completed as Platinumed or Achievements completed according to the hunt's target; completion controls and status changes stay consistent.
- Use text labels alongside colors. Support title search, platform/service, ownership, status, and difficulty filters. Always retain separate difficulty columns, with configurable sorting only within each column.

## Architecture and delivery

- Repair startup and environment handling; preserve existing environment values and keep secrets server-side.
- Add validated API endpoints for authentication, metadata lookup, hardware, library entries, copies, hunts, notebook sections/items, user preferences, and backups.
- Enforce per-user ownership on every private resource and cross-reference. Use hashed passwords, Mongo-backed cookie sessions, logout, password change, SMTP-configurable recovery, CSRF protection, and authentication rate limits.
- IGDB search prefills editable titles, artwork, descriptions, developers, publishers, genres, and platform release details. Cache provider results, respect rate limits, and retain manual entry when credentials or the provider are unavailable. Never use generic playtime as a trophy-completion estimate.
- Add dashboard totals, versioned JSON export/restore with preview, CSV export, and local/deployment documentation.
- Use screenshots as workflow references; do not automatically transcribe them into real account data.

## Milestones and validation

1. Foundation: startup, validated models, account isolation/authentication, and responsive shell.
2. Collection: individual consoles, catalog, copies/licenses, wishlists, and metadata-prefilled forms.
3. Progress: independent hunts, completion controls, notebook editing, and synchronized list/grid views.
4. Planning and delivery: hunt board, saved catalog/board filters, dashboard, backups, exports, and setup instructions.

Acceptance scenarios:

- Two PS5 units belong to one platform; one game can have physical GameCube and digital Xbox copies.
- Platform/service progress and estimates stay independent while duplicate copies share the intended hunt.
- Enabling a hunt exposes both expected fields; missing estimates remain unknown; invalid values are rejected; edits persist after reload.
- Games with different difficulties never share a column, using whole-number difficulties from 1 to 10. Unknown difficulty occupies its own final column.
- Every status/time/date/title sort and direction reorders only within difficulty columns; columns remain easiest-to-hardest. Verify ties, missing expected hours, all statuses, and platform-specific completion labels.
- Changing expected difficulty moves the hunt to the correct column. Search, filters, saved defaults, URL overrides, and narrow-screen layouts preserve difficulty separation.
- Date-added sorting uses original hunt creation time and remains unchanged when board visibility is toggled.
- Platform filtering distinguishes PS3/PS4/PS5; multiple selections work; catalog and board defaults persist independently and never leak across users.
- Temporary filters do not overwrite defaults; restoring defaults and explicit URL filters follow the documented behavior.
- Wishlist hunts, visibility toggles, status colors, no-platinum games, and DLC completion behave correctly.
- Checklist/grid changes agree after reload; copied notebooks reset progress without altering the source.
- Provider failures, unavailable databases, and failed saves produce useful errors without losing form input.
- Account isolation, session expiry, unauthorized requests, invalid cross-references, and backup restoration are covered by automated API/component tests.
- Run the production build and desktop/mobile browser checks.

## Usage checkpoint and resumption

- Latest usage check during final validation: **11% used / 89% remaining** in the weekly window. Implementation finished before reaching the requested cutoff.
- Check the shared weekly allowance before and after bounded implementation units.
- Begin preparing a checkpoint around 30% remaining; stop when a check reports 25% or less. Checks cannot guarantee an exact token-by-token cutoff.
- Keep this file current with completed features, tests, remaining work, configuration requirements, and the precise next action.
- At the threshold, save work and wait for explicit permission to resume; do not automatically resume after a reset.
- Explain external setup one step at a time and wait for the user's response before the next setup step.

## Next action

First review step: run `npm run demo`, open `http://localhost:5041`, and use **Fill demo sign-in** then **Sign in**. Wait for the user's review before guiding the next setup step.

After review, help start the persistent collection with the existing MongoDB configuration (`npm run dev`, localhost:5040). Resolve local connectivity/port issues without touching unrelated processes or exposing credentials. If requested, configure IGDB and SMTP one step at a time. Latest refinement: compact rows, pencil-button editing, collapsible difficulty lists, stronger full-row status colors in both themes, whole-number difficulty with backward-compatible migration, and a 300-row rendering test. No implementation milestone remains unfinished; future changes should follow the user's review and continue honoring the 25% weekly-remaining pause rule.
