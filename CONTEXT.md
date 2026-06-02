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

**Domain** (Scaling Up Full only):
One of the five top-level categories a Scaling Up Full question rolls up into: **People, Strategy, Execution, Cash, You**.
_Avoid_: section (a section is a finer grouping within a domain), category, pillar.

### Sending & answering

**Campaign**:
One send of a template version to a chosen subset of a company's members.
_Avoid_: assessment instance, test, run.

**Respondent**:
A person in a company's roster (`OrgRespondent`) who can be invited to answer. Distinct from a **Participant** — the record of a respondent's inclusion in a *specific* campaign (`AssessmentCampaignParticipant`).
_Avoid_: using "participant" and "respondent" interchangeably — a respondent exists in the roster independent of any campaign.

### Results & scoring (three distinct "band"-like concepts — do not conflate)

**Scoring tier** (a.k.a. band):
The overall result band of a *scored* assessment (Rockefeller: Low / OK / Great; Scaling Up Full: Not-ready / On-the-way / Exemplary). Every published version needs ≥1 tier.
_Avoid_: calling per-question advice or invitation progress a "tier".

**Per-question recommendation**:
Advice text attached to an individual Scaling Up Full question, selected by that question's score against fixed stops {0, 3, 5, 7, 10}. Not an overall result.
_Avoid_: recommendation = tier.

**Invitation status band**:
A campaign-progress label for a respondent — new / invited / started / completed (revoked excluded). Purely workflow state; carries no scoring meaning.
_Avoid_: confusing this with a scoring tier.

**ScaleUp Score**:
Scaling Up Full's overall weighted 0–100 score (can exceed 100 via bonus). Its exact weighting formula is owned by Esperto and not in our source export.

**Pass** (Rockefeller):
A checklist item counts as "passed" when rated **2 or 3** on its 0–3 scale (a 0 or 1 does not pass). The Rockefeller result tier is driven by the count of passed items out of 40.

**Non-scored assessment**:
An instrument with no real scoring — Quarterly Session Prep v1 and v2. Responses are aggregated (means) for discussion, not banded. Represented internally by a single neutral tier (see ADR-0002).

## Relationships

- An **Assessment Template** has one or more **Template Versions**; only published versions are selectable by a campaign.
- A **Campaign** pins exactly one **Template Version** and targets many **Respondents** (each via a **Participant** record).
- A scored **Template Version** defines **Scoring Tiers**; a Scaling Up Full version additionally defines **Domains** and per-question **Recommendations**.
- A **Respondent**'s progress in a campaign is an **Invitation status band**; their answers, once submitted, may produce a **Scoring tier** result.

## Example dialogue

> **Dev:** "When a coach reuses Rockefeller next quarter, is it the same template?"
> **Domain expert:** "Same **Template**, but each quarter is a new **Campaign**. If we've revised the questions, the campaign pins a newer **Template Version** — but unchanged questions keep their identity so we can compare scores across quarters."
> **Dev:** "And the green 'completed' label on the campaign screen — that's their score?"
> **Domain expert:** "No, that's the **invitation status band** — it just means they finished. The score is the **scoring tier**, and for Quarterly Session Prep there's no score at all."

## Flagged ambiguities

- "band" was used for three different things — resolved into **scoring tier**, **per-question recommendation**, and **invitation status band** (distinct concepts).
- "participant" vs "respondent" — resolved: a **Respondent** is a roster person; a **Participant** is that person's inclusion in one campaign.
- "section" vs "domain" (Scaling Up Full) — resolved: a **Domain** is one of the five top categories; sections are finer groupings within.
