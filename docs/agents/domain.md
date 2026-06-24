# Domain Docs

## Layout

This is a **single-context** repo. Domain documentation lives at:

- `AGENTS.md` - short front-door map for agent work.
- `docs/agents/harness-operating-map.md` - current autonomous-loop and harness plan.
- `CLAUDE.md` - primary source of truth: project context, tech stack, data model, API routes, quirks, sprint history.
- No `CONTEXT.md` exists yet - created lazily by `/grill-with-docs` when terms get resolved.
- `docs/adr/` - architectural decisions that have crystallized.

## Before exploring, read these

1. **`AGENTS.md`** at the repo root - start here for the short operating map.
2. **`docs/agents/harness-operating-map.md`** - read for the active autonomous-loop plan.
3. **`CLAUDE.md`** at the repo root - contains the full data model, API surface, authorization model, and all known quirks. Read the relevant sections before making changes.
4. **`docs/agents/`** - issue tracker config, triage labels, this file.
5. If `CONTEXT.md` exists at the root, read it for domain glossary.
6. If `docs/adr/` exists, read ADRs touching the area you're working in.

## Key domain vocabulary (from CLAUDE.md)

- **Workshop** — the core entity; has 6 lifecycle stages (REQUESTED → AWAITING_APPROVAL → PRE_EVENT → POST_EVENT → COMPLETED, or CANCELED)
- **Coach** — the user who creates and manages workshops
- **ApprovalQueue** — Human-in-the-loop (HITL) review queue managed by Suzanne
- **WorkflowStep / WorkflowStepExecution** — email sequence steps; executions track scheduled send times
- **LandingPage** — auto-built page for each approved workshop
- **CANCELED** — American spelling (workshop); **CANCELLED** — British spelling (registration/page status). Both are intentional.

## Flag ADR conflicts

If a proposed change contradicts something documented in CLAUDE.md (quirks, design decisions, authorization model), surface it explicitly before proceeding.
