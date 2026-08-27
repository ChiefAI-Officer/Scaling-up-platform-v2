# Summary Reporting final aggregate fix — local evidence

2026-08-27. **Locally verified; NOT LAUNCHED.** This record supersedes the
Task 8 fidelity PASS, its tier-bearing score pages, its missing coach-image/footer
attribution, and the older mobile captures that did not show Summary Reports.
Historical images and hashes remain in their original folders, explicitly as
pre-fix evidence. Existing immutable artifacts are not modified or regenerated.

## Corrected behavior

- Unknown commit acknowledgement retains private bytes. Only attempts whose
  transaction callback did not successfully finish, or conclusive non-creation,
  are cleaned up. Reconciliation uses the existing actor/campaign authorization
  checks. Failed/empty reconciliation is not evidence of rollback. A later
  same-UUID retry can recover the committed report. Rare uncertain private
  orphans remain an operational reconciliation concern; no orphan subsystem.
- Frozen `showTier:false` suppresses the provisional tier in PDF text. Computed
  tiers, scores, peer standing and benchmark disclosure remain unchanged.
- The wizard consumes real `errors[]` responses, identifies authorized stale or
  incomplete selected sources from existing metadata, retains draft/roles, and
  refetches cached scopes on return to Composition. `source_unavailable` is
  generic, ignoring any supplied name/ID/message. Malformed/unknown entries use
  a safe fallback; ambiguous retry body and UUID stay frozen.
- Coach image/name appear on the cover and footer. The footer places the
  Scaling Up mark first, with smaller subordinate coach attribution, then the
  campaign/renderer/page identity. Name-only and no-brand fallbacks remain.

## Exact image and persistence boundary

Image support is **public Vercel Blob uploads only**:
`https://<store-id>.public.blob.vercel-storage.com/...`. No external host list or
guessed Circle host is configured. Circle/other-host images safely fall back to
name-only until a separately verified host policy is approved. This does not
prove all live avatars work.

The creation-time loader rejects non-HTTPS, credentials, nonstandard ports,
IP/localhost/arbitrary hosts and all redirects. It caps transport at 3 seconds
and 5 MiB, aborts rejected response bodies, accepts PNG/JPEG/WebP raster
signatures only, and uses installed sharp 0.35.1 with a 16-million-pixel limit
and a 2-second processing timeout. Single-frame input becomes a metadata-free
PNG, at most 256×256 and 512 KiB. PNG base64, SHA-256 and dimensions are frozen
in `inputSnapshot.coachImage`; the original URL/name remain provenance. The
renderer gets bytes only, never a fetchable profile URL. Delivery reads the
already-stored private PDF and never reloads the image.

Loading occurs outside the two database transactions. The second transaction
still compares the **original source snapshot hash**, including the original
coach URL/name. The persisted input hash instead identifies the augmented
snapshot actually rendered. The local proof changes the coach profile after
creation and verifies input/artifact identity remains unchanged.

The new real-PostgreSQL assertion exposed Prisma 5.22 JSON write conversion
changing last-bit floating values in computed gap fields. The reconstructed
source-plus-frozen-image snapshot matched `inputHash`, but both Prisma-read JSON and raw stored
`inputSnapshot::text` differed. No scores were rounded. The report adapter now
uses a parameterized static INSERT with canonical JSON text cast to `jsonb`.
Explicit selected RETURNING fields, optional manifest and all scalar fields are
mapped; ID is an opaque UUID. Dates use `AT TIME ZONE 'UTC'`: a new regression
caught an eight-hour shift under the fixture's explicit Asia/Manila timezone.
Both raw-stored and Prisma-read canonical hashes now match in the real fixture.
The mapping's upkeep is the cost of bypassing the lossy write conversion.

`ON CONFLICT (creationRequestId) DO NOTHING` alone produces the deliberate
request-collision signal. Other unique violations are not retries. Real tests
cover that distinction and rollback of report/source/audit together. A
concurrent repeatable-read loser may return 503 for a serialization conflict;
the same-UUID retry returns 200 and one report/source/audit/artifact remains.

Primary contracts consulted: [sharp input limits](https://sharp.pixelplumbing.com/api-constructor/),
[sharp output/timeout](https://sharp.pixelplumbing.com/api-output/),
[Vercel public Blob URL shape](https://vercel.com/docs/vercel-blob/public-storage),
installed Prisma 5.22 and React-PDF 4.8.1 source/types, and the approved local
Summary Reporting spec plus accepted ADR0015.

## Actual visual observations and remaining gate

- `team0-tier-suppressed.png`: CEO 66, Team Not available, peers 53.1, standing
  +12.9 and benchmark disclosure remain; no CEO tier. The computed tier is still
  present in the golden input and renders when `showTier:true`.
- `team0-name-only-cover.png` / `team0-provenance.png`: name-only cover and all
  page footers inspected. All eight Team-0 pages were rendered/inspected; no
  content/footer overlap in those pages. Only representative rasters promoted.
- `local-pdf-1.png`, `local-pdf-2.png`, `local-appendix-8.png`: actual authorized
  download bytes show a deliberately synthetic cyan coach image (not a real
  avatar), coach name, subordinate footer attribution, exact provenance and
  anonymous reordered Team rows. This is local rendering support, not live
  image availability or product-owner approval.
- Four `*-empty/populated-mobile-viewport.png` images are actual 390×844 captures
  after scrolling the panel into view, taken before any full-page enlargement.
  Open Wizard/View passed Playwright trial-click and in-viewport checks. Admin
  panel/cards fit; its populated header is above the visible area after scrolling.
  Coach inherited document overflow still clips the panel and button labels;
  reading the full action label requires horizontal panning. Trial-click can
  auto-scroll and proves actionability, not a readable/fitting 390px layout.
  Widths during panel
  capture: coach 896, admin 375 (scrollbar-adjusted); later same-data flag-on/off
  coach comparison is 901/901 at viewport 390. No host redesign was made.
- Current desktop native previews paint only part of the cover/title and
  thumbnails; toolbar/top logo/complete page are not visible in these captures.
  They do **not** reproduce the older R1 upper-logo/toolbar observation. Current
  mobile native preview clips horizontally with a visible horizontal scrollbar.
  New-tab and download actions are reachable, but native mobile readability is
  not proven. Do not treat HTTP success, bytes or a delay as complete paint proof.
- The accepted dark-gradient cover is still a lighter flat `#6d58a8` purple,
  with different title wrapping/size/spacing, orange top strip and separated
  blue accent. Stacked accepted question bars remain side-by-side columns;
  A4 ownership, tables and appendix chunks change density/whitespace. These
  material visible differences require explicit actual-output acceptance.

No global enablement is authorized by this evidence. Private Blob privacy,
real Redis, deployment/migration/framing/CSP/CDN checks, exact-campaign canary,
and product-owner acceptance of actual screens/PDF remain **NOT RUN**.

## Final local verification

- Named Summary Reporting + affected host/API/limiter Jest: **20 suites,
  246/246 tests**, 20.39s. Supplementary legacy coach/footer/report-policy:
  **4 suites, 48/48 tests**, 1.054s. Loader cleanup red/green: 22/22.
- Headed Chromium: **5/5**, 1.2 minutes. Raw stored JSON hash, Prisma-read hash,
  non-UTC DB timestamps, exact field mapping, duplicate request/other unique,
  atomic rollback and concurrent creation all pass. Race statuses 503/201,
  retry 200, exactly one report/source/audit/artifact.
- All 13 changed JS/TS/TSX files ESLint: exit 0 (loader/test rechecked after
  transport-abort hardening). Migration safety: 43 migrations, exit 0.
- Credential-free Node 20.20.0 Turbopack build: exit 0; compiled in 13.4s,
  TypeScript passed, 92/92 static pages. Expected inherited output: lockfile
  root warning, middleware deprecation, seven missing Inngest key pairs, and
  three missing-DATABASE_URL static-data warnings/errors. No credentials loaded.
- The portal test's intentional `simulated eligibility failure` log remains.
  Early red runs and the raw-JSON/timestamp defects are recorded in the local
  final-fix report; they are not hidden or represented as passing runs.

Reproduce browser proof with the [local runbook](../summary-reporting-local-proof/README.md).
It uses stable main `16d5a29c31c2db64e7f4d11c4053f4bb9f5d43db` schema blob
`f3d1b8a0d35e5277f37b8ee912f23e546e496d20`, then the exact tracer SQL. Main history
must include that ancestor. The historical missing-`categories` migration-chain
failure remains unresolved/out of scope, not a tracer migration success claim.

Final full browser resource: `summary-proof-RHgBps`, loopback PostgreSQL 53377,
Next 53378. Fixture stopped its app/DB and removed its owned database. Report
`37fe1f0c-ae07-480f-8acb-81d9acb805ba` PDF SHA-256:
`b0a097a7f213e13cd378fa9817cf88060fa652f7ab1301434e2cc5fb4de4c44f`.
Team-0 fixture PDF SHA-256:
`2cef66b3d1cff875c65062db3c5dc636b0967a8f280bfb22d03b8cee01f8c1fd`.
No real private Blob or live profile request occurred.

## Inspected and promoted image hashes

Only these inspected images were copied from test-owned output. Ordinary test
runs still write ignored output; no historical evidence was overwritten.

| File | SHA-256 |
| --- | --- |
| admin-empty-mobile-viewport.png | `78fbf999131216844623c255a2237844ff64814bcb2d6ae9c70afd2ba3a11995` |
| admin-pdf-preview-desktop.png | `029cfd6c76c93aedb57616def9378bdbe9e3ff6f797825dfb6fedb3ff1da2662` |
| admin-populated-mobile-viewport.png | `157f6f0175720d16180351a144439c8fffa7dc335dab44cf94f6dc4416ca9118` |
| coach-empty-mobile-viewport.png | `6b427f4e78706fc6479c786aa5020a999976250d1f0311f245bea5655abbe8bf` |
| coach-pdf-preview-desktop.png | `81bdadc47236d8fba288d9ec990f793686896dc2cdba2169008fb629e78be83c` |
| coach-pdf-preview-mobile-viewport.png | `e92a85c37a1249a4969a2524aa9ae683e1f961258da67a67c749c6cfff6a0347` |
| coach-populated-mobile-viewport.png | `20615f1153e9cc1c150ae259475bb8039b00a478e8b54d51c3936a9031cb5cca` |
| local-appendix-8.png | `dbe01acdcd81cab1c62d2ffe40c7b7efd18e8878653f02093498444edf6d6f2a` |
| local-pdf-1.png | `be8423a6f33c06482bab0d0f93326adb7c6b4957658aaedf4efd5d039e3895fe` |
| local-pdf-2.png | `ed97c8488582f923388b338566bdf180cb67040b76679fbf85b0e73503c119f4` |
| team0-name-only-cover.png | `1c19baf94a6032b5ad64d12a24e3042482301f525b61ce625566393ba8420b5e` |
| team0-provenance.png | `daf3852bb35d3ec63e03f5c972b481fe7350d59b21764034d40f032a17b12701` |
| team0-tier-suppressed.png | `957db2cbbbbf996afc50492bc32e9a32aa609b72fc17d5a2f1806ab33b248768` |
