# Historical Esperto imports are reconstructed as first-class CLOSED campaigns with synthetic inert invitations — not an archive table or submissions-only model

When the historical-data importer brings a company's past Esperto assessment into the platform, it reconstructs the **full live entity chain** for each respondent — an `AssessmentCampaign` (born `CLOSED`, back-dated), an `AssessmentCampaignParticipant`, an `AssessmentInvitation` (status `SUBMITTED`), and an `AssessmentSubmission` — exactly as if the campaign had been sent and answered through the platform. The invitations carry a real-but-random `tokenHash` and are **never emailed**; they exist only to satisfy the schema and to make imported campaigns render identically to native ones.

## Context

A historical import must show a coach their company's past results inside the same screens that show new results (CampaignDetail's participant table, the `new/invited/started/completed` status metrics, the Team column, per-respondent result views). Those screens read from `AssessmentCampaignParticipant` and `AssessmentInvitation.status` — a bare `AssessmentSubmission` would render a campaign with results but no participants and no "completed" counts. Esperto data, however, was never sent through our invitation/email flow, so there is no genuine invitation behind an imported submission.

## Considered options

- **Submissions-only** (`respondentId` set, `invitationId` null, no participant/invitation rows) — rejected: imported campaigns would render as empty-participant campaigns; status metrics would show 0 completed; every view that keys off invitations/participants would need an import-aware special case.
- **A separate "archive" model** (a distinct table or a non-campaign artifact for historical results) — rejected: forks the read path (every results/aggregate/trend screen would need to union a second source), and the data genuinely *is* a campaign's worth of responses — modeling it as something else is less truthful, not more.
- **Reconstruct the full live chain (chosen)** — imported data becomes ordinary campaign data; every existing view works unmodified; the only oddity is synthetic, never-sent invitations.

## Consequences

- **Imported campaigns are intentionally indistinguishable from native closed campaigns** in the data model. A future engineer will find `AssessmentInvitation` rows with `status = SUBMITTED`, a `sentAt`, and a random `tokenHash` that was **never emailed and is never usable**. This is deliberate — do not "fix" it as if a real invitation flow was skipped, and do not treat the token as a live access credential. The `AssessmentCampaign.externalId` (the Esperto campaign id) is the marker that a campaign was imported.
- The **no-email invariant is load-bearing**: imported invitations are created directly in `SUBMITTED` state via Prisma and must never enter the explicit "send invitations" path. This is asserted by test, and any refactor of the send path must preserve it.
- Idempotent re-import depends on the unique keys across all four entities (`AssessmentCampaign.externalId`; `(campaignId, respondentId)` on participant, invitation, and submission). A re-run must **upsert** across the chain, never blind-insert.
- Imported campaigns are born `CLOSED` and back-dated to the Esperto response dates, so they never accept new responses and sit correctly in historical time. They are visible to the owning coach via `createdByCoachId`.
- This decision is **hard to reverse**: once historical data is shaped as campaigns/invitations/submissions, switching to an archive model later means migrating live rows. The trade-off was chosen for read-path simplicity and data truthfulness.
