# Agent Instructions

This is the shared startup contract for Codex and teammate agents working in `ChiefAI-Officer/Scaling-up-platform-v2`.

## Source-Truth Read Order

1. `AGENTS.md`
2. `docs/agents/harness-operating-map.md`
3. `CLAUDE.md`
4. `CONTEXT.md`
5. `plans/CHANGELOG.md`
6. Relevant specs under `docs/specs/`
7. ADRs under `docs/adr/`
8. GitHub Issues and Projects, when available

## Branch And PR Rules

- Work on one small branch per issue or task.
- Use `gabriel/<issue-number>-<short-topic>` for Gabriel branches.
- Open a draft PR early so work is visible before it is ready to merge.
- Keep local-only, credential, cache, and generated files out of Git.
- Do not delete branches or close another person's PR without explicit operator approval.

## Validation

Use the validation commands in `AGENTS.md` and `CONTRIBUTING.md`. For docs-only changes, run at least `git diff --check`. For code-bearing changes, run targeted tests plus build checks from `src/`.

## Closeout

Before ending a development session:

- push the branch if changes are ready to share
- open or update the draft PR
- list checks run
- list exact blockers
- state the next expected reviewer or operator action