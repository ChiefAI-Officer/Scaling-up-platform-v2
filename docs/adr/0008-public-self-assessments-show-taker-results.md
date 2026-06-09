# ADR-0008 — Public self-assessments show the taker their own results

**Status:** Accepted (planned — applies when the public Scaling Up Quick Assessment, Spec 15, is built). Not yet implemented.

## Context
The platform's invited-assessment flow **deliberately does not show respondents their own results** — results are delivered by the coach/facilitator, and auto-emailing results to respondents was explicitly deferred (the MVP "D3" policy; the public thank-you page says *"your facilitator will follow up with the results"*). The branded results report is **coach/admin-gated** (`getRespondentReport` requires `canManageCampaign`).

The **Scaling Up Quick Assessment** (Spec 15) is a different beast: a **public, free, self-assessment lead magnet**. The taker's entire incentive to complete it is seeing **their own 4-Decisions scores** immediately, and the source tool (scalinguptoolkit.com/s/ScaleUpQA) shows results to the taker on the spot. Applying the invited policy (bare thank-you, coach follows up) would gut the tool's purpose.

## Decision
For **PUBLIC self-assessments only**, show the taker **their own results immediately**:
- The submit POST returns the taker's `ScoreResult` in its response; the client renders the per-category (4 Decisions) results + insight **in-place**.
- **No persistent public results endpoint / URL / token** — results are shown once, from the submit response, so there is nothing to enumerate or leak.
- **INVITED campaigns are unchanged** — they keep the coach-delivered, gated-results policy. The divergence is explicit: PUBLIC = self-serve results to the taker; INVITED = coach-gated.
- The submit response carrying `ScoreResult` must be served **`Cache-Control: no-store`** (it contains the taker's PII + scores) and the result return is **audited** (claudex R2) — see Spec 15 §5c.

## Consequences
- **+** Restores the lead-magnet value (the taker gets immediate value; the reason the tool "gets a lot of use").
- **+** Privacy-safe: the taker only ever sees their own answers/score, returned to the same client that submitted them — no GET-by-id results surface to secure.
- **−** A deliberate, permanent fork in behaviour between PUBLIC and INVITED flows that must stay clear in code + UX (a future reader will wonder why public takers see results when invited ones don't — this ADR is the answer).
- **−** New work vs the shipped MVP: a respondent-facing results render (the MVP intentionally shipped none).
- Coach/SU lead routing is handled separately (guarded email on submit; see Spec 15) and is independent of this taker-facing decision.
