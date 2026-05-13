# MEMORY.md Migration Log

External state migration log for the 2026-05-13 slim-down rollout. Memory files
live outside this repo at `~/.claude/projects/-Users-diushianstand-Scaling-up-platform-v2/memory/`,
so this log is the only git-tracked record of the change.

## 2026-05-13 — Slim-down rollout (CLAUDE.md + MEMORY.md context-bloat cleanup)

**Snapshot:** `~/memory-snapshot-pre-slim-20260513T110344Z-73262.tgz` (full memory/ tarball
captured before any edits — restore with `tar -xzf <path> -C ~/.claude/projects/-Users-diushianstand-Scaling-up-platform-v2/`).

**MEMORY.md changes:**
- Word count: 654 → 194 (~70% reduction).
- Removed line: `feedback_always_covalidate.md` (self-superseded — file noted "superseded 2026-05-08").
- Removed line: `project_jeff_apr20_sprint.md` (sprint shipped).
- Removed line: `project_jeff_apr23_call.md` (call outcomes shipped).
- Tightened all remaining entries: dropped redundant `— <prose>` clauses since each link points at the file holding the full detail. Kept the `— prose` only where it carries an active operational hint (e.g., Username, Update SOT entry, Esperto deferred status).

**Memory file changes:**
- `feedback_update_sot_on_push.md` — Rewrote body to reflect new workflow:
  prepend entry to `plans/CHANGELOG.md`, then update LAST_UPDATED_ISO/SLUG anchor
  in CLAUDE.md, then update brief prose. Old version told the model to update
  CLAUDE.md "Current Status" narrative — that's no longer correct.
- `_archive/feedback_always_covalidate.md` — Moved out of the active memory
  directory into `_archive/` (file remains for historical reference; agent
  loader scans only the top-level directory).

**Rationale:** Pre-slim, every Scaling Up conversation loaded the full 11k-word
CLAUDE.md + 654-word MEMORY.md as system context — ~27k tokens per turn before
any user message. Post-slim, the equivalent is ~10k tokens. Net win: ~17k tokens
saved per turn, full history still recoverable from plans/CHANGELOG.md + git log.

**Enforcement:** `src/src/__tests__/lint/changelog-freshness.test.ts` runs on
every `npm run test` and fails if CLAUDE.md exceeds 8000 words or its
LAST_UPDATED anchor drifts from the topmost plans/CHANGELOG.md entry.
