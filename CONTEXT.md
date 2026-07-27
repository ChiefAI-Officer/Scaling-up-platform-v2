# Scaling Up Platform — Assessment Domain

The assessment module lets coaches send Scaling Up diagnostic instruments (Rockefeller Habits, Quarterly Session Prep, Leadership Vision Alignment, Scaling Up Full) to a company's leadership team, collect responses, and (where the instrument is scored) produce a result. It is the in-house replacement for the Esperto "Scaling Up Toolkit."

## Language

### Instruments & structure

**Assessment Template**:
A named diagnostic instrument (e.g. "Rockefeller Habits Checklist"). Holds metadata; its content lives in versions.
_Avoid_: quiz, survey, questionnaire (the public route is `/quiz/...` and the legacy survey tool is separate — neither is the canonical term here).

**Template Version**:
An immutable-once-published snapshot of a template's questions + sections + scoringConfig. A campaign pins exactly one version; editing published content requires a *new* version.
_Avoid_: revision, draft (a draft is just a version with `publishedAt = null`).

**Active version** (a.k.a. live version):
Among a template's published versions, the **latest** one — the version a *new* **Campaign** automatically pins. Older published versions stay published only to keep serving the campaigns already sent with them. There is exactly one Active version per template+language, and correction is **forward-only**: publish a newer version to supersede — never resurrect an older one (that would break longitudinal comparability, see ADR-0016).
_Avoid_: treating every "Published" version as interchangeable — only the Active (latest published) version goes out on new sends.

**Disabled template** (Wave Q, Jeff July-1 #6):
A template an admin has retired from *new* use (e.g. QSP V1 after V2 shipped): it no longer appears when anyone — coach or admin — sets up a new **Campaign**, but it stays fully alive everywhere else (existing campaigns, reports, trends, re-seeds, the admin templates list, where it carries a Disabled badge and can be re-enabled). A **third lifecycle state**, distinct from soft-delete (`deletedAt`), which hides the template everywhere and is blocked while active campaigns exist.
_Avoid_: "deleted", "archived" (delete already means something stronger here); assuming disable affects running campaigns — it never does.

**Results-email default** (Wave Q, Jeff July-1 #1):
A template-level default for the per-campaign "send results to respondents" toggle. The campaign wizard checkbox *starts* at the chosen template's default; the coach's per-campaign flip **is** the override (no coach-level standing preference exists). The default is storable at any time but **inert until the template's results-email content is approved** — the approval hash-gate always wins, at wizard time and at send time.

**Inherited question** (Wave T, Jeff July-1 #10):
Within a DRAFT **Template Version**, a question whose `stableKey` appears in **any published version** of the same template. Inherited questions have their `stableKey` and type locked in the editor (and, for MULTI_CHOICE, their option *keys* — option labels stay editable); changing what an inherited question *means* is a new question with a new key (ADR-0001). Deleting one is allowed but warns about downstream impact (trends, locked crosswalks, peer benchmarks). The opposite is a **new-to-draft question**: added in the current draft, never published — its type is freely switchable and its key is derived from its label at first save, then immutable.
_Avoid_: "existing question" (ambiguous — existing in the draft vs existing in a published version).

**Test Mode** (Wave ED1, assessment-editor overhaul):
An authoring aid on the **Template Version** editor. While editing a *draft*, an admin enters sample answers and immediately sees the computed result — per-section/domain scores, the overall **Scoring tier** (when the instrument shows one), and which **findings rules** fire — to validate the instrument's *outputs* before publishing. It is a sandbox: it **records nothing** (no **Respondent**, no submission, no email), and its display of tier/score-table follows the same per-instrument config the real **Results report** uses, so the two can't diverge.
_Avoid_: conflating with the **Preview tab** (Wave ED10) — Test Mode validates *outputs* (scores/findings, interactively), the Preview tab shows the read-only survey-taking *experience*; "submission" (a Test Mode run is never persisted).

**Safe-to-Publish** (Wave ED2, assessment-editor overhaul):
A live publish-readiness readout on the **Template Version** editor. While editing a *draft*, the author sees — before clicking Publish — a **Prevent** list (the exact issues that would block publish, mirroring the *same* publish validation the server runs) and a short advisory **Warn** list (authoring-quality nudges that do **not** block publish: an empty section, an unassigned question, or a template with no **findings rules** authored). It is **passive**: the server's publish check stays the authoritative gate, and it records nothing.
_Avoid_: conflating **Warn** with **Prevent** (warnings never block publish); "linter" or any wording implying a *new* gate — Safe-to-Publish only surfaces the existing publish gate earlier, it never adds one.

**Preview tab** (Wave ED10, assessment-editor overhaul):
The template editor's landing tab (replaces the old **Metadata** tab). Renders a published or draft **Template Version** **read-only, exactly as a Respondent sees it** — the branded **Section pager** — with a facts summary above it (Active vN, publish date, access, aggregation, language, question/section counts). Nothing is interactive and nothing is recorded. Complements **Test Mode**: Preview = the survey-taking *experience*, Test Mode = the scored *outputs*.
_Avoid_: "test" / "sandbox" (the Preview tab never takes answers — that's Test Mode); "the Metadata tab" (Metadata is retired; its settings moved to the **Settings tab**).

**Settings tab** (Wave ED10, assessment-editor overhaul):
The template editor's single home for everything that isn't a question: who can take it (**access**), who sees individual answers (**aggregation**), **language**, the **Invitation email** and **Results email** (with the results-email approval and the **Results-email default**), a link out to **Access groups**, and the read-only **alias**. Replaces the old **Metadata** tab's field wall and absorbs the standalone Access nav link. Plain-language presentation of existing fields — nothing here is a new field.
_Avoid_: "Metadata tab" (retired); putting question/section editing here (that lives in the **Build** tab).

**Domain** (Scaling Up Full only):
One of the five top-level categories a Scaling Up Full question rolls up into: **People, Strategy, Execution, Cash, You**.
_Avoid_: section (a section is a finer grouping within a domain), category, pillar.

**Four Decisions colors** (brand mapping):
The participant UI tints each section by its **Domain** using the Scaling Up brand's Four Decisions palette: **People = orange `#f7a600`, Strategy = blue `#008bd2`, Execution = brown `#946b36`, Cash = green `#95c11f`**. The fifth domain, **You**, has no Four Decisions color and uses the brand primary **purple `#522583`**. Templates without domains (Rockefeller, Quarterly Session Prep, LVA) use a neutral purple accent for every section. This mapping is brand-canonical — do not invent other section colors.

### Sending & answering

**Campaign**:
One send of a template version to a chosen subset of a company's members.
_Avoid_: assessment instance, test, run.

**Public Campaign**:
A **Campaign** with `accessMode = PUBLIC` — anyone with the link self-enrolls and answers via `/quiz/[alias]` (no invitation, no roster membership required). Admin/STAFF-only to create; it still belongs to a chosen **Organization** (`organizationId` is non-nullable). The admin nav entry and its management page are labelled **"Public Campaigns"** and live at `/admin/assessments/public-campaigns`.
_Avoid_: "Public Quiz" / "Public Quizzes" as a label (the glossary avoids "quiz" — the `/quiz/...` URL is not the domain term); conflating it with the INVITED flow (roster + emailed invitations).

**Respondent**:
A person in a company's roster (`OrgRespondent`) who can be invited to answer. Distinct from a **Participant** — the record of a respondent's inclusion in a *specific* campaign (`AssessmentCampaignParticipant`).
_Avoid_: using "participant" and "respondent" interchangeably — a respondent exists in the roster independent of any campaign.

**Section intro slide**:
A non-question screen shown before a section's questions, rendering that section's own `name` (heading) and `description` (body) with a "Start" affordance. It is **not** a separate entity or a question — it is a presentation of the section's existing fields. A section with no `description` simply has no intro copy to show.
_Avoid_: "title slide" as a distinct object, or a `SECTION_INTRO` question type (see ADR-0004).

**Section pager** (one-section-at-a-time):
The way a respondent answers an assessment: **exactly one section per screen** (optionally preceded by that section's **intro slide**), with Back/Next navigation, a "Section N of M" label, and a progress bar by questions answered — replacing the legacy single long-scroll form. Both the public (`/quiz/[campaignAlias]`) and invited (`/org-survey/[campaignAlias]`) experiences use it. (`/me` is the invited flow's data API endpoint, not its page route.)
_Avoid_: "page" (a section is not a route), "step" for the intro slide (the intro slide is a sub-view of a section, not a counted step).

**Custom slide** (campaign-authored):
A coach-authored, branded interstitial screen woven into a campaign's **Section pager** — a non-question page (sanitized HTML body, optional title) placed at the **start**, **before a chosen section**, or at the **end** (the last page before submit). It is **campaign-scoped** (stored on the Campaign, not the Template Version) and holds no answers, so it is **never counted** in "Section N of M". Where a **Section intro slide** renders a section's own fields, a Custom slide is free promo/instructional content the coach writes (Esperto's "Verne slide").
_Avoid_: confusing a Custom slide (campaign-level, coach-authored, sanitized HTML) with a **Section intro slide** (template-level, the section's own `description`); "post-submit slide" — a closing slide is the last page *before* submission, there is no after-submit slide.

**Welcome screen**:
The first screen a **Respondent** sees for a **Campaign** — before any question and before the **Section pager** begins: the campaign title, the **welcome lede** (the introductory paragraph — or two — under the title), a what-to-expect summary, and a "Start the assessment" affordance. It belongs to the campaign, not to a section, so it is **never counted** in "Section N of M". Both participant flows render it with flow-specific lede copy: on the invited flow (`/org-survey/[campaignAlias]`) the lede is **per template** and **code-owned** — one or two paragraphs chosen by the template, identical for every campaign of that template, deliberately retroactive to campaigns already sent, and changed by shipping rather than by authoring (ADR-0026); on the public flow (`/quiz/[campaignAlias]`) it is **campaign-authored**, with a standing default when the author leaves it blank. A template with no bespoke lede shows the shared default.
_Avoid_: "**Section intro slide**" or "intro slide" for this screen — an intro slide sits *inside* the pager and renders that section's own `name` and `description`, whereas the Welcome screen precedes all sections and carries campaign-level copy (the code names this phase `kind: "intro"`, which is precisely why the spoken term must be "Welcome screen"); confusing it with a **Custom slide**, which *can* be placed at the **start** but starts *after* the Welcome screen, woven into the pager; "intro card" / "landing card" as the canonical name — that is Jeff's tracker wording (July-10 #62/#66/#70/#77) for this same screen, translate it to **Welcome screen** / **welcome lede**.

### Historical import (Esperto)

**Historical import** (a.k.a. **Esperto import**):
Bringing a company's pre-existing Esperto ("Scaling Up Toolkit") assessment data into the platform so coaches see past results alongside new ones. It runs in two phases: a **Roster import** (the people) followed by a **Results import** (their past answers + result). It is **coach-operated** (scoped to the coach's own companies) and staging-first — a parsed preview is always reviewed before anything is committed. *(Was admin-operated; moved coach-side 2026-07-01. The one delicate step — the **crosswalk** — is made safe by guardrails, not by role-gating; see the roadmap P3 + ADR.)*
_Avoid_: "migration" (that means a database schema change here), "sync" (it is a one-directional, point-in-time load, not an ongoing two-way sync).

**Roster import** (Historical import, phase 1):
Loading a company + its members from an Esperto Members export into one **Organization** with its **Respondents**. The Esperto member id is retained on each Respondent as the cross-phase join key. Carries no past answers — it only populates who exists.

**Results import** (Historical import, phase 2):
Loading a company's past Esperto responses for one assessment into an **Imported campaign**, attaching each person's answers via that template's **crosswalk**. Requires the **Roster import** to have run first (it resolves people by their Esperto member id).

**Imported campaign**:
A **Campaign** reconstructed from Esperto history rather than sent fresh from the platform. It is born **CLOSED** and back-dated to the original Esperto response dates, and — because the people already answered in Esperto — **no invitation is ever emailed**. It is identified by its originating Esperto campaign id.
_Avoid_: treating an Imported campaign as live — it never sends mail, never accepts new responses, and exists only to display historical results.

**Crosswalk** (import):
The hand-authored, per-template map from Esperto's question codes (e.g. `Q3_1`, `Q12_10`) to our **stableKeys**, used by a **Results import** to attach historical answers to the right questions. Because Esperto exports carry no question text, a template's crosswalk must be reviewed and locked (against a rendered Esperto report or the survey screenshots) before that template's Results import is enabled.
_Avoid_: assuming Esperto's codes equal our stableKeys — they never do; the crosswalk is the bridge.

### Results & scoring (three distinct "band"-like concepts — do not conflate)

**Scoring tier** (a.k.a. band):
The overall result band of a *scored* assessment (Rockefeller: Low / OK / Great; Scaling Up Full: Not-ready / On-the-way / Exemplary). Every published version needs ≥1 tier. **Note:** Scaling Up Full's tier is computed and stored in `ScoreResult` but **render-suppressed** — its reports show peer-deviation instead of a band (ADR-0015); the tier is hidden, not removed.
_Avoid_: calling per-question advice or invitation progress a "tier".

**Per-question recommendation** (a.k.a. **findings rule** — Jeff July-1 #11, Wave U):
Advice text attached to an individual question, selected by that respondent's own answer. The rule shape is discriminated by the question's type (ADR-0021): SLIDER/NUMBER carry **bands** (`minScore`–`maxScore` → text; sliders must tile their scale at publish, NUMBER bands may leave gaps), MULTI_CHOICE carries **per-option** texts (each selected option with a rule contributes its finding), TEXT carries none. Findings are resolved and **frozen at submission-scoring time** (`result.findings`, ADR-0021) — a report's findings never change after the fact. Originated as Scaling Up Full's Esperto-verbatim bands at fixed stops {0, 3, 5, 7, 10}; Wave U makes rules authorable in the template editor on any template and renders them in the individual report only (scored: the existing "What to work on next" block; qualitative: a new findings section) — never in group reports or the results email. Rule *text* is reword-class (editable on inherited questions); rules reach reports only via a newly published version.
_Avoid_: recommendation = tier; "findings" = survey branching (that is conditional/show-if logic, an input-side concept — findings are output-side).

**Invitation status band**:
A campaign-progress label for a respondent — new / invited / started / completed (revoked excluded). Purely workflow state; carries no scoring meaning.
_Avoid_: confusing this with a scoring tier.

**ScaleUp Score**:
Scaling Up Full's overall weighted 0–100 score (can exceed 100 via bonus). Its exact weighting formula is owned by Esperto and not in our source export.

**Peers (benchmark)**:
The industry-average reference values shown alongside an assessment score — "companies with a comparable size who have preceded you in taking the assessment." A respondent's standing is expressed as **deviation from Peers** (▲/▼), *not* a tier band (Esperto has no bands, and we lack the peer distribution to compute its "X% score higher" percentile — see ADR-0015). Two sources exist: **SU-Full** Peers are seeded PROVISIONAL from a single Esperto sample cohort (static file, 0–10 scale); **LVA** Peers (Wave S) are **admin-set per rating question** in DB rows — there is no Esperto LVA peer dataset, so values exist only once an admin enters them (reports omit-empty until then; ADR-0019).
_Avoid_: "percentile" (we show direction vs the peer mean, not a percentile); conflating Peers (external benchmark) with **Team avg** (this campaign's other leaders).

**Pass** (Rockefeller):
A checklist item counts as "passed" when rated **2 or 3** on its 0–3 scale (a 0 or 1 does not pass). The Rockefeller result tier is driven by the count of passed items out of 40.

**Non-scored assessment**:
An instrument with no real scoring — Quarterly Session Prep v1 and v2. Responses are aggregated (means) for discussion, not banded. Represented internally by a single neutral tier (see ADR-0002).

**Results report** (a.k.a. "the report", "the PDF"):
The branded, printable **per-respondent** document a coach/admin views for *one* completed submission — cover, overall result, per-section breakdown, scores table, recommendations (when present), conclusion. It is the human-readable view that **replaces the raw answer (`stableKey`) view**. It is per individual.
_Avoid_: conflating the per-respondent **Results report** with a cohort **Aggregate report** (Esperto's "group" / "self-comparison" report — the facilitator's all-responses dashboard; shipped for LVA in Wave F).

**Cohort trend** (a.k.a. longitudinal trend):
The coach-facing view that charts an **Organization**'s *aggregate* results for one scored **Template** across its successive **Campaigns** over time (per-campaign means + per-question sparklines). It answers "is this whole team improving each quarter?" — every person is invisible inside the average. (Already shipped at `/portal/assessments/trends`.)

**Per-respondent longitudinal comparison** (a.k.a. comparison report):
The coach-facing view that tracks **one Respondent**'s results across the successive **Campaigns** they completed for the same scored **Template** — overall score, per-section deltas, and tier movement over time. It is the single-person counterpart to the **Cohort trend**. **Scored templates only** (LVA / QSP have no trendable metric — ADR-0016); deltas are computed only between submissions on the same **Template Version** (cross-version values are shown, but not deltaed). Authorized exactly like the Cohort trend (`canAccessOrganization`).
_Avoid_: conflating it with the **Cohort trend** (aggregate, everyone at once) or the per-campaign **Aggregate report** (one campaign's whole cohort side by side) — this is *one person across campaigns*.

### Viewing reports

**Report access gate**:
The single server-side envelope every report-viewing route passes through before a report renders. It owns the *cross-cutting* protocol — actor resolution, the rate-limit guard (fail-closed to an enumeration-safe 404 when exceeded, but tolerant of a rate-limiter *outage*), the fail-closed audit write (with IP/UA + report provenance), no-store, and structured view metrics — and it wraps a report *loader*. The **loader** owns the domain authorization (`canManageCampaign` / `canViewGroupReport`) and returns the discriminated outcome (forbidden / notApplicable / empty / ok); the gate writes the audit + emits metrics on `ok` and hands the outcome back to the page, which renders each case. Two adapters today: the per-respondent **Results report** and the cohort **Aggregate report**.
_Avoid_: "middleware" (the real `no-store` response header is set in Next middleware — a separate layer), "auth guard" (authorization lives in the loader, not the gate — the gate never decides who may see what).

### Platform access

**Admin removal** (Wave Q, Jeff July-1 #7):
Offboarding an ADMIN/STAFF user who left the company. Always a **soft** removal (`User.deletedAt`) — historical `createdBy` references keep pointing at the tombstone — plus deletion of their `AdminInvite` row. Removal is enforced at login *and* by a per-request liveness check on privileged sessions (a removed admin is cut off in minutes, not at JWT expiry), and that enforcement is **deliberately not kill-switchable** — a killed Wave Q flag stops further removals but never re-admits the removed. A removed email is re-invitable: accepting a fresh invite **revives the same User row in place** (one identity per email, forever), never a second row.
_Avoid_: "delete admin" implying a hard row delete (FKs forbid it); assuming a kill switch restores access.

## Relationships

- An **Assessment Template** has one or more **Template Versions**; only published versions are selectable by a campaign.
- A **Campaign** pins exactly one **Template Version** and targets many **Respondents** (each via a **Participant** record).
- The **Invitation email copy** (subject + body) lives on the **Template** itself — read live at send time by every send path, so editing it immediately affects future sends of in-flight campaigns. It is *not* pinned by a Template Version; only a per-campaign override shields a campaign from template-level copy edits.
- A scored **Template Version** defines **Scoring Tiers**; a Scaling Up Full version additionally defines **Domains** and per-question **Recommendations**.
- A **Respondent**'s progress in a campaign is an **Invitation status band**; their answers, once submitted, may produce a **Scoring tier** result.
- A **Results report** (per-respondent) and an **Aggregate report** (cohort) are both viewed through the **Report access gate**, which wraps each one's **loader**.
- A **Cohort trend** aggregates one scored **Template**'s results across an **Organization**'s **Campaigns** over time; a **Per-respondent longitudinal comparison** does the same for a single **Respondent** (scored templates only — ADR-0016).
- A **Campaign** may carry coach-authored **Custom slides** that its **Section pager** weaves in as non-question pages.

## Example dialogue

> **Dev:** "When a coach reuses Rockefeller next quarter, is it the same template?"
> **Domain expert:** "Same **Template**, but each quarter is a new **Campaign**. If we've revised the questions, the campaign pins a newer **Template Version** — but unchanged questions keep their identity so we can compare scores across quarters."
> **Dev:** "And the green 'completed' label on the campaign screen — that's their score?"
> **Domain expert:** "No, that's the **invitation status band** — it just means they finished. The score is the **scoring tier**, and for Quarterly Session Prep there's no score at all."

## Flagged ambiguities

- "band" was used for three different things — resolved into **scoring tier**, **per-question recommendation**, and **invitation status band** (distinct concepts).
- "participant" vs "respondent" — resolved: a **Respondent** is a roster person; a **Participant** is that person's inclusion in one campaign.
- "section" vs "domain" (Scaling Up Full) — resolved: a **Domain** is one of the five top categories; sections are finer groupings within.
