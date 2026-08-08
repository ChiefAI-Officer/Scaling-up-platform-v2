# 19aq — SunHub eight-question quick quiz implementation plan

## Fixed point and scope

Implement from `origin/main` at `192eaa36e0b1d3cfd3c886728e538a7918db9963`.
The source-backed design is
[`19aq-sunhub-quick-quiz-design.md`](19aq-sunhub-quick-quiz-design.md).
This plan creates code and a draft-only seed path; it performs no Production
seed, publish, campaign, send, flag, or data operation.

## Task 1 — Lock the source fixture RED

- Add a seed-content test that requires the new alias, eight exact questions,
  eight one-question sections, source order, source anchors, four exact
  feedback bands, three source CTA destinations, and publish-schema validity.
- Add boundary scoring cases for totals 19/20, 39/40, and 59/60, proving the
  rendered 0–100 score and tier transition agree with the source.
- Run the new suite and observe failure because the seed does not exist.

## Task 2 — Add the draft-only SunHub seed GREEN

- Add `prisma/seed-sunhub-quick-quiz.ts` using
  `ensureTemplateVersionContent` and the existing Production refusal guard.
- Use fresh `sunhub_*` keys and `meanOfQuestions` + `scaleUpScore`.
- Do not invoke the seed or register any automatic Production execution.
- Run the source fixture and scoring tests green.

## Task 3 — Lock public result actions RED/GREEN

- Extend the report presentation config with immutable public result actions.
- Add the SunHub alias configuration: scored, tier shown, generic score table
  hidden, three source actions.
- Render those actions on-screen and in the emailed report when the report is a
  public lead result; preserve existing behavior for every other alias.
- Add focused component/email tests and snapshots as needed.

## Task 4 — Reconcile closeout truth

- Update the #84 decision packet from "source missing" to "source-backed build
  complete; Production activation pending authorization."
- Keep #84 unresolved until protected merge plus separately authorized draft
  creation, visual verification, publication, public campaign creation, and
  representative live verification.
- Record the implementation in `plans/CHANGELOG.md` and refresh the
  `CLAUDE.md` anchor/status without changing the 44/3/6 tally prematurely.

## Task 5 — Verify and deliver

- Run focused Jest suites, changed-file ESLint, migration safety, and the full
  Turbopack build.
- Visually review a representative public result at desktop and mobile widths
  against the workbook screenshots.
- Recheck fresh `origin/main`, then create one narrow PR for #84.
- Do not perform any Production activation without a new explicit instruction.
