# Game Log implementation handoff

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
