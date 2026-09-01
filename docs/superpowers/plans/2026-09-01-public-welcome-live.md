# Public Welcome live-template implementation plan

**Fixed point:** `dd32487bbe9f37a7674a0fd062fefeef1775d49f`

1. Add loader tests proving valid saved Welcome JSON reaches `PublicQuizClient`
   and malformed JSON fails closed to the legacy public presentation.
2. Add renderer tests proving all authored text renders while factual question-bank
   presentation remains derived; retain the existing legacy-copy characterization.
3. Add an editor test for the approved PUBLIC-live / INVITED-snapshot lifecycle copy.
4. Implement strict server parsing, the typed client prop, authored rendering, and
   corrected editor guidance with no invited snapshot changes.
5. Run focused suites, refactor only after green, then run changed-file ESLint,
   migration safety, exact `CI=true npm run build`, and repository-required tests.
6. Update `CLAUDE.md` and `plans/CHANGELOG.md`, review from the fixed point on both
   standards and specification axes, commit, push, and open a protected-branch PR.
