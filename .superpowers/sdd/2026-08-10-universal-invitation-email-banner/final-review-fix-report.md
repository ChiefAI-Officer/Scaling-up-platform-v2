# Final whole-branch review fix report

Status: **DONE**

Base: `3341d66e1a26f48fc5ce1368e442b244c914d673`

## Implemented

- Kept universal body-only authoring semantics INVITED-only. Campaign detail props and PATCH validation now require `accessMode === "INVITED"`; PUBLIC global and Template-canary cases remain on the prior URL-token contract. The separate PUBLIC create path continues to ignore invitation-only authoring fields.
- Made explicit `universalBanner` chrome bypass the older `ASSESSMENT_INVITE_BRANDED=0` non-universal renderer switch. Universal containment remains `WAVE_INVITATION_BANNER_KILL` at the send-path gate.
- Replaced raw canary serialization on the Coach new-campaign page with a server-derived snapshot containing only Organization/Template canary IDs that the authenticated actor may access. Global and KILL snapshots contain no IDs and avoid the access lookups.
- Updated the design, implementation plan, ops runbook, `CLAUDE.md`, and changelog receipt to record the INVITED boundary, renderer precedence, and authorized snapshot contract.
- Removed the tracked temporary `task-5-report.md` while preserving the rest of the active SDD workspace.

## Strict RED -> GREEN evidence

Initial RED command covered the changed flag helper, renderer, PUBLIC detail UI, PATCH route, PUBLIC create isolation, and new-page snapshot. It produced **6 failed suites / 1 passed suite; 12 failed tests / 161 passed tests / 173 total**. Failures demonstrated the intended defects: raw cross-tenant IDs reached the browser snapshot, global snapshots retained raw canaries, universal chrome fell into the legacy renderer under `ASSESSMENT_INVITE_BRANDED=0`, PUBLIC detail props enabled the universal authoring contract, and PUBLIC PATCH accepted tokenless body HTML. The PUBLIC create characterization was already green and confirmed that surface remained isolated.

After correcting the PATCH test actor so the request reached the PUBLIC campaign rather than failing authorization, the two new global/Template PUBLIC PATCH cases independently failed **expected 400, received 200**. After implementation, the seven directly changed suites passed **7 suites / 173 tests**.

## Verification

- Broad focused invitation-banner matrix: **20 suites / 429 tests / 1 snapshot passed**.
- Final directly affected regression set plus changelog freshness: **8 suites / 177 tests passed**.
- Changed-file ESLint: exit 0, no diagnostics.
- `git diff --check`: exit 0, no output.
- Migration safety: **47 migrations checked, no unapproved destructive operations**.
- `CI=true npx next build --turbopack`: exit 0; compile and TypeScript phases passed; **94/94** static pages generated. Existing missing local `DATABASE_URL` and Inngest-key warnings remained non-fatal.
- Full Jest: **686 suites / 8,568 tests / 16 snapshots passed** in 525.605 seconds. Established negative-path console output and React `act(...)` warnings remained non-fatal.

## Whole-fix self-review

- **PUBLIC isolation:** no PUBLIC delivery, result, report, or report-email production file changed. Global and Template-canary coverage verifies PUBLIC detail UI and PATCH keep the old authoring contract; PUBLIC create coverage verifies invitation-only fields are not stored.
- **Cross-tenant ID non-exposure:** the only browser snapshot producer now filters each configured canary through the existing Organization/Template access helpers for the authenticated actor. Tests verify accessible IDs are retained, inaccessible IDs are absent, and global/KILL snapshots serialize an empty ID list.
- **Render/authoring alignment:** an enabled INVITED universal scope allows body-only HTML and selects the universal shell even when the older renderer switch is `0`; PUBLIC remains token-required. Tests cover both contracts.
- **Flag-off and non-universal bytes:** default-off behavior remains unchanged. The renderer edit changes only explicit `universalBanner` selection; the existing `ASSESSMENT_INVITE_BRANDED=0` legacy test and invitation-email snapshot remain green for non-universal rendering.

## Safety boundary

No deploy, push, PR, Production flag read or mutation, customer-data write, or email send occurred.
