# Domain Docs

## Layout

This is a **single-context** repo. Domain documentation lives at:

- `CLAUDE.md` — primary source of truth: project context, tech stack, data model, API routes, quirks, sprint history
- No `CONTEXT.md` exists yet — created lazily by `/grill-with-docs` when terms get resolved
- No `docs/adr/` exists yet — created lazily when architectural decisions crystallize

## Before exploring, read these

1. **`CLAUDE.md`** at the repo root — contains the full data model, API surface, authorization model, and all known quirks. Read the relevant sections before making changes.
2. **`docs/agents/`** — issue tracker config, triage labels, this file.
3. If `CONTEXT.md` exists at the root, read it for domain glossary.
4. If `docs/adr/` exists, read ADRs touching the area you're working in.

## Key domain vocabulary (from CLAUDE.md)

- **Workshop** — the core entity; has 6 lifecycle stages (REQUESTED → AWAITING_APPROVAL → PRE_EVENT → POST_EVENT → COMPLETED, or CANCELED)
- **Coach** — the user who creates and manages workshops
- **ApprovalQueue** — Human-in-the-loop (HITL) review queue managed by Suzanne
- **WorkflowStep / WorkflowStepExecution** — email sequence steps; executions track scheduled send times
- **LandingPage** — auto-built page for each approved workshop
- **CANCELED** — American spelling (workshop); **CANCELLED** — British spelling (registration/page status). Both are intentional.

## Flag ADR conflicts

If a proposed change contradicts something documented in CLAUDE.md (quirks, design decisions, authorization model), surface it explicitly before proceeding.
