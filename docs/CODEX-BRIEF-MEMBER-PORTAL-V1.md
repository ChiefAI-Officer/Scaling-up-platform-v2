# Member portal v1 — build brief

You are implementing this. The design is finished and was produced by a separate investigation
session; your job is to build it, not to redesign it. Where you think the design is wrong, §7 says
what to do.

## 1. Orient yourself, in this order

1. **Watch the recorded call** — Jeff Verdun, 2026-09-15. He demonstrates the incumbent system's
   member portal and states the requirement in his own words. The operator will point you at it.
2. **Read the Slack thread** around 2026-09-15/16 for context on scope.
3. **Then read, in the repo, in this order:**
   - `docs/HANDOFF-MEMBER-PORTAL-V1.md` — the reference handoff
   - `docs/superpowers/specs/2026-09-17-member-portal-v1-design.md` — revision 3, authoritative for rules
   - `docs/superpowers/plans/2026-09-17-member-portal-v1.md` — revision 3, your task list
   - `docs/wireframes-phase2/wave8/27-member-portal-reports.md` — revision 2, authoritative for screens and copy
4. **The artboards**, 13 screens: <https://claude.ai/artifact/4wmRTct1wDpvFuN6z9n8rj>

## 2. ⚠️ When the sources disagree, the recording wins

**This has already bitten once and it will look like a defect to you.**

The entry gate is **a live roster row** — being in the system. Jeff, on the recording at 05:09,
answering "Who gets access to this?":

> "Whoever has an email in the system. So if a coach puts an email into the system, they would get
> access to it. I wouldn't assume people from the public would get it… but anybody that's taking a
> campaign led report that the coach has put them into the system would be able to log in."

You may find written material — Slack, or the scope document's own summary — implying the gate is
**completing an assessment**. The previous session built an entire revision on that reading,
because it worked from a summary of the call rather than the call. It is wrong. Do not restore it.

General rule: **the recording and the code outrank any prose summary, including prose written by
the session that produced this plan.** If a document and the recording disagree, the recording
wins; if a document and the code disagree, check the code.

## 3. Where to stand

```
git fetch origin
git worktree add ../mp-build origin/feat/member-portal-v1-spec -b feat/member-portal-v1
cd ../mp-build/src
```

**Do not work in the primary checkout** — it is dirty on an unrelated branch. **Do not touch any
other worktree**; there are around a hundred and they belong to other threads.

Node 20 (`.nvmrc`). Everything runs from `src/`.

## 4. ⚠️ AGENTS.md will point you at the wrong work

`AGENTS.md` is the first thing you would normally read here, and it says the active track is the
ED editor-simplification pipeline. It says nothing about the member portal. **That file is stale
with respect to this wave.** Its Golden Rules, validation commands and parallel-thread warnings
still apply; its description of what is being worked on does not.

Several agent threads ship to `main` at once. **Claim this wave on pinned issue #261 before
writing code, and re-check immediately before you start.**

## 5. What you are building, in brief

A passwordless portal. A person a coach entered into the system signs in with an emailed link and
sees the reports they are entitled to, plus the assessments they can still complete.

**Entitlement — three fixed rules, no configuration screen:**

| Level (`OrgRespondent.roleType`) | Sees |
|---|---|
| CEO/founder family | every report in **their organization** |
| `teamleader` — a **department head** | their **team and every team beneath it**, minus any CEO-family member |
| everything else, including unrecognised values | **their own reports only** |

Everyone always sees their own. Nobody ever sees above themselves.

**Four properties that are load-bearing:**

- Entitlement is **recomputed per request** inside the loader's transaction, from the live level
  and team. Never stored in the session, never cached client-side, never passed in by a caller.
- **The CEO-family guard.** A department head never sees a CEO's report whatever the team tree
  says. `teamId` records which team a person is *in*, not which team they *lead*.
- **Fail closed.** Unknown level, missing level, `teamleader` with no team → own-only.
- **An email resolves to a set of roster rows**, never one. Entitlement is the union of each row's
  scope.

## 6. Five things that look like bugs and are not

Each of these was a real mistake, found and corrected. You will be tempted by all five.

1. **`normalizeLevel` aliases nothing.** Production contains `CEO` and `TEAM_MEMBER` as level
   values. Neither is mapped; both grant own-reports-only. Mapping `CEO` into the CEO family
   grants the widest scope in the system from a guess about an unexplained string. An earlier
   revision did exactly that and it was reversed.
2. **Evaluations → Continue grants the invitation session directly. It does not mint a token.**
   Minting breaks the Jeff #65 stable-links contract four ways — the token `source` enum has no
   legal value for a portal token, a staged token is live before any send, a flipped kill switch
   would destroy the respondent's real emailed link, and minting overwrites the invitation's
   expiry. Spec §6.5 has the detail.
3. **The member group-report loader does its own authorization.** It does **not** delegate through
   `canViewGroupReport`, which is the coach/admin bulk-PII gate and expects a signed-in actor.
   Passing a null actor yields a permanent `forbidden`; loosening that gate to accommodate the
   portal would be far worse.
4. **Redemption happens only on a POST from an explicit click.** A GET never consumes the token.
   Email scanners open links automatically; without the click they burn single-use links before
   the member arrives. The sign-in path needs **no JavaScript** — the button is a plain form.
5. **`AssessmentSubmission.resultsToken*` is vestigial** — those columns exist with zero
   application code and are submission-scoped. They are not a working single-use mechanism.

## 7. When you disagree

Several decisions here look over-cautious from the inside. They are load-bearing and each was
argued out. **If you believe an authorization rule is wrong, stop and report it rather than
simplifying it.** That applies specifically to: the empty alias map, the superset test on group
reports, the CEO-family guard, click-to-redeem, and per-request entitlement.

Everywhere else — file layout, component structure, test organisation — use your judgement and
follow the repo's conventions.

## 8. Sequencing, and what is safe to build now

The plan defines four releases.

- **Release 1 — sign in and see your own reports.** The whole mechanism, with entitlement wired
  but every member resolving to own-only. **Safe to build now.**
- **Release 2 — the hierarchy.** The CEO and department-head scopes and the group report derived
  from them. ⚠️ **Its scope is not yet confirmed with the client.** He described the hierarchy on
  the call, but the redrawn artboards showing it have not been reviewed by him. Build Release 1
  first and check with the operator before starting Release 2.
- **Release 3 — Evaluations**, including the session handoff.
- **Release 4 — coach-initiated send and the discovery lines.**

If the timeline squeezes, cut Release 3 or 4. Never cut Release 2 and ship Release 1 as though it
were the feature — a CEO in the pilot who signs in and sees only their own report will report it
as broken, because that is the opposite of what was demonstrated.

## 9. Definition of done, per release

- Every task's tests written red first, then green.
- Flag-off byte-identity asserted, not assumed.
- Migration Safety Gate, targeted Jest suites, ESLint on changed files, and
  `CI=true npx next build --turbopack` from `src/` — **Turbopack matters**, plain `next build` can
  pass while Turbopack fails.
- A PR against `main` (branch-protected; required checks are **Build** and **Migration Safety
  Gate**). Never merge while a review loop is still running.
- **The source-of-truth update ships in the same PR as the code** — the `CLAUDE.md`
  `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor plus prose, and a full entry prepended to
  `plans/CHANGELOG.md`. Standalone SoT PRs keep colliding on those two files.
- After merging, **verify the production deployment actually ran** — a green CI Build does not
  mean it did.

## 10. Things that will waste your time if nobody tells you

- **Neon suspends when idle.** The first production query usually fails; retry with a warm-up loop.
- The generated Prisma client is stale — use `$queryRawUnsafe` for ad-hoc reads. Tables are
  snake_case (`org_respondents`); **columns are camelCase and need double quotes** (`"deletedAt"`).
- **All production data is test data.** The operator confirms there are no real customer records.
  22 live members, 10 organizations, 5 teams, 1 of them nested. There is **no real team structure
  to smoke-test against** — the descendant walk is proven by seeded fixtures only.
- **The production Vercel project is under the `scaling-up` team**, not `chief-aio-fficer`.
  Querying the wrong one returns an empty env list and reads as "no flags are set". Write flags via
  the REST API as `type:"encrypted"`, redeploy, then **verify in-app** — a `sensitive`-typed
  variable reads back empty whatever its value.
- `MEMBER_SESSION_SECRET` is new and must be generated and pushed the same way.

## 11. Do not

- Write to the client's production database. Reads are read-only and aggregate.
- Touch the invitation link's `#t=` fragment. It is reusable by design; a scanner opening it costs
  nothing. Do not "harmonise" it with the sign-in link.
- Change `AssessmentCampaignParticipant.isCEO`. That is a separate concept from `roleType` and
  belongs to a deferred item.
- Restore anything listed in §6.
