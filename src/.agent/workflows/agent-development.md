---
description: How to execute the agent-powered development workflow for Scaling Up v2
---

# Agent-Powered Development Workflow

## Before Starting Any Feature

1. Read the relevant skill file(s) in `.agent/skills/`:
   - Schema changes → `scaling-up-schema.md`
   - Auth/security → `scaling-up-auth.md`
   - UI/components → `scaling-up-ui.md`
   - API routes → `scaling-up-api.md`
   - Design generation → `stitch-workflow.md`

2. Decide agent pattern based on complexity:
   - **Single-file edit** → Sub-Agent (focused, low cost)
   - **Cross-layer feature** (UI + API + DB) → Agent Team (3 parallel agents)
   - **Research/exploration** → Sub-Agent: Explore

## Feature Development Loop

// turbo-all

3. **Define:** Write a feature brief (what, for whom, key states)
4. **Design:** If UI-heavy, use Stitch MCP with Design DNA screenshots
5. **Review:** Export to Figma if stakeholder approval needed
6. **Build:** Implement the code per skill file conventions
7. **Validate:** Run tests and screenshot comparisons

## Sprint Execution

### Sprint 1: Security (Agent Team)
```
Agent A: auth.ts + schema.prisma (password hashing, User↔Coach FK)
Agent B: authorization.ts + API routes (row-level auth, middleware)
Agent C: __tests__/ (auth boundary tests, IDOR tests)
```

### Sprint 2: Workshop Wizard (Agent Team)
```
Agent A: components/workshops/wizard/ (Steps 1-5, progress bar)
Agent B: api/workshops/ + schema.prisma (WorkshopDraft API, auto-save)
Agent C: Stitch MCP + Figma export (Design DNA consistency)
```

### Sprint 3: Dashboards (Sub-Agents)
```
Sub-Agent Explore: Read existing dashboard code, identify mock data
Sub-Agent Plan: Outline data contracts per role
Main Agent: Build admin + coach dashboards with real Prisma queries
```

### Sprint 4: Integrations (Mixed)
```
Sub-Agents: Landing page auto-populate, CSV import, toast wiring
Agent Team: Final cross-codebase code review
```

## Quality Gates

8. Before committing:
   - All TypeScript compiles without errors
   - `npx prisma generate` succeeds
   - Existing tests pass
   - Revenue visibility restricted (coach can't see `amountPaidCents`)
   - Auth checks on every API route

## Reference Plans
- [DESIGN_TO_CODE_ASSESSMENT_AND_ROADMAP.md](../../plans/DESIGN_TO_CODE_ASSESSMENT_AND_ROADMAP.md)
- [IMPLEMENTATION_ROADMAP_FEB8.md](../../plans/IMPLEMENTATION_ROADMAP_FEB8.md)
- [SCALING_UP_V2_IMPROVEMENT_PLAN.md](../../plans/SCALING_UP_V2_IMPROVEMENT_PLAN.md)
