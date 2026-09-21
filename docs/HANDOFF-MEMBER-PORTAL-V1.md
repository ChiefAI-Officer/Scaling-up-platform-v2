# Handoff — Member portal v1: designed, gated, ready to build

**Created:** 2026-09-19
**Repo:** `ChiefAI-Officer/Scaling-up-platform-v2`
**Branch:** `feat/member-portal-v1-spec`, based on `origin/main` @ `66db8ae9`
**From:** the session that watched Jeff's 2026-09-15 recording, measured production, ran the
design grill, and produced everything listed in §2.
**To:** the environment that will implement it.

> ⚠️ **Do not write feature code until the operator says so.** This is a gated wave: the repo's
> own rule (AGENTS.md → Golden Rules) requires grill + explicit approval, and approval has not
> been given. The grill is done; the approval is not. §8 lists what is still outstanding.

---

## 0. What this is

A passwordless portal where a person a coach has entered into the system signs in with an emailed
link and sees the reports they are entitled to see, plus the assessments they can still complete.

Jeff called it *"the third screen"* — after the admin interface and the coach interface — and
*"the biggest one"* of the gaps he found in our platform against the incumbent.

**Timeline he gave, unprompted, on 2026-09-15 (07:31):** a pilot with a handful of coaches
**mid-October**, live **October/November**. Treat that as the real constraint.

## 1. Read these first, in this order

1. **[`superpowers/specs/2026-09-17-member-portal-v1-design.md`](superpowers/specs/2026-09-17-member-portal-v1-design.md)** — revision 3, authoritative for rules.
   §1.1 (the entitlement rules) and §6 (identity, eligibility, entitlement) are the heart of it.
2. **[`superpowers/plans/2026-09-17-member-portal-v1.md`](superpowers/plans/2026-09-17-member-portal-v1.md)** — revision 3, task-by-task, red→green.
3. **[`wireframes-phase2/wave8/27-member-portal-reports.md`](wireframes-phase2/wave8/27-member-portal-reports.md)** — revision 2, authoritative for screens and copy.
4. The artboards — <https://claude.ai/artifact/4wmRTct1wDpvFuN6z9n8rj> (13 screens).
5. **[`research/2026-09-17-email-link-rewriting-and-url-fragments.md`](research/2026-09-17-email-link-rewriting-and-url-fragments.md)** — why the token sits where it does.
6. **[`MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md`](MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md)** — Jeff-facing scope, plus an appendix
   recording the incumbent system in detail. ⚠️ **Its Delta 1 and its "no concept of level" claim
   are superseded** by the design spec; the rest stands.

Everything below is orientation. It is not a substitute for reading those.

## 2. What exists

| Artifact | Location | State |
|---|---|---|
| Design spec | `docs/superpowers/specs/2026-09-17-member-portal-v1-design.md` | revision 3, committed |
| Implementation plan | `docs/superpowers/plans/2026-09-17-member-portal-v1.md` | revision 3, committed |
| Wireframe (screens + copy) | `docs/wireframes-phase2/wave8/27-member-portal-reports.md` | revision 2, committed |
| Scope + deltas (Jeff-facing) | `docs/MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md` | committed, partly superseded |
| Link-security research | `docs/research/2026-09-17-email-link-rewriting-and-url-fragments.md` | committed |
| Artboards, 13 screens | <https://claude.ai/artifact/4wmRTct1wDpvFuN6z9n8rj> | published |
| Canvas working files | `/private/tmp/su-canvas/` | volatile — the published page also holds every artboard source, so it is recoverable from there |

**No feature code exists.** Nothing has been built.

## 3. The rules, in one page

A **member** is a person on a company's roster (`OrgRespondent`) — the people a coach sees at
`/portal/members`.

**Entry gate: a live roster row.** Not completion. Jeff, 05:09: *"Whoever has an email in the
system. So if a coach puts an email into the system, they would get access to it."* Public quiz
takers have no roster row and are excluded by construction.

**Entitlement — three fixed rules, no configuration screen:**

| Level (`OrgRespondent.roleType`) | Sees |
|---|---|
| CEO/founder family | every report in **their organization** |
| `teamleader` (= **department head**) | their **team and every team beneath it**, minus any CEO-family member |
| everything else, including unrecognised | **their own reports only** |

Everyone always sees their own. Nobody ever sees above themselves.

**Four properties that are load-bearing, and are the things to attack in review:**

- **Entitlement is recomputed per request**, inside the loader's transaction, from the live level
  and team. Never stored in the session, never cached client-side, never passed in by a caller.
- **The CEO-family guard.** A department head never sees a CEO's report *whatever the team tree
  says*. `teamId` records which team a person is **in**, not which team they **lead**, and those
  diverge the moment a coach models the leadership team as its own team — which is exactly the
  shape already in the data (`ABC Corp → Engineering → Exec Team`).
- **Fail closed, always.** Unknown level, missing level, `teamleader` with no team → own-only.
- **An email resolves to a set of rows, never one row**, and entitlement is the union of each
  row's scope. One person can be a CEO at one company and an employee at another.

**The group report is safe only because of the superset test.** It is *not* anonymous — it names
respondents, prints verbatim free text, carries the CEO's own column, and has no small-n
suppression. A member may open one only when entitled to **every completed respondent in it**.

## 4. Decisions settled — do not reopen without new evidence

Each was contested and resolved against evidence. §19 of the spec carries the full list with
section references; these are the ones most likely to be second-guessed.

| Decision | Settled as | What settled it |
|---|---|---|
| Entry gate | A live roster row | Jeff, on the recording |
| Access model | Three fixed rules, not Esperto's configurable matrix | Jeff described a behaviour, never a screen |
| Token location | **Query string**, not the URL fragment | A fragment hides nothing from a scanner that reads the email; at least one rewriter (Cisco) folds it into its wrapper, sending our secret to a third party's logs; no auth vendor uses a fragment |
| Token lifetime | **1 hour** self-service, **24 hours** coach-sent | Every vendor surveyed uses minutes to an hour; 14 days was inherited from Esperto unexamined |
| Redemption | Only on a **POST from an explicit click**. A GET never consumes | Scanners open links automatically; WorkOS retired their magic-link product over this |
| Legacy levels | `CEO` and `TEAM_MEMBER` are **not aliased** — both grant own-only | Granting the widest scope in the system from a guess about an unexplained string fails in the direction we cannot recover from |
| Evaluations → Continue | **Grants the invitation session directly.** Mints nothing | Minting breaks the Jeff #65 stable-links contract four ways — see spec §6.5 |
| Organization | One **coach's engagement** with a company, not the company | Operator, 2026-09-18 |
| `teamleader` | Means **department head** | Operator, 2026-09-18 |
| Report cards | Typographic instrument treatment, not artwork | No instrument imagery exists in the product |
| Naming | **"Group report"** on both surfaces | Esperto says *summary report*, which collides with our own Summary Reporting feature |
| Bulk import | **Deferred** | Operator: it exists but its plumbing is not trusted |

## 5. Corrections already made — do not re-introduce

1. **The entry gate is not completion.** An earlier revision required a completed assessment,
   drawn from a written summary rather than the call. Every trace of it is gone from the
   documents; if you find one, it is a bug.
2. **We are not short of a "level" concept.** `lib/assessments/respondent-levels.ts` already holds
   the six Esperto-aligned levels with `isCEOFamily()`, `/portal/members` shows a Level column,
   and `OrgTeam.parentTeamId` nests. What is missing is that **none of it drives any access
   decision today** — `isCEOFamily` has exactly one caller, suggesting a CEO in the campaign
   wizard. This is wiring existing data into a new rule, not inventing a concept.
3. **`AssessmentSubmission.resultsToken*` is vestigial.** Those columns exist in the schema with
   **zero application code**. They are not a working single-use mechanism and they are
   submission-scoped. Do not build on them.
4. **The member group-report loader must not delegate through `canViewGroupReport`.** That is the
   coach/admin bulk-PII gate and expects a signed-in `ApiActor`. Passing a null actor gets a
   permanent `forbidden`; loosening the gate to accommodate the portal would be much worse.
5. **The sign-in path needs no JavaScript.** An earlier revision said it did; that was inherited
   from the fragment design.

## 6. Production numbers

Measured read-only 2026-09-18. ⚠️ **All production data is test data** — the operator confirms
there are no real customer records, so these describe the fixtures, not customer behaviour.
Re-measure before any launch claim.

- **22 live members** across **10 live organizations**
- Levels: `teamleader` 7 · *(unset)* 5 · `ceofounderwithteam` 3 · `TEAM_MEMBER` 2 · `ceofounder` 2
  · `ceofounderalone` 1 · `employee` 1 · `CEO` 1
- Only **8 of 22** attached to a team — including just **3 of the 7** `teamleader` rows
- **5 teams** across 3 organizations; **1 nested**; max depth 2; named `Engineering`, `Exec Team`,
  `Test`, `TEST DELETE ME 2026-05-28 sub-team`
- **6 organizations** have a CEO-family member; **none has more than one**; largest CEO scope
  6 people
- 101 submissions with a roster row, **36 on live campaigns**

**The one that should shape your testing:** there is no real team structure to smoke-test
against. Correctness of the descendant walk is proven by seeded fixtures only. The first genuine
org charts arrive with the pilot.

## 7. Method notes that will save you time

**Production reads.** `DATABASE_URL` in `src/.env` is production Neon and it **suspends when
idle** — the first query often fails; retry with a warm-up loop. The generated Prisma client is
stale, so use `$queryRawUnsafe`. Tables are snake_case (`org_respondents`); **columns are
camelCase and need double quotes** (`"deletedAt"`). Scripts must sit inside `src/` for
`@prisma/client` to resolve. Emit aggregates only.

**The build gate.** From `src/`: Migration Safety Gate, targeted Jest suites, ESLint on changed
files, and `CI=true npx next build --turbopack`. **Turbopack matters** — plain `next build` can
pass while Turbopack fails.

**After a merge, check the deployment actually ran.** A green CI Build does not mean the
production deploy happened; see the Known Quirks bullet in `CLAUDE.md` about Vercel failing to
fetch git information and silently leaving the previous commit serving.

**Production flags.** The prod project is under the **`scaling-up`** team
(`prj_xcAWuAmGZAU3DCHgAauRv2WPKneo`), not `chief-aio-fficer` — querying the wrong one returns an
empty env list and reads as "no flags are set". Write via the REST API as `type:"encrypted"`,
never piped `vercel env add`, then redeploy, then **verify in-app**: a `sensitive`-typed var reads
back empty whatever its value.

**Several agent threads ship to `main` at once.** Claim the wave on pinned issue #261 before
writing code and re-check right before you start. Put the source-of-truth update in the same PR
as the code — standalone SoT PRs keep colliding.

**The incumbent system.** `https://www.scalinguptoolkit.com` — an Angular SPA over a PHP/Slim API.
The operator holds admin credentials; **ask, they are not in this document.** Highest-yield trick:
`GET /api/v1/i18n/messages/{member|admin|login}/en` returns each app's complete UI string table
with no session. Keep every interaction read-only.

## 8. Still outstanding

**Blocking the build**
- **Explicit approval from the operator.** The gated-wave rule.
- **Jeff seeing the artboards.** They were redrawn 2026-09-18 for a scope he has not reviewed.

**Needs Jeff, not blocking**
- The four other items he raised on the same call: timezone handling on campaign close dates
  (an Australian campaign closed 12 hours early), extending a campaign's close date
  (campaign-wide — he explicitly rejected per-person), multiple CEOs, multi-language
  (*"bottom of the pile"*). Spec §16.1.

**Known limitation, accepted**
- A department head recorded in a shared leadership-team node sees their peers. The CEO-family
  guard stops it reaching upward; nothing stops it reaching sideways. Closing it needs a
  "team I lead" field distinct from "team I am in".

**Deferred, recorded so they are not logged later as defects**
- Pruning redeemed/expired sign-in tokens; sign-in email delivery is not under the at-least-once
  outbox (ADR-0030); no alerting beyond human-read `vercel logs`; bulk member import.

## 9. Sensitive data

No credentials, tokens, connection strings, respondent names or email addresses appear in this
document or in any of the documents it points at. Production figures are aggregate counts.
Esperto credentials are held by the operator and were used read-only. The artboards use invented
people (`John Adams`, `john.adams@northwind.com`) against real assessment names.
