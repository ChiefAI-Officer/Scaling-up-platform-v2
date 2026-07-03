# Wave Q — Admin & Coach Controls (Jeff July-1 items #1 / #6 / #7) — DESIGN

**Status:** Spec approved-pending-user-review → `/co-validate` → subagent TDD build.
**Source:** `From Jeff/gabriel-items-2026-07-01.pdf` items #1, #6, #7 (P3 "Controls for admins & coaches" tier of the July-2 triage).
**Scoped:** 2026-07-02 via `/superpowers:brainstorm` + `/grill-with-docs` + `/grill-me` (9 user decisions, all recorded below).
**Companion:** ADR-0018 (admin offboarding semantics). Glossary terms added to `CONTEXT.md` (*Disabled template*, *Results-email default*, *Admin removal*).

---

## Rollout posture (decided)

One wave flag **`WAVE_Q_ADMIN_CONTROLS`** in a new `src/src/lib/assessments/wave-q-flags.ts`, copied from the Wave O/P pattern **minus the CANARY lever** (admin-global controls; org/template canary scoping is meaningless here — a documented departure). Levers: `WAVE_Q_ADMIN_CONTROLS_KILL` > `WAVE_Q_ADMIN_CONTROLS_ENABLED`; call-time `process.env` reads; default OFF. Merge dark → same-session launch walk.

**Kill semantics follow one durable rule (decided; revised in co-validate): flags gate capabilities and writes — never the enforcement of persisted admin intent.**

| Item | Flag gates | Unconditional | On KILL |
|---|---|---|---|
| #1 default | wizard default derivation + admin toggle UI/API write | — (the derivation is a convenience default seeding a coach-editable checkbox, not retirement/offboarding intent — killable by design) | wizard reverts to hardcoded `false` (stored defaults persist, inert). Campaigns already created with a seeded `true` keep it — kill never retro-edits campaign booleans (the coach saw and could flip the checkbox; send-time is governed by Wave D's flag + approval, not Wave Q) |
| #6 disable | the Enable/Disable UI + PATCH write | picker filter + create-route 409 | no more disable/enable operations — already-disabled templates **stay hidden**. A kill must never silently un-retire a template. |
| #7 removal | the remove capability (UI + endpoint) | login block + API/page liveness checks | no more removals — removed admins **stay locked out**. A kill switch must never un-fire an offboarding. The REVIVE path (invite + accept) is deliberately NOT flag-gated either: it requires an explicit ADMIN invite + email acceptance, and a kill must not strand a legitimate re-onboarding (recorded intent, adversarial-review round). |

Both unconditional enforcements are inert until a row ever carries `disabledAt`/`deletedAt` — and only the flag-gated endpoints can set them — so unconditional enforcement changes nothing for anyone until the feature is actually used. Rollback of enforcement itself = `git revert` (or DB-clearing the column), a deliberate act, not a flag side-effect.

---

## Item #1 — Results-email template default + coach override

**Jeff:** "Set the 'send results to end users' option as a default at the template level, with individual coaches able to override that default on their own campaigns."

**Today:** `AssessmentCampaign.sendResultsToRespondent` (default `false`) is the per-campaign toggle (Wave D #15). The wizard checkbox default is hardcoded `false` (`CampaignWizard.tsx:309`); it is disabled unless the template's results-email content is approved (`resultsEmailContentApproved` + content-hash, `results-email-approval.ts:41-53`), and the approval is re-enforced at send time (`org-survey/[campaignAlias]/submit/route.ts:137-144`). No coach-level preference exists anywhere.

**Design (decided: per-campaign checkbox IS the override — no coach-level standing preference):**

- **Schema:** `AssessmentTemplate.sendResultsDefault Boolean @default(false)` — additive migration, backfills everything to `false` (current behavior).
- **Admin UI:** a toggle in the template editor beside the existing results-email subject/body/approval controls. Settable at any time, including while unapproved — stored but **inert until approval**, with hint copy: *"Takes effect once the results email content is approved."* (The July-2 progress report already told Jeff the default "lands in each template's settings" — placement is anchored.)
- **API:** the admin template PATCH (`/api/admin/assessment-templates/[id]`, ADMIN+STAFF) accepts `sendResultsDefault`; write is flag-gated + audit-logged. Independent of the approval hash (a default flip never invalidates approval, and vice versa).
- **Picker:** `/api/assessment-templates` GET already returns per-template `resultsEmailApproved`; it additionally returns `sendResultsDefault` (both branches: privileged + coach-intersection).
- **Wizard:** initial checkbox state becomes `flagOn && approved ? template.sendResultsDefault : false` (replacing the hardcoded `false`); template-switch mid-wizard resets to the **new** template's derived default (today it only force-falses when unapproved); a resumed draft keeps the coach's explicitly saved choice (existing `parsed.sendResultsToRespondent === true` rehydration untouched). The checkbox itself is the coach's override — flipping it per campaign is the entire override story.
- **Send time:** unchanged. Campaign boolean + approval-hash gate; approval always wins.
- **Flag interplay (documented):** the whole checkbox block renders only when Wave D's `WAVE_D_RESULTS_EMAIL_ENABLED` is on (live in prod since Jun 30). Wave Q's default only matters where Wave D's feature exists; Wave Q off = today's behavior byte-for-byte.

## Item #6 — Disable retired templates

**Jeff:** "Disable a template that is no longer in use (e.g. QSP V1) so it does not appear as an option when setting up a new campaign."

**Today:** templates have soft-**delete** (`deletedAt`) — hidden everywhere, 409-blocked while DRAFT/ACTIVE campaigns exist, blocks re-seeds (`seed-template-version.ts` throws). That is a stronger, different lifecycle state than Jeff's "disable".

**Design (decided: new third state, `disabledAt`):**

- **Schema:** `AssessmentTemplate.disabledAt DateTime?` — additive.
- **Hidden from (unconditional — see rollout rule):** both campaign-create template-picker branches (`/api/assessment-templates` GET: privileged `route.ts:47-62` + coach `route.ts:121-135` add `disabledAt: null`).
- **Enforced server-side (unconditional):** campaign create (`/api/assessment-campaigns` POST) rejects a disabled `templateId` with 409 `TEMPLATE_DISABLED` — hiding without enforcement is cosmetic. A resumed wizard draft pointing at a now-disabled template surfaces "This template is no longer available — choose another" and forces a re-pick. Only the Enable/Disable capability (UI + PATCH) is flag-gated.
- **NOT affected (verified in code):** existing campaigns, reports, trends, longitudinal (all filter on the *campaign's* `deletedAt`, never the template's — e.g. `trends.ts:365`), the admin templates list, template editing, re-seeds, version publishes, and the public `/quiz` path (which never consults the picker filter).
- **Endpoint scope verified:** the ONLY consumers of `/api/assessment-templates` GET are the two CampaignWizard fetches (`CampaignWizard.tsx:1046,1938`) — the trends page queries the DB directly (`trends/page.tsx:123`) and deliberately **keeps listing disabled templates** so historical trends (e.g. old QSP-v1 rounds) stay reachable. Do not "fix" that later. **Review catch (adversarial round): the admin PUBLIC-campaign create path (`admin/public-campaigns` POST + `PublicCampaignsManager` dropdown, which reads the admin list endpoint) is a THIRD new-campaign surface — it now carries the same unconditional 409 + a dropdown filter.**
- **Esperto import path (deliberate):** results-import resolves templates by crosswalk alias, not through the picker — importing historical rounds for a disabled template **remains allowed** (historical import ≠ new sends). Documented, not an oversight.
- **Draft-resume mechanism:** a resumed draft whose `templateId` is absent from the picker payload hits the wizard's existing unknown-template handling → "no longer available" state + re-pick; the create-route 409 is the backstop for races.
- **Admin UI:** the WF14-derived templates list (`AssessmentTemplatesList.tsx`) gains a `Disabled` badge and an **Enable/Disable** row action (flag-gated rendering) calling the admin PATCH; audit-logged (`TEMPLATE_DISABLED` / `TEMPLATE_ENABLED`). No active-campaign guard — running campaigns keep running by design. Delete remains exactly as-is for true removal.
- **Guard level:** ADMIN+STAFF (`isPrivilegedRole`), matching every other admin template route.

## Item #7 — Remove departed admins

**Jeff:** "There is currently no way to delete an admin who no longer works for the company from the admin portal."

**Today:** no removal path of any kind. `User` has no `deletedAt`; non-nullable `createdBy` FKs (templates, campaigns, access groups…) make a hard delete impossible for any admin who ever created assessment data (the coach-delete code already documents swallowing `P2003` for exactly this). JWT sessions (30-day) are never re-validated against the DB — but `getUserForApiRoute()` **already does a per-request DB read** for every API route, so API-side revocation is a free field check. Dashboard page loads check only the JWT (`(dashboard)/layout.tsx`). Non-canonical admins are additionally gated at login by the AdminInvite guard (`auth.ts:102-113`); the canonical `ADMIN_EMAIL` bypasses it (`auth.ts:12-16`).

**Design (decided: soft-remove + live revocation; enforcement unconditional; revive-on-accept):**

- **Schema:** `User.deletedAt DateTime?` — additive.
- **Remove endpoint:** `DELETE /api/admin/admin-users/[id]` — **ADMIN-only** (stricter than STAFF, matching the invite routes). In one transaction: set `deletedAt`, delete the target's `AdminInvite` row (aligns the invite guard AND frees the email for re-invite), audit-log `ADMIN_USER_REMOVED`. Flag-gated availability.
- **Guards:** target must be role ADMIN or STAFF; no self-removal; canonical `ADMIN_EMAIL` cannot be removed (`isCanonicalAdminEmail`); 404 on already-removed. **Hybrid accounts (ADMIN/STAFF with a coach profile) ARE removable** — "left the company" means the whole account locks (`deletedAt` blocks login for every role); the coach profile row and its data stay untouched (ownership reassignment is the existing coaches-page concern, out of scope). The settings card lists hybrids with a coach chip so the operator sees the blast radius. (Codex R1: excluding hybrids would silently fail the actual offboarding case.)
- **Enforcement (NOT flag-gated — see rollout table):**
  1. Login: `authorize()` rejects any user with `deletedAt` set (all roles — belt for future reuse).
  2. API liveness: `getApiActor()` (via `getUserForApiRoute`) returns null when `deletedAt` is set — zero added queries.
  3. Dashboard pages: the `(dashboard)/layout.tsx` server component adds one `findUnique` liveness check and redirects removed users to `/login`.
  Net: a removed admin is cut off within one request, not at the 30-day JWT expiry.
- **Auth-surface audit (Codex R1 — build-time work item):** the three checkpoints above only revoke what flows through them. Before merge, enumerate every `getServerSession`/`getToken`/actor-resolution call site (API routes, layouts, the report access gate, any server actions) and prove each privileged path passes through a liveness-checking helper — one central guard contract, not scattered checks. Add a guard test (an allowlist grep/test over `getServerSession(` call sites) so a future page that bypasses the layout or a new session entry point fails CI, not the offboarding.
- **Re-invite = revive-on-accept (decided):** `POST /api/admin/invite` treats a soft-deleted user as invitable **only when the tombstone is role ADMIN or STAFF** (a soft-deleted COACH-role tombstone must never be silently converted to ADMIN via an invite; today the route hard-rejects any existing User row); `accept-invite` **revives the tombstone in place** — clear `deletedAt`, set the fresh `passwordHash`, `role: "ADMIN"`, update `name` — never creates a second row. One identity per email forever; FK history and audit trail stay attached to the same user id. **Role on revival = the invite's role — always ADMIN today (the only invite type), so reviving a former STAFF tombstone deliberately grants ADMIN: that is the inviting admin's explicit decision, not drift; the audit log records the `role` transition (old → new) to make it visible** (Codex R1). (Full rationale: ADR-0018.)
- **UI (decided: extend the settings card, NOT the WF11 directory):** the `/admin/settings` "Admin Users" card (`invite-admin-section.tsx`) upgrades from listing invite rows to listing **real ADMIN/STAFF users** (name, email, role chip, status) merged with pending invites, each removable via a confirm dialog (blast-radius copy: immediate lockout, history retained, email re-invitable). Removed users drop off the list entirely (no "Removed" rows — revival via re-invite re-lists them); the card's GET endpoint filters `deletedAt: null`. Row conventions borrowed from the WF11 wireframe (`admin/11-admin-users-list.html`); the full platform-wide users directory that WF11 specs explicitly **stays a later wave** — recorded wireframe drift, not silent divergence.

## Out of scope (explicit)

- WF11/WF12 platform-wide users directory + user detail pages (later wave; #7 lands on the settings card).
- Coach-level results-email standing preference (three-layer precedence rejected — can be added later if coaches ask).
- Coach offboarding/session hardening: coach deletion already hard-deletes User rows and coach JWTs also survive 30 days today — pre-existing, untouched by Wave Q (noted for a future hardening tier).
- Any change to send-time results-email logic, template delete semantics, or the AdminInvite issuance flow beyond the soft-deleted-user allowance.

## Edge cases (decided handling)

- Template default ON + approval later revoked (content edited → hash mismatch): wizard derives `false` + disabled checkbox; send gate blocks. Approval always wins.
- Draft saved before Wave Q: rehydration keeps the saved explicit value; no retro-defaulting.
- Disabling a template mid-wizard-session: create-route 409 catches the race; wizard error state re-picks.
- Removing an admin who authored templates/campaigns: FK references keep resolving to the tombstone row (name still renders in "created by" surfaces).
- Removed admin holding a valid JWT: first API call or dashboard navigation after removal → 401/redirect.
- Re-invite before revival accepted: invite row exists (pending), tombstone still locked out — correct.
- `ADMIN_EMAIL` unset in env: `isCanonicalAdminEmail` fails closed (false) — no one is implicitly protected, existing behavior.

## Test plan (subagent TDD)

- `wave-q-flags.test.ts` — lever precedence, call-time reads, default OFF.
- #1: wizard default derivation matrix (flag × approved × default × draft-resume × template-switch); picker payload; admin PATCH write + audit; send-time regression (approval gate unchanged).
- #6: picker filtering both branches (flag on/off); create-route 409; disabled template's existing campaigns/reports/trends unaffected (regression); enable/disable PATCH + audit; badge/action rendering.
- #7: auth-surface guard test (allowlisted `getServerSession` call sites — new bypass fails CI); remove endpoint guards (self, canonical, hybrid-removable, already-removed, STAFF actor 403); transaction (deletedAt + invite row + audit); `authorize()` rejection; `getApiActor()` liveness; layout liveness; revive-on-accept (invite allows tombstone, accept revives in place, second-row never created); enforcement ignores flag state.
- Gate: `CI=true npx next build --turbopack`, ESLint 0 on changed files, full suite zero new failures.

## Launch plan (decided)

Merge dark → same-session launch walk, every prod mutation individually authorized:
1. Preflight (read-only): flag absent, QSP v1 template present + its campaign states.
2. Set `WAVE_Q_ADMIN_CONTROLS_ENABLED=1` on Vercel Production + redeploy.
3. Smoke: template default toggle on a test template; **disable `qsp-v1`** (the one operation we execute for Jeff — he named it; reversible via Enable) and verify picker hiding + existing-campaign integrity; remove-admin drill on a **throwaway invited admin** (controlled inbox), verifying immediate lockout + revive-on-accept. Results-email defaults are otherwise left `false` — Jeff/Suzanne operate those.
4. SoT: CLAUDE.md anchor + CHANGELOG entry + Notion task; report to Jeff (terse Slack: link + bullets).

## Decision log (who decided what, 2026-07-02)

1. Wave target = Wave Q / P3 (user; after the Wave L already-shipped discovery).
2. #7 = soft-remove + live revocation (user).
3. #7 UI = extend admin-settings card, WF11 directory deferred (user).
4. #6 = new `disabledAt` third state (user).
5. #1 override = per-campaign checkbox only (user).
6. Rollout = one WAVE_Q flag, default OFF (user).
7. Re-invite = revive-on-accept (user).
8. #6 kill ⇒ disabled templates reappear (user; **superseded by decision 12**).
9. #7 kill ⇒ enforcement unconditional (user).
10. ADR-0018 yes; launch ops = flip + disable qsp-v1 only (user).
12. Co-validate (Codex, 2026-07-02): #6 enforcement flipped to unconditional under the durable rule "flags gate capabilities/writes, never enforcement of persisted admin intent" (user approved the flip). Also accepted: auth-surface audit + CI guard test; hybrid (coach-profile) admins are removable — whole-account lock; revival role transition documented + audited.
11. Routine calls (assistant, from code/house practice): KILL/ENABLED-only flag; default-while-unapproved stored-but-inert; server-side create enforcement for #6; ADMIN+STAFF removable targets, ADMIN-only actor; AdminInvite row deleted on removal; liveness placement (getApiActor + dashboard layout + authorize).
