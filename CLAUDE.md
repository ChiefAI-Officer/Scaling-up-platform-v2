# Scaling Up Platform v2 - Development Instructions

> **IMPORTANT: Keep this file current.** After completing any sprint, feature, or schema change,
> update the relevant sections below. This is the single source of truth for AI assistants
> working on this codebase.

## Project Context

**Scaling Up Platform v2** is a workshop management application replacing Kajabi for Scaling Up coaches.
Coaches request workshops through a self-service portal; admin/staff review, approve, and manage
the full workshop lifecycle from request through post-event follow-up.

| Key | Value |
|-----|-------|
| **Source Path** | `D:\The CTO Project\Scaling Up Platform v2\src` |
| **Repository** | `github.com/jcbdelo26/Scaling-up-platform-v2` (deploys from `main`) |
| **Live URL** | `scaling-up-platform-v2.vercel.app` |
| **Client** | Jeff Verdun, CIO - Scaling Up |
| **Operations** | Suzanne (handles manual approvals) |
| **Last Updated** | <!-- LAST_UPDATED_ISO:2026-06-02 LAST_UPDATED_SLUG:su-full-5stop-recommendations --> June 2, 2026 — **Scaling Up Full 5-stop recommendations + prod seed/publish of the assessment re-seed** (PR #31, squash `b3ef507`). SU Full's per-question recommendations upgraded 3-band → full **5-stop** {0,3,5,7,10}, harvested verbatim from Esperto's uniform-fill sample reports (the live scalinguptoolkit.com tool exposes NO scoring config via its admin API — confirmed by direct login + `/api/v1/*` probing — so the rendered reports are the authoritative source); 61/61 questions joined by exact label; 5 bands tiling [0,10] `[0-2][3-4][5-6][7-9][10-10]`; `TemplateVersionForPublishSchema` passes; 460 tests green. Overall ScaleUp band cutoffs stay PROVISIONAL (4.0/6.5 on the 0–10 rollup; uniform-fill scores tighten observed bounds to LOW/GOOD ∈ (28,47], GOOD/TOP ∈ (62,107] of 100) pending Esperto's weighting formula. **Prod (this session)**: seeded all 5 real-content versions as DRAFTs (guarded `safe-seed.mjs` + a 212-row snapshot; cleaned stale qsp-v1 + SU-Full duplicate drafts, each verified campaign-unreferenced) and **published the 4 confirmed assessments live** — Rockefeller, QSP v1, QSP v2, LVA now serve real-content v2 to NEW campaigns (existing campaigns keep their pinned version); **Scaling Up Full held as DRAFT** (v2, 5-stop recs) pending Esperto scoring per 09b §C. Reversible via snapshot + Neon PITR. See [plans/CHANGELOG.md](plans/CHANGELOG.md). **OLD (June 2, 2026 — earlier)**: **Assessment content re-seed — 5 templates re-seeded with real Esperto content as staged DRAFT versions** (branch `feat/assessment-content-reseed` merged via PR #30, squash commit `5c5e027`). Replaces the placeholder/approximated question banks (Rockefeller, QSP v1, QSP v2, LVA, Scaling Up Full) with adversarially-verified verbatim Esperto questions + scoring. New shared `ensureTemplateVersionContent` helper (`lib/assessments/seed-template-version.ts`) appends each template's content as a new **DRAFT** version — content-hash idempotent, latest-only no-op, fail-closed on an edited draft, never mutates published rows or live invitation emails, audit row in-tx — so **nothing publishes or reaches respondents until an admin reviews + clicks Publish** (runbook `docs/specs/v7.6/09b-publish-review-checklist.md`). `scoring.ts` gains server-side answer validation for all 4 question types (required-presence + value-shape). QSP v1/v2 + LVA are aggregation-only (single neutral tier — the platform requires ≥1 tier, ADR-0002); Rockefeller verbatim fixes (emptied invented slider anchors; Q1_1 period; BC snapshot re-locked); SU Full ships **provisional** ScaleUp scoring (4.0/6.5 band cutoffs interpolated; exact Esperto weighting formula + full 5-stop recommendation text flagged for Jeff — see 09b §C; do NOT publish SU Full until confirmed). Ops: guarded `safe-seed.mjs` (refuses prod host without `--i-know-this-is-prod`), ordered runner + JSON manifest, read-only verifier. Decisions ADR-0001/0002/0003 + spec `docs/specs/v7.6/09-assessment-content-reseed.md`; domain glossary `CONTEXT.md`. Greptile review 4/5 "safe to merge" (all 4 P2 comments fixed: parseHost last-`@` in both copies + regression test, narrowed recommendations error filter, unified seed-runner args). 495 tests across 29 suites green; `CI=true npx next build --turbopack` clean; **zero migrations; zero destructive ops; merging changes no assessment data** (the reseed is a separate guarded DRAFT step). See [plans/CHANGELOG.md](plans/CHANGELOG.md). **OLD (June 1, 2026)**: **TEMPLATE-02 — Custom HTML override on landing-page templates shipped** (branch `feat/template-02-custom-html` merged via PR #24, squash commit `f0a177b`). Closes Jeff's May 29 look-and-feel ask. Admins paste raw HTML into a new Custom HTML textarea on `/admin/templates/[id]/edit` for SOLO_LANDING + DUO_LANDING templates only (hidden entirely for REGISTRATION / THANK_YOU / BIO_PAGE per Q13 eligibility). Save-time DOMPurify (per-call instance, FORBID iframe srcdoc, CSP-aware `frame-src` allowlist mirroring `vercel.json`, token-aware URI regex so `{{registration_url}}` survives in `href`/`src`). Auto-build TWO-pass: REGISTRATION first → capture slug → SOLO/DUO build with enrichedVars containing absolute `registration_url = ${APP_URL}/workshop/<regSlug>` (empty-string fallback when no REGISTRATION template); every variable HTML-escaped before substitution into customHtml (closes stored-XSS via coach bio / virtualLink); interpolated output re-sanitized in STRICT mode (no token literals) to catch `javascript:` substitutions before they reach the DB. Render path at `(public)/workshop/[slug]` echoes the stored sanitized string via React's HTML-injection prop; non-empty customHtml replaces the React template. PUT `/api/workshops/[id]/landing-pages/[template]` (coach-accessible) does NOT accept customHtml from body — admins write only via PATCH on PageTemplate. Two review rounds absorbed: Codex r1 (13 findings), Greptile r1 (7 critical + 10 major); Codex r2 surfaced 2 BLOCK (coach PUT body acceptance; tokenized URL stripping) + 3 HIGH + 3 MEDIUM — 4 fixed pre-merge in commit `e14aa6d`; remaining HIGH #3 (render-path defense-in-depth re-sanitize) + MEDIUM #1 (manual page create registration_url enrichment) + MEDIUM #3 (full save→build→render integration test with un-mocked interpolation) tracked as Phase-2. Schema additive only — `PageTemplate.customHtml String?` + `LandingPage.customHtml String?` (migration `20260601000000_add_custom_html_to_templates`). Tests: 163/163 GREEN across 13 affected suites (sanitize 27 + interpolate 15 + page-templates 17 + auto-build + landing-pages + workshop-slug render + editor RTL + library clone); `CI=true npx next build --turbopack` clean. Three known pre-existing failures unrelated to this branch (`no-inline-tolocaledatestring` / `org-survey-exchange` / `assessment-campaigns-detail-route`) stable. Notion: https://www.notion.so/3728c45dd829819aa9e3dac61a798bcb. See [plans/CHANGELOG.md](plans/CHANGELOG.md). **OLD (May 29, 2026)**: **Assessment Slice 5 shipped — coach landing companies + per-campaign metrics, CampaignDetail Team column + band labels** (branch `feat/assessment-slice-5-landing-metrics` merged via PR #23, squash commit `9570871`). Closes the visibility layer of the v7.6 setup-first flip. Coach landing `/portal/assessments` now groups campaigns by company section (Acme Corp · N campaigns), with each row showing a precomputed `<CampaignStatusMetrics>` strip (`Total / New / Invited / Started / Completed`). `CampaignDetail` gains the same strip in the header AND a new **Team** column sourced from the immutable `AssessmentCampaignParticipant.teamPathAtAdd / teamLabelsAtAdd` snapshot (NOT the live `OrgRespondent.team` relation — closed campaigns stay locked to who was where at add-time; multi-segment paths render leaf label + muted `›`-joined breadcrumb). Per-row Status cell switches from raw enum (`PENDING/SENT/VIEWED/SUBMITTED`) to band labels (`New/Invited/Started/Completed/Revoked`) using the same brand tones as the header tiles. New canonical classifier `getInvitationBand(invitation)` exported from `lib/assessments/campaign-status-metrics.ts` — `computeCampaignStatusMetrics` now calls it internally so per-row + aggregate logic cannot drift. Locked mapping (from `docs/specs/v7.6/08-members-teams-lane.md`): `new = PENDING & sentAt null · invited = SENT · started = VIEWED · completed = SUBMITTED · revoked excluded from total`; defensive against PENDING-with-sentAt-set (→ invited) and participant-with-no-invitation (→ new). Resend/remove gating still keyed on raw `invitation.status` (band is display-only). 5 commits, all TDD/SDD; 77 tests across 7 suites green; zero migrations; zero destructive ops; 3 known pre-existing unrelated failures stable. See [plans/CHANGELOG.md](plans/CHANGELOG.md). **OLD (May 29, 2026 earlier)**: **Coach portal nav exposes Members (Slice 2 anchor correction)** (PR #22, squash `ea72a30`; prod deploy `d4qsazixo`). Three-line cherry-pick of orphaned commit `0452e26` adds the `Members` link to `coachPrimaryNavItems`. The original Slice 2 anchor falsely claimed the nav exposed Members — actual coach-nav commit landed 47 min AFTER PR #19 squash-merged and was orphaned. All deploys from Slice 1 through `h4fikoykx` lacked the link; PR #22 makes the claim true. **OLD (May 28, 2026)**: **Bulk CSV import + wizard persistent quick-add shipped (Slice 4)** (branch `feat/assessment-slice-4-import-quickadd` merged via PR #21, squash commit `8ffc3d4`). Two task: a coach can now import members from CSV inside the Members lane, and create a new member mid-wizard that lands in the company roster (not campaign-only). **Bulk CSV import** — new `ImportMembersModal` reachable from an "Import members" button next to "+ Add Member"; paste-area + client-side `parseRespondentCsv` preview (table of parsed rows + parse-error list with line numbers); skip/merge conflict mode radio; Import disabled while parse errors exist; `POST /api/organizations/{orgId}/respondents/bulk` returns `{ created, updated, skipped, errors[] }`. **Critical caught in review**: server-returned row-level errors on `success: true` were silently dropped (only the COUNT showed) — fixed by rendering each `Row N: reason` in a `role="alert"` list AND keeping the modal open until the user closes when failures exist (zero-error path still auto-closes after 1.5s). Plus double-close guard around the post-success setTimeout, `useId` for the textarea label, and `role="status"` / `role="alert"` on result-summary / parse-error panels. **Wizard persistent quick-add** — "Add new member" button in `ParticipantsStep` opens the existing `AddMemberModal` with a DialogDescription override "Adds this person to {orgName}'s roster (not just this campaign)" (per locked decision #8 — setup-first even when done in-flow). `AddMemberModal.onCreated` extended additively to pass the typed `created` respondent payload — no email-roundtrip needed. New member auto-included in `respondentIds`; the existing Slice-3 CEO-from-Level state machine handles a quick-added CEO/Founder-Level member naturally via the same `ceoPickSource` discriminator (no special-casing). 142/142 organizations test suites (incl. new ImportMembers + partial-success path test); 17/17 wizard suites (4 new quick-add tests covering button visibility, modal description, auto-include + re-fetch, CEO-from-Level handoff). Full suite **2152 passing** + the 3 known pre-existing failures unrelated to this branch. Zero migrations; zero destructive ops. **Slice 5 (coach landing companies + per-campaign metrics + CampaignDetail Team column + staged-progress icons) still deferred.** **Earlier today**: **Levels + CEO-from-Level suggestion shipped (Slice 3)** (branch `feat/assessment-slice-3-levels` merged via PR #20, squash commit `37dcd96`). Wires Esperto's 6 Levels end-to-end on `OrgRespondent.roleType` and adds a never-silent CEO auto-suggest in the campaign wizard. New canonical taxonomy file `src/src/lib/assessments/respondent-levels.ts` (Leadership team member / Employee / Guest / CEO/Founder with team / CEO/Founder alone / CEO/Founder; slugs lower-cased; only `ceofounder` confirmed against a live Esperto member row, the 3 CEO-variant slugs flagged in code as best-guess pending real CSV export). Both `createRespondentSchema` + `updateRespondentSchema` extended with `roleType: z.enum(...).optional().nullable()`. Level select wired into Add Member + Edit Member modals (Edit pre-fills + renders a `(legacy)` passthrough option when the DB value isn't in the 6 known slugs, so legacy/imported values survive an edit); members table renders the human label via `levelLabel()`. **Critical caught in code-quality review**: roleType was validated by Zod but never forwarded to Prisma — silently dropped on every POST/PATCH (tests passed because they mocked `fetch` and verified request shape, not DB writes). Fixed by threading `roleType` into `db.orgRespondent.create.data` and the PATCH route's `updateData` (with `!== undefined` so explicit `null` clears the column); EditMember additionally **omits roleType from the PATCH body when the value is an unchanged legacy/unknown slug**, so the enum doesn't reject pre-existing values during routine edits. 6 new API tests directly assert the Prisma `data` argument shape (not the request body) to lock the persistence invariant. **CEO-from-Level suggestion**: in the wizard's Participants step, when exactly **one** CEO/Founder-Level member is selected → auto-suggest them as the campaign CEO with an inline "Suggested by Level" hint. State machine via `ceoPickSource: 'auto' | 'user' | null` — a deliberate user click ALWAYS wins. **0 or >1 CEO-family selected → no auto-suggestion** (per decision #5 — never silently first-wins under ambiguity; the user must explicitly pick or leave the CEO null). Removing the suggested member clears the CEO. Existing `canActivate` rule unchanged — a coach can still save/activate without a CEO if they choose; the wizard's Review step + the Save click remain the explicit confirmation point. 6 new wizard tests cover all branches (single-suggest, multi-no-suggest, manual-wins, removal-clears, re-suggest-after-removal, null-roleType-never-suggested). **2140/2143** passing (only the 3 known pre-existing failures unrelated to this branch). Zero migrations; zero destructive ops. **Slices 4-5 (bulk CSV import + persistent quick-add in wizard / coach landing companies-supported + staged-progress + Team column on CampaignDetail) still deferred.** **Earlier today**: **Members & Teams edit modals shipped (Slice 2)** (branch `feat/assessment-slice-2-polish` merged via PR #19, squash commit `3b85992`). Coaches now have full CRUD on the Members & Teams lane via Pencil affordances on every row: **Edit Team** (PATCH with edit/reparent guards from decision #3 — Type cannot change to Company; Parent cannot become root; Parent cannot be self/descendants; client-side prune + server cycle-detection; Delete with 409-children inline error; null-type helper text; awaitable `onUpdated` that closes after refresh), **Edit Member** (PATCH `firstName/lastName/jobTitle/teamId`; email is read-only + disabled + never in PATCH body — the dedupe key is immutable here), **Edit Organization** (PATCH `name + externalId`; race-safe close-before-refresh). Code-quality review (Codex sonnet on Task 2.1, sonnet again on Task 2.2) caught a **Critical externalId silent-null bug** (every org edit was clearing a real `externalId` value because `OrgSummary` lacked the field and the modal pre-filled empty) and a **silent auto-reparent** bug on root-level teams — both fixed before merge. The outer coach portal nav (`coachPrimaryNavItems`) now exposes a **Members** entry (Building2 icon) between My Workshops and Assessments — Slice 1 had added `/portal/members` but my AssessmentsSidebar repoint was in a sidebar that doesn't render in the coach lane, so the route was previously only reachable by direct URL (or via the wizard's "Manage members" CTA). 117/117 organizations test suites green (10 suites); full suite still **3 known pre-existing failures** only (`no-inline-tolocaledatestring` / `org-survey-exchange` / `assessment-campaigns-detail-route`) in files this branch never touched. Zero migrations; zero destructive ops. **Slices 3-5 (Levels + CEO suggestion / bulk import + persistent quick-add / coach landing metrics + staged-progress) still deferred.** **Earlier today**: **Assessment Setup-First Flip — Slice 1 shipped to prod** (branch `feat/assessment-setup-first` merged via PR #18, squash commit `3d3dc10`; verified end-to-end on Vercel preview against the prod DB before merge). Coaches now manage **Company → Team → Users FIRST** in a dedicated `/portal/members` lane ("Members & Teams"), then campaigns just **pick** an existing company + a subset of its members. Wizard inline-create + bulk-CSV paths are gone in favor of pick-from-tree; `saveCampaign` no longer sends `bulkRespondents` (server helper `processBulkRespondentsForCreate` retained intact, marked deprecated, so older drafts/clients keep working). CampaignDetail Add Respondent likewise flips to add-existing only, excluding current participants (no quick-add). Decision **(A+)**: Company = our `Organization` (zero migration; campaigns keep `organizationId` FK), presented Esperto-style as a unified team tree with the company as the root node. New canonical spec `docs/specs/v7.6/08-members-teams-lane.md` (12 locked decisions, contract-first slice plan, staged-progress mapping `new=PENDING&!sentAt · invited=SENT · started=VIEWED · completed=SUBMITTED · REVOKED=excluded`). 12 commits TDD/SDD: implementer subagents per task + spec-compliance + code-quality reviewers (Codex opus for the riskiest); review caught + fixed a **Critical cross-company stale-selection bug** (would've created orphaned campaigns) before merge. 114/114 organizations + wizard + detail + sidebar suites green; full suite 2038 passing + 3 known pre-existing failures (no-inline-tolocaledatestring / org-survey-exchange / assessment-campaigns-detail-route) unrelated to this branch. Browser-smoked on the preview as a coach (test data prefixed `TEST DELETE ME 2026-05-28`); **legacy May 22 pre-flip campaign confirmed still renders + functions** (no data displacement). Built on top of the new build-time safety gate from PR #17. **Slices 2-5 (Members UX polish, Levels + CEO suggestion, import + persistent quick-add, landing metrics + staged-progress) deferred.** **OLD (May 27, 2026)**: **Database-wipe protection enforced** (branch `fix/db-wipe-protection`, P0): the two prod wipes were NOT from `prisma migrate deploy` (it can't wipe — all 29 migrations scanned, the only destructive op is an `@approved` scoped orphan delete). Most likely cause: an unguarded `prisma migrate reset`/`migrate dev` run against the prod `DATABASE_URL` during a migration conflict. New `scripts/safe-prisma.mjs` routes `db:reset`/`db:migrate`/`db:push` through a guard that refuses Neon hosts unless `--i-know-this-is-prod` (and *consumes* the flag — the old `db:push` override was silently broken because `npm run … -- --flag` appended it to prisma, not the guard; `guard-db-push.mjs` deleted). `check-migration-safety.mjs` is now wired into `vercel.json` + `package.json` build BEFORE `migrate deploy` (an unapproved destructive migration fails the build; proven). Snapshot hardened (retry on transient drops + `.PARTIAL` naming + hard-fail on missing core table, so a partial is never mistaken for complete). Config-integrity + negative-scan tests added. 28/28 script tests green; `CI=true npx next build --turbopack` clean; `npm run db:reset`/`db:push` proven BLOCKED against the live prod env (no DB contact). Complete read-only prod snapshot taken (185 rows, 0 errors). Highest-leverage open items need the Neon owner (`josh-4119`): least-privilege runtime DB role + confirm PITR retention window — see [docs/runbooks/database-protection.md](docs/runbooks/database-protection.md) §7–8. Note: `src/.github/workflows/` is inert (must be repo-root); live deploys go via Vercel git integration. See [plans/CHANGELOG.md](plans/CHANGELOG.md). **OLD (May 26, 2026)**: **Workflow cancellation ghost emails fixed** (commit `5cd3fec`): workflows were still firing after workshop deletion/cancellation because Inngest memoizes `step.run("fetch-assignment")` and the outer `isActive` guard was reading the cached value. Each `execute-stepN` now re-fetches `WorkflowAssignment.isActive` fresh from DB before sending; null (deleted) or false (canceled) both return early. 2 TDD tests; build clean. **Earlier today**: **Delete coach FK fix** (commit `c488308`): `DELETE /api/coaches/[id]` was throwing 500 whenever the coach had `AccessGroupCoach` memberships or owned organizations (both FK relations lack `onDelete: Cascade`). Transaction now checks org ownership (returns 400 with clear message), deletes `AccessGroupCoach` entries explicitly, nullifies nullable Coach? pointers on `OrganizationOwnershipEvent` + `AssessmentCampaign`, and gracefully retains the User account on P2003 when FK blocks User.delete(). 9 TDD tests; build clean. **Earlier today**: **{{workshopLocation}} virtual link fix** (commit `05fb7f1`): workflow email token was empty for virtual workshops because `buildLocationString` correctly returns `""` for VIRTUAL (ICS Gmail fix), but the workflow email context was not compensating. `execute-workflow.ts` + `trigger-workflow-step.ts` now use `workshop.virtualLink` directly when `format === "VIRTUAL"`. 4 TDD tests; build clean. **Earlier today**: **Export Registrations fix** (commit `197d1f3`): admin "Export Registrations" button was a dead `alert()` stub; export route had no `workshopId` filter. `GET /api/registrations/export` now accepts `?workshopId=` and filters accordingly; `quick-actions.tsx` triggers the download via `window.location.href`; 4 TDD tests; build clean. **Earlier today**: **ICS timezone offset fix** (commit `528a9de`): `.ics` downloads and Google Calendar links were using floating TZID format without a VTIMEZONE block, causing 5–8 hour offsets in Outlook and other clients. Fixed to emit UTC absolute datetimes (Z suffix) via `resolveEventStartMoment` + `formatIcsDateUtc`; 5 TDD tests updated; build clean. **Earlier today**: **Admin-created workshops no longer bypass approval queue** (commit `24e7535`): removed the "Admin/staff bypass" block in `api/workshops/route.ts` that was immediately emitting `workshop/approved` and triggering `runAutoBuild()` before Suzanne could approve; 1 TDD test; build clean. **Earlier today**: **Venue address bug fixes** (commits `d1033d4`+`b87e3bc`): admin create-workshop form was sending `venueAddress` as a plain object (Bug A), the API route was double-`JSON.stringify`-ing it (Bug B), thank-you page was rendering raw JSON as the location label (Bug C), and `schedule-emails.ts` was passing raw JSON into the `{{venue_address}}` workflow email variable (Bug D). All four fixed; 5 TDD tests; build clean. See [plans/CHANGELOG.md](plans/CHANGELOG.md) for full detail. **Earlier today**: **Assessment Tool Full Roster Build: multi-type question support (TEXT/NUMBER/MULTI_CHOICE) shipped end-to-end + LVA seed in production** (commits `be29d5a`–`22d2578`, 5 commits, 13 files). **Phase B** (`be29d5a`+`d57a669`): `scoring.ts` `QuestionBase` refactored from `z.literal("SLIDER_LIKERT")` to discriminated union (`SliderLikertQuestion` + `QualitativeQuestion`). `scoreSubmission` filters to SLIDER_LIKERT before scoring math; `questionByKey` built from ALL question types to prevent UNKNOWN_STABLE_KEY on non-slider answers. Same filter pattern in `checkRecommendationsRuntime` / `checkRecommendationsPublish` with `origIdx` preserving Zod error paths. Backward-compatible — existing QSP/Rockefeller/SU Full templates unchanged. 5 new tests (`scoring-multi-type.test.ts`); 83/83 scoring tests green. **Phase C** (`1fcef66`+`43f59de`): New `QuestionInput` shared component (all 4 types; MULTI_CHOICE enforces `maxChoices`; uses `aria-label={q.label}` to avoid dangling aria-labelledby). `org-survey-client` + `public-quiz-client` widened to `Record<string, number|string|string[]>` answers state; SLIDER_LIKERT filter removed from `/me` route + quiz page; both submit routes store all answer types in DB (rawAnswers) + call scorer only on SLIDER_LIKERT. New CSS in `wireframes-scoped.css`: `.survey-textarea`, `.survey-input-number`, `.survey-checkbox-group`, `.survey-checkbox-item`. 8 new component tests. **Phase D** (`7c9342a`): `seed-lva-assessment.ts` — 9 sections, 54 questions (NUMBER×9, TEXT×27, SLIDER_LIKERT×16, MULTI_CHOICE×1, NUMBER×1), idempotent 6-state advisory-lock pattern, DRAFT. **Phase E**: LVA seed ran against prod (`leadership-vision-alignment` template created, DRAFT). Scaling Up Full idempotent no-op (already present, DRAFT). Build gate clean (`CI=true npx next build --turbopack`). No DB migration — `AssessmentSubmission.answers` is `Json`, `value: z.unknown()`. Admin publishes both templates after Jeff confirms tier thresholds. **OLD (May 21, 2026)**: **Admin assessment-template editor fully rebuilt to match Jeff-approved wireframes WF16/17/18 + production data protection scaffold landed** (commit `35ee73b`, 36 files changed, +8620/−1146). **Editor rebuild**: 7-tab editor ([`TemplateEditorTabbed.tsx`](src/src/components/admin/TemplateEditorTabbed.tsx) + 5 tab components under `src/src/components/admin/template-editor/`) replacing the deprecated 1,586-LOC `AssessmentVersionEditor.tsx`. Tab order: Metadata / Sections / Questions / Scoring & Tiers / Conditional Logic [v1.5 disabled] / Access [nav-link to access-groups] / Versions. WF16 Metadata tab = 2-column body (Template Metadata + Invitation Email + Results Email cards left, Sections card right, Version History strip below). WF17 Questions tab = 3-column sticky layout (section navigator / question list with @dnd-kit drag handles / per-question config form; SLIDER_LIKERT editable; NUMBER/MULTI_CHOICE accordions ghosted v1.5). WF18 Scoring & Tiers tab = inline-editable tier table (Order/minMetric/maxMetric/Label/Message/Action) + 4-bullet validation hint + live midpoint-answer preview via existing `scoreSubmission` engine + Conditional Sections + Peer Benchmarks ghost placeholders + explanation card. **Gap D (D2 extension)**: per-domain tier sub-tables render under the flat global table when `scoringConfig.domains[]` is present (SU Full only). Versions tab = version-history list with per-row Edit/Duplicate/Publish; Publish wires to the same E1.2 `PublishFailureModal` (422 with `issues[]` opens modal, 409 toasts "Already published"). Schema additive only — migration `20260520180000_add_results_email_to_template` adds 3 nullable fields to `AssessmentTemplate` (`resultsEmailSubject`, `resultsEmailBodyMarkdown`, `resultsEmailContentApproved`). E1 engine work preserved byte-for-byte (`validateTierTiling`, per-domain publish refine, runtime per-domain check). Detail-route redirect: `/admin/assessments/templates/[id]` → `.../versions/{latest}/edit?tab=versions` (grill Q6). **Live app nav UNTOUCHED** — editor mounts inside existing AssessmentsSidebar lane (shipped pre-E1 per WF24). 10 grill questions + 5 per-tab Codex checkpoints all wireframe-fidelity reviewer-approved; TDD enforced (failing tests first); ~100 new tests across 6 tab-component test suites. Playwright screenshot verification confirms editor body matches WF16 with live nav intact. **Production data protection scaffold**: five layered protections for manually-configured prod data — (1) `npm run snapshot:prod` exports 22 critical tables to `.snapshots/<timestamp>.json` belt-and-suspenders on top of Neon PITR (gitignored, PII); (2) `npm run restore:from-snapshot <file> [--table=<N>]` upsert-by-id; (3) `npm run db:check-migrations` greps every migration.sql for DROP TABLE/COLUMN, TRUNCATE, DELETE FROM, ALTER COLUMN DROP and fails on any without an `-- @approved: <reason>` immediately-preceding comment (7 unit tests via `execFileSync` against tmp migration dirs; one legacy destructive op in `20260401000000_add_workshop_cascade_deletes` retroactively approved — orphan cleanup before FK CASCADE add, no operator data at risk); (4) `npm run db:push` wrapped with a guard that blocks Neon-host DATABASE_URLs unless `--i-know-this-is-prod`; (5) runbook at [docs/runbooks/database-protection.md](docs/runbooks/database-protection.md) covering pre-deploy checklist, Neon PITR restore procedure, snapshot restore, destructive-migration approval workflow, PII handling. 494/494 tests across 49 suites green; `CI=true npx next build --turbopack` clean. Plan: `~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md`.  |
| **Work Logs** | Session work logs at `~/.claude/worklogs/` — invoke `/log-session` to log or generate reports |

## Current Status

**Active items:** see `plans/JEFF_MAY6_SPRINT.md` for the open sprint ledger.

**Open follow-ons (deferred for Beta hardening or external input):**
- Per-recipient pre-send DB-check idempotency (Inngest replay duplicate-send risk)
- Immediate-path `executionId` synthesis with deterministic idempotency key (`inngestRunId` + `stepId`) so SEND_SURVEY_LINK FAILED-child writes work on the immediate path too — Wave 6 covers only the future RELATIVE_TO_EVENT path
- SEND_FILE_LINK / EMAIL_ATTENDEES FAILED-child writes (need SMTP error classification: terminal vs transient) — applies to BOTH execute-workflow.ts and trigger-workflow-step.ts
- Deterministic parent.id via `inngestRunId` for forceResend audit trail
- Error redaction codes for `WorkflowStepExecution.errorMessage`
- Structured logging/alerts/runbook for parent/child workflow execution state
- PII retention/erasure policy for recipient email audit data
- Concurrency limit + load test for large-attendee workshops
- ENH-MAY6-6 — affiliate provider switch (needs Jeff)
- ENH-MAY6-9 — aggregator as top-level toolset (needs design)
- ENH-MAY6-11 — coach-editable transactional emails (needs product call)
- Q-MAY6-1, Q-MAY6-2 — questions, not tasks
- STRIPE_WEBHOOK_SECRET rotation — pending Josh's authenticator

**Full sprint/wave history:** see [plans/CHANGELOG.md](plans/CHANGELOG.md) (extracted Feb 2026 → May 2026).

> Rollout note (2026-05-13): future history goes to `plans/CHANGELOG.md`, NOT here. CLAUDE.md "Current Status" stays a short summary.

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.1.6 |
| Language | TypeScript | 5.x |
| Database | PostgreSQL (Neon) + Prisma ORM | Prisma 6.x |
| Auth | NextAuth.js (JWT sessions, credentials provider) | |
| Payments | Stripe | |
| CRM | HubSpot | |
| Certifications | Circle.so | |
| Job Queue | Inngest | |
| Cache | Redis (Upstash) | |
| Email | Azure Communication Services | |
| Forms | Typeform (5 forms, webhook integration) | |
| CSS | Tailwind CSS + shadcn/ui | |
| Hosting | Vercel | |

## Workshop Lifecycle (JV-02: Jeff's 6 Stages)

```
REQUESTED → AWAITING_APPROVAL → PRE_EVENT → POST_EVENT → COMPLETED
                                    ↓
                                 CANCELED (from REQUESTED, AWAITING_APPROVAL, or PRE_EVENT)
```

- **REQUESTED**: Coach submits via wizard → Workshop + ApprovalQueue created simultaneously
- **AWAITING_APPROVAL**: Auto-approved (cert confidence >=85%) or manual review by Suzanne
- **PRE_EVENT**: Active, accepting registrations, landing pages live
- **POST_EVENT**: Event concluded, collecting feedback/surveys
- **COMPLETED**: All follow-up done
- **CANCELED**: Soft-delete; $500 fee if within 14 days of event (JV-28)

## Workshop Code (JV-03)

Every workshop gets a unique human-readable ID: `WS-YYYY-XXXX` (e.g., `WS-2026-A1B2`).
Generated by `src/lib/workshops/workshop-code.ts` via `generateUniqueWorkshopCode()`.

## Source Structure

```
src/
├── prisma/
│   ├── schema.prisma          # Data model (20+ models)
│   ├── seed.ts                # Dev seed data
│   └── seed-real-data.ts      # Real Kajabi migration data
├── src/
│   ├── app/
│   │   ├── (dashboard)/       # Admin/staff dashboard (requires ADMIN/STAFF role)
│   │   │   ├── layout.tsx     # Nav: Dashboard, All Workshops, Bio, Templates, Workflows, Surveys, Files, Partners, Coaches, Approvals, Categories, Pricing, Financials
│   │   │   ├── dashboard/     # Admin overview
│   │   │   ├── workshops/     # Workshop CRUD, detail, landing pages, quick-actions
│   │   │   ├── coaches/       # Coach management
│   │   │   ├── bio/           # BIO pages
│   │   │   ├── templates/     # Template management
│   │   │   ├── admin/surveys/  # Survey template management (form builder + results)
│   │   │   ├── admin/files/   # File manager (upload, filter, delete)
│   │   │   ├── partners/      # Partner management
│   │   │   └── contacts/      # CRM contacts
│   │   ├── (portal)/          # Coach self-service portal (requires COACH role)
│   │   │   ├── layout.tsx     # Sidebar nav with search, notifications, sign out
│   │   │   └── portal/
│   │   │       ├── home/      # Coach dashboard
│   │   │       ├── workshops/ # My Workshops + detail (with cancel button)
│   │   │       ├── registrations/ # Registration management
│   │   │       ├── request/   # Workshop request wizard (3-step)
│   │   │       ├── settings/  # Profile + password change
│   │   │       ├── templates/ # Available templates
│   │   │       └── follow-up/ # 90-day follow-up
│   │   ├── (public)/          # Public pages (no auth)
│   │   │   ├── login/         # Credentials login
│   │   │   ├── register/      # Coach signup
│   │   │   ├── workshop/[slug]/ # Public landing pages
│   │   │   ├── w/[slug]/      # Short URL redirect
│   │   │   └── registration/success/ # Post-registration confirmation
│   │   │   ├── admin/approvals/  # Approval queue management (merged into dashboard layout)
│   │   │   ├── admin/categories/ # Category CRUD (JV-16)
│   │   │   ├── admin/dashboard/  # Admin analytics + 6-stage pipeline (JV-01)
│   │   │   ├── admin/financials/ # Financial dashboard (JV-21)
│   │   │   ├── admin/pricing/    # Pricing tier CRUD (JV-17)
│   │   │   └── admin/settings/   # Admin settings + password change
│   │   └── api/               # API routes (see below)
│   ├── components/
│   │   ├── ui/                # shadcn/ui + custom (status-pill, copy-url-button)
│   │   ├── auth/              # Shared auth (change-password-form)
│   │   ├── workshops/         # Workshop components (wizard, cancel-dialog)
│   │   │   └── wizard/        # 3-step wizard (Step1Details, Step2Logistics, Step3Review, WizardContext)
│   │   ├── templates/         # Landing page templates
│   │   ├── contacts/          # Contact management
│   │   ├── surveys/           # Survey components (template-editor)
│   │   ├── files/             # File management components
│   │   └── affiliate/         # Partner/affiliate components
│   ├── lib/                   # Core business logic
│   │   ├── auth/              # Auth: auth.ts, authorization.ts, password-reset.ts, auth-posture.ts, access-control.ts
│   │   ├── workshops/         # Workshop logic: workshop-code.ts, workshop-coupons.ts, workshop-financials.ts, lead-time-validator.ts
│   │   ├── surveys/           # Survey logic: survey-service.ts, survey-types.ts, survey-automation.ts
│   │   ├── templates/         # Template logic: template-interpolation.ts, template-interpolation-core.ts, template-utils.ts, template-preview.ts, template-editor-utils.ts
│   │   ├── workflows/         # Workflow logic: workflow-service.ts, workflow-types.ts
│   │   ├── files/             # File logic: file-service.ts, file-access.ts, file-download-path.ts, file-rules.ts
│   │   ├── approval-engine.ts # Auto-approval logic (cert confidence >=85%)
│   │   ├── smtp-transport.ts  # Shared SMTP transport (single source of truth for email sending)
│   │   ├── registration-service.ts # Registration with capacity/duplicate checks
│   │   ├── validations.ts     # Zod schemas
│   │   ├── utils.ts           # formatDate, formatCurrency, generateSlug, getWorkshopStatusLabel
│   │   ├── rate-limit.ts      # API rate limiting
│   │   └── db.ts              # Prisma client singleton
│   ├── services/              # External service integrations
│   │   ├── stripe.ts          # Payments, cancellation fees, refunds
│   │   ├── hubspot.ts         # CRM sync
│   │   ├── circle.ts          # Certification verification
│   │   ├── email-sender.ts    # Email sending (uses shared smtp-transport)
│   │   └── notifications.ts   # Multi-channel notifications (uses shared smtp-transport)
│   ├── inngest/               # Background job definitions
│   └── __tests__/             # Jest unit tests
└── package.json
```

## API Routes

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/approvals` | GET, POST | List/create approval requests | Admin (GET), Any auth (POST) |
| `/api/approvals/[id]/respond` | GET, POST | Approve/deny (GET=email link, POST=dashboard) | Admin |
| `/api/workshops` | GET, POST | List/create workshops | Auth required |
| `/api/workshops/[id]` | GET, PATCH, DELETE | Workshop CRUD + cancellation | GET: owner/admin, PATCH: admin, DELETE: owner/admin |
| `/api/workshops/[id]/clone` | POST | Clone a workshop | Admin |
| `/api/workshops/[id]/register` | POST | Public registration | Public |
| `/api/workshops/[id]/status` | PATCH | Status transitions | Admin |
| `/api/workshops/[id]/lock` | POST | Lock/unlock workshop | Admin |
| `/api/workshops/[id]/circle-profile` | GET | Fetch Circle bio for landing page auto-populate | Auth required |
| `/api/workshops/[id]/ics` | GET | Download .ics calendar file for workshop | Public |
| `/api/workshop-drafts` | GET, POST | Auto-save wizard drafts | Coach |
| `/api/auth/change-password` | POST | Change password (any user) | Any auth |
| `/api/auth/coach-signup` | POST | Coach self-registration | Public |
| `/api/auth/forgot-password` | POST | Password reset request | Public |
| `/api/auth/reset-password` | POST | Password reset execution | Public |
| `/api/categories` | GET, POST | Category CRUD (GET=public, POST=admin) | GET: Public, POST: Admin |
| `/api/categories/[id]` | PATCH, DELETE | Update/delete category | Admin |
| `/api/pricing-tiers` | GET, POST | Pricing tier CRUD (GET=public, POST=admin) | GET: Public, POST: Admin |
| `/api/pricing-tiers/[id]` | PATCH, DELETE | Update/delete pricing tier | Admin |
| `/api/coaches` | GET, POST | Coach CRUD | Admin |
| `/api/coaches/[id]` | GET, PATCH, DELETE | Coach detail/update/delete | Admin |
| `/api/coaches/[id]/certifications` | POST, DELETE | Grant/revoke workshop type certification | Admin |
| `/api/registrations` | GET | Registration list | Auth required |
| `/api/landing-pages` | GET | Landing page list | Admin |
| `/api/workflows` | GET, POST | List/create workflows | Auth required |
| `/api/workflows/[id]` | GET, PATCH, DELETE | Workflow CRUD | Auth required |
| `/api/workflows/[id]/steps` | POST, PATCH | Add/reorder workflow steps | Auth required |
| `/api/workflows/[id]/steps/[stepId]` | PATCH, DELETE | Update/delete step | Auth required |
| `/api/workflows/[id]/assign` | POST, DELETE | Assign/unassign workflow to workshop | Auth required |
| `/api/workflows/[id]/executions` | GET | Workflow execution status by workshop | Auth required |
| `/api/survey-templates` | GET, POST | List/create survey templates | Auth required |
| `/api/survey-templates/[id]` | GET, PATCH, DELETE | Survey template CRUD | Auth required |
| `/api/survey-templates/[id]/questions` | POST, PATCH | Add/reorder questions | Auth required |
| `/api/survey-templates/[id]/questions/[qId]` | PATCH, DELETE | Update/delete question | Auth required |
| `/api/survey-templates/[id]/results` | GET | Aggregated survey results | Auth required |
| `/api/surveys/[id]` | GET | Get survey form (public) | Public |
| `/api/surveys/[id]/submit` | POST | Submit survey answers (public) | Public |
| `/api/surveys/assign` | POST | Assign template to workshop | Auth required |
| `/api/files` | GET, POST | List files (filterable) / Upload file (FormData) | Auth required |
| `/api/files/[id]` | GET, PATCH, DELETE | File details / Link to workflow step / Delete | Auth required |
| `/api/webhooks/typeform` | POST | Typeform form submission | Webhook secret |
| `/api/webhooks/stripe` | POST | Stripe payment events | Webhook signature |

## Data Model (Key Models)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `User` | Auth accounts | email, role (ADMIN/STAFF/COACH), passwordHash |
| `Coach` | Coach profiles | email, userId (FK to User), certificationStatus, territory |
| `Workshop` | Workshop events | workshopCode, coachId, status (6 stages), eventDate, priceCents, termsAcceptedAt |
| `WorkshopType` | Workshop templates | name, slug, pricingTiers (JSON), durationOptions (JSON) |
| `Category` | Dynamic categories (JV-16) | name, slug (replaces enum) |
| `PricingTier` | Pricing dropdown (JV-17) | categoryId, amountCents |
| `Registration` | Attendee records | workshopId, email, paymentStatus, stripePaymentId |
| `ApprovalQueue` | HITL approval system | type, coachId, workshopId, status |
| `LandingPage` | Generated pages | workshopId, template, slug, content (JSON) |
| `WorkshopPage` | Unique pages per workshop (JV-10) | workshopId, workshopCode, pageType |
| `AuditLog` | All actions tracked | entityType, entityId, action, performedBy |
| `WorkshopDraft` | Wizard auto-save | userId, stepsData (JSON), currentStep |
| `Workflow` | Email sequence definitions (JV-11) | name, isTemplate, isActive, steps[] |
| `WorkflowStep` | Individual steps in a workflow | stepType, triggerType, offsetDays, subject, body |
| `WorkflowAssignment` | Links workflows to workshops (JV-04) | workflowId, workshopId, workshopCode |
| `WorkflowStepExecution` | Tracks step execution state | stepId, workshopId, status, scheduledFor |
| `Workshop.workshopBuiltEmailSentAt` | Atomic guard — set when "Workshop Ready" email is sent | DateTime?, null = not yet sent (BUG-MAY4-2) |
| `SurveyTemplate` | Reusable survey definitions (JV-13) | name, surveyType, isActive, questions[] |
| `SurveyQuestion` | Individual questions in a template | templateId, questionType, label, options (JSON) |
| `Survey` | Survey instance per workshop | templateId, workshopId, workshopCode, completedAt |
| `SurveyAnswer` | Individual answers per question | surveyId, questionId, value, numValue |
| `FileAttachment` | Uploaded files (Vercel Blob) (JV-12) | filename, blobUrl, contentType, workshopId, workflowStepId |

## Authorization Model

| Role | Access |
|------|--------|
| **ADMIN** | Full access to all routes and data |
| **STAFF** | Same as admin except certain settings |
| **COACH** | Portal only; can manage own workshops, registrations, profile |

Key functions in `lib/auth/authorization.ts`:
- `getApiActor()` — Returns authenticated user info from JWT session
- `requireCoach()` — Server component guard; redirects if not a coach
- `isPrivilegedRole(role)` — Returns true for ADMIN or STAFF
- `canManageCoachData(actor, coachId)` — Coach can manage own data, admin can manage any

## Human-in-the-Loop (HITL)

All these require manual approval by Suzanne:
- Custom pricing requests (auto-approve if cert confidence >=85%)
- Workshop cancellations within 14 days ($500 fee)
- Refund processing
- Certification edge cases (<85% confidence)

**Notification:** Email via Azure Communication Services (NOT Slack)

## Jeff Verdun's 29 Revisions (Feb 15, 2026)

Cataloged in `plans/JEFF_VERDUN_REVISIONS_IMPLEMENTATION_ROADMAP.md` (IDs JV-01 through JV-29).

### Completed JV revisions

**JV revisions shipped (25 of 29):** JV-01, 02, 03, 04, 05, 06, 07, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 26, 27, 28, 29. Per-revision implementation detail: [plans/CHANGELOG.md](plans/CHANGELOG.md).

**JV revisions remaining (4):** JV-08 (HTTPS env canonicalization), JV-12 hardening (protected file delivery by stage threshold), JV-23 (email tracking), JV-24 (Circle SSO/auth).

## Development Commands

```bash
cd "D:\The CTO Project\Scaling Up Platform v2\src"

npm run dev              # Start dev server (Turbopack)
npm run build            # Production build (always run before committing)
npm run test             # Jest unit tests
npm run test:e2e         # Playwright E2E tests
npm run lint             # ESLint
npx prisma generate      # Regenerate Prisma client after schema changes
npx prisma migrate dev   # Create + apply migrations
npx prisma db push       # Push schema without migration (dev only)
npx tsx prisma/seed.ts   # Seed dev data
npx tsx prisma/seed-real-data.ts  # Seed real Kajabi migration data
npx tsx prisma/seed-templates.ts # Seed active landing page templates for auto-build
```

## Environment Variables

Secrets are in local `.env` (gitignored) and Vercel dashboard. Key variables:

- `DATABASE_URL` / `DIRECT_URL` — Neon PostgreSQL
- `NEXTAUTH_SECRET` / `NEXTAUTH_URL` — Auth
- `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` — Canonical admin
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Payments
- `HUBSPOT_ACCESS_TOKEN` — CRM
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` — Job queue
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Cache
- `TYPEFORM_WEBHOOK_SECRET` — Form webhooks
- `AZURE_COMMUNICATION_CONNECTION_STRING` — Email
- `APP_URL` — Public URL for landing page links

## Known Quirks & Gotchas

- **Inngest event keys** do NOT start with `evt_` — use key-in-URL format `https://inn.gs/e/<key>`
- **Typeform webhook signature**: HMAC SHA-256, base64, header `typeform-signature: sha256=<base64>`. May append trailing `\n` to body.
- **Vercel env vars** need a redeploy to take effect
- **Workshop status spelling**: Workshop uses "CANCELED" (American); Registration/PageStatus uses "CANCELLED" (British) — different domains, intentional
- **workshopType is optional**: Made nullable in Sprint 0 (JV-16). Always use `workshop.workshopType?.` with optional chaining.
- **Build script runs migrations**: `prisma migrate deploy` runs automatically during `npm run build` (added Feb 27). Never remove this — without it, new schema columns cause runtime crashes on Vercel because the Prisma client expects columns the DB doesn't have yet.
- **Dashboard canonical route is `/admin/dashboard`**: The `/dashboard` route redirects to `/admin/dashboard`. Do NOT create pages at `/dashboard` directly.
- **File uploads**: Filenames are sanitized (path separators, null bytes, `..` stripped) before Vercel Blob storage
- **File deletion**: Ownership verified — only the uploader or ADMIN/STAFF can delete files
- **Survey submission**: Public endpoint rate-limited at 20 req/min per IP
- **SMTP transport**: All email sending goes through `lib/smtp-transport.ts` — do NOT create new nodemailer transports elsewhere
- **Admin layout unified**: All admin pages are under `(dashboard)/admin/` — the standalone `/admin/` layout was removed in Feb 26 cleanup
- **Nav bar has 13 items**: Dashboard, All Workshops, Bio, Templates, Workflows, Surveys, Files, Partners, Coaches, Approvals, Categories, Pricing, Financials. Uses `overflow-x-auto` for horizontal scroll on tight screens. Desktop nav shows at `lg` (1024px+); mobile hamburger shows below `lg`. Email shows at `xl` (1280px+) only.
- **Dead code removed (Feb 26)**: animations.ts, cache.ts, api-handler.ts, logger.ts, landing-page-auto-populate.ts, workshop-generator.ts — all deleted, zero imports
- **Approval engine emits Inngest events**: `workshop/approved` event emitted on approval (added in Sprint 5) — triggers auto-build function
- **Bio page CTA toggle exists**: Bio page editor already has "Show CTA button on bio page" checkbox (discovered via video analysis)
- **npm audit**: 3 low-severity `cookie` vulns via `@auth/core` → next-auth. Fix requires next-auth downgrade — deferred
- **Design tokens live in globals.css only**: `brand-tokens.css` was deleted (zero imports). `MASTER.md` is reference docs only.
- **Never use hardcoded Tailwind colors for semantic states**: Use `text-destructive` not `text-red-600`, `bg-success/10` not `bg-green-50`, `text-primary` not `text-blue-600`.
- **Sidebar uses `--sidebar-*` tokens**: Coach portal sidebar uses `bg-sidebar`, not `bg-slate-900`.
- **Workshop status colors use `--status-*` tokens**: `getWorkshopStatusColor()` and `StatusPill` both use dedicated status tokens.
- **Security S1-S8 applied**: Nonces, webhook secrets, survey validation, JSON safety, error handlers, 15s timeouts, idempotency, email dedup.
- **Never push NODE_ENV to Vercel**: Vercel manages NODE_ENV automatically. Pushing `NODE_ENV=production` causes `npm install` to skip devDependencies, breaking builds (e.g., `@tailwindcss/postcss` not found). The `scripts/push-env-to-vercel.mjs` script has NODE_ENV in its SKIP list.
- **Workshop.eventDate is midnight UTC — always use resolveEventStartMoment**: `eventDate` is stored as 00:00 UTC. The actual event time is in `eventTime` (string, "16:00 - 18:00") and `timezone` (IANA). Always call `lib/workflows/resolve-event-start-moment.ts` → `resolveEventStartMoment(workshop)` before passing a time to `calculateSendDate`. Bypassing this causes scheduledFor to land ~20h in the past.
- **workshopBuiltEmailSentAt is the "Workshop Ready" email claim**: `runAutoBuild` sets this atomically before sending. If it's already non-null, the email was already sent — don't send again. Cleared on SMTP failure so a retry can re-send.
- **Workflow variables support both naming conventions**: `interpolateTemplate()` in `lib/workflows/workflow-service.ts` accepts both camelCase (`{{workshopTitle}}`) and snake_case (`{{workshop_title}}`). Also supports `{{attendee_name}}` as alias for `{{registrantName}}`.
- **lib/ is now domain-organized**: `lib/auth/`, `lib/workshops/`, `lib/surveys/`, `lib/templates/`, `lib/workflows/`, `lib/files/` subdirectories. Cross-cutting utilities stay at `lib/` root. See `project-file-map` skill for quick lookup.
- **Next.js middleware lives at `src/src/middleware.ts`** — renamed from the inactive `proxy.ts`. Next.js picks it up because `app/` and middleware must share the same parent directory (`src/src/`).
- **`prisma/*.db` is gitignored**: SQLite dev databases are excluded. The app uses Neon PostgreSQL in all environments.
- **Env push script (`scripts/push-env-to-vercel.mjs`)**: Uses Node.js `input` option on `execSync` to pipe values — NOT shell `echo` (which breaks on Windows due to literal quote preservation). Production overrides for URL-related vars. SKIP list: `BLOB_READ_WRITE_TOKEN`, `NODE_ENV`.
- **Node version pinned**: `.nvmrc` pins Node 20 for Vercel compatibility. Local development should use Node 20.
- **tsconfig excludes scripts**: `prisma/seed*.ts` and `scripts/**` are excluded from TypeScript build checking — they're standalone CLI scripts, not app code.
- **Always run `CI=true npm run build` before pushing**: See "Deployment Verification Protocol" section below.

## Deployment Verification Protocol

**MANDATORY before every `git push` to `main`:**

1. **Run the FULL Vercel build command locally** (not just `next build`):
   ```bash
   CI=true npm run build
   ```
   This runs `prisma generate && prisma db push && next build` with CI mode — matching Vercel exactly.

2. **Check ESLint on changed files:**
   ```bash
   npx eslint <changed-files>
   ```
   Fix ALL warnings AND errors. Vercel may treat warnings as build failures.

3. **Run tests on changed areas:**
   ```bash
   npm run test -- --passWithNoTests
   ```

4. **After pushing, verify Vercel deployment status:**
   ```bash
   npx vercel ls 2>&1 | head -5
   ```
   Wait for `● Ready` status. If `● Error`, check build logs in Vercel dashboard.

5. **If Vercel build fails but local passes:**
   - Check Node version: `.nvmrc` pins Node 20 (Vercel default). Local must match.
   - Check `tsconfig.json` exclude list: standalone scripts (`prisma/seed*.ts`, `scripts/**`) are excluded to prevent cross-platform TS issues.
   - Check for stale build cache: try redeploying from Vercel dashboard with "Clear Build Cache" option.
   - Check `prisma db push` connectivity: Neon databases may cold-start timeout on Vercel's build server.

**Why this matters:** Local `npx next build` does NOT match the Vercel build pipeline. The Vercel build also runs `prisma generate` + `prisma db push` (database migration), and runs in a Linux/Node 20 environment. A passing local build does NOT guarantee a passing Vercel build.

## Standing Security Practice

Security improvements ship with every sprint — no separate security sprint needed. Jeff is already aware of the security posture. On every sprint:
- Validate input at all new API boundaries (Zod)
- Rate-limit any new POST/mutation endpoints (`withRateLimit`)
- Auth check first (`getApiActor()` → 401 if null)
- No raw HTML injection in JSX (escape user-controlled fields)
- Audit log on sensitive mutations (`logAudit()`)
- No secrets or tokens in console.log

## Continuous Update Protocol

**After every sprint or significant change, update this file:**
1. Move completed JV revisions to the "Completed" table
2. Update "Current Status" section with sprint progress
3. Update "Last Updated" date
4. Add any new API routes, models, or components to the relevant sections
5. Document new gotchas or quirks discovered during development
6. Append full implementation detail to [plans/CHANGELOG.md](plans/CHANGELOG.md) (newest first with HTML-comment anchor `<!-- ENTRY_ISO:YYYY-MM-DD ENTRY_SLUG:kebab-slug -->`); update only the LAST_UPDATED_ISO/LAST_UPDATED_SLUG anchor + brief prose in the Project Context table.

## Agent skills

### Issue tracker

Issues live as GitHub Issues on `jcbdelo26/Scaling-up-platform-v2`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five state labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus category labels (`bug`, `enhancement`, `security`, `documentation`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. `CLAUDE.md` is the primary reference; `CONTEXT.md` and `docs/adr/` are created lazily by `/grill-with-docs`. See `docs/agents/domain.md`.

### Historical work lookup

For sprint/wave detail: read [plans/CHANGELOG.md](plans/CHANGELOG.md). For code-level history: `git log -p` + `git blame -C -C`. For session-level work logs: `~/.claude/worklogs/` (invoke `/log-session`).
