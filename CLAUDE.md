# Scaling Up Platform v2 - AI Assistant Instructions

## Project Context

This is **Scaling Up Platform v2** - an improved workshop management application that replaces Kajabi with a fully automated system. This builds upon the V1 foundation from the GitHub repository.

**Project Path:** `D:\The CTO Project\Scaling Up Platform v2`
**Source Repository:** https://github.com/CAIOdaigle/scaling-up-platform
**Alternative MVP:** `D:\The CTO Project\Scaling Up Beta` (autonomous agent approach)

## Current Status

**Phase:** PRD Complete → Ready for Development
**Client:** Jeff Verdun, CIO - Scaling Up
**Target:** Production-ready MVP in 2 weeks

## The Problem We're Solving

Suzanne manually performs 4-5 steps in Kajabi for every workshop:
1. Create bio landing page
2. Create payment offer
3. Embed offer into landing page
4. Create event with email automation
5. Tag contacts in HubSpot

With 200+ potential workshops in Q1, this is **unsustainable**.

## V2 Solution

Replace Kajabi with:
1. Automatic landing page generation
2. Integrated Stripe payments
3. Email automation via HubSpot
4. Circle.so certification verification
5. Human-in-the-loop for approvals

## Project Structure

```
Scaling Up Platform v2/
├── docs/
│   ├── PRD_SCALING_UP_PLATFORM_V2.md    # Master PRD
│   └── V1_DEEP_DIAGNOSTICS.md           # V1 analysis
├── context/
│   └── CALL_TRANSCRIPT_ANALYSIS.md      # Jeff Verdun call notes
├── src/                                  # Source code (from V1 repo)
└── config/                               # Configuration files
```

## Key Documents

| Document | Purpose |
|----------|---------|
| `docs/PRD_SCALING_UP_PLATFORM_V2.md` | Complete product requirements |
| `docs/V1_DEEP_DIAGNOSTICS.md` | V1 gaps and recommendations |
| `context/CALL_TRANSCRIPT_ANALYSIS.md` | Workflow analysis from call |

## Tech Stack (V2)

| Component | Technology |
|-----------|------------|
| Framework | Next.js 14 (App Router) |
| Database | PostgreSQL + Prisma |
| Payments | Stripe |
| CRM | HubSpot |
| Certifications | Circle.so |
| Job Queue | Inngest |
| Cache | Redis |
| Notifications | Teams/Email (NOT Slack) |
| **LLM Router** | Multi-Gateway (Claude/Gemini/Codex) |

## Multi-Gateway LLM Router

Intelligent task-based routing to save credits by using the right LLM for each task.

### Provider Specializations

| Provider | Best For | Brain |
|----------|----------|-------|
| **Claude (Opus/Sonnet)** | Planning, orchestration, self-annealing | 🧠 Planning Brain |
| **Gemini (2.5 Pro/Flash)** | Brand assets, landing pages, API connections | 🎨 Creative Brain |
| **Codex (OpenAI o3)** | Code execution, implementation, debugging | 💻 Code Brain |

### Usage

```python
from core.llm import get_router, LLMRequest, TaskType

router = get_router()

# Planning task → routes to Claude
response = await router.complete(
    LLMRequest(
        messages=[{"role": "user", "content": "Plan the workshop flow"}],
        task_type=TaskType.PLANNING
    )
)

# Creative task → routes to Gemini
response = await router.complete(
    LLMRequest(
        messages=[{"role": "user", "content": "Generate landing page copy"}],
        task_type=TaskType.CREATIVE
    )
)

# Implementation task → routes to Codex
response = await router.complete(
    LLMRequest(
        messages=[{"role": "user", "content": "Implement Stripe checkout"}],
        task_type=TaskType.IMPLEMENTATION
    )
)
```

### Required Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...
```

See `docs/MULTI_GATEWAY_LLM_ROUTER.md` for full documentation.

## Critical Requirements (From Jeff Verdun)

1. **Replace Kajabi** - Full replacement, not integration
2. **Human Approval for Pricing** - Suzanne must approve custom pricing
3. **$500 Cancellation Fee** - Must be enforced via Stripe
4. **Teams/Email for Approvals** - NOT Slack
5. **HubSpot is Truth** - All coach data from HubSpot

## V1 → V2 Changes

### Keep from V1
- Workshop/Coach/Registration models
- Stripe integration
- HubSpot sync service
- API handler wrapper
- Rate limiting

### Add in V2
- Circle.so integration
- Landing page generation
- Email campaign system
- Approval queue (HITL)
- Background job processing
- Audit logging

## Development Guidelines

### Before Writing Code
1. Read the PRD: `docs/PRD_SCALING_UP_PLATFORM_V2.md`
2. Understand V1 gaps: `docs/V1_DEEP_DIAGNOSTICS.md`
3. Reference Jeff's requirements in call transcript

### When Implementing
1. Clone V1 repo as starting point
2. Add new services in `src/services/`
3. Add new routes in `src/app/api/`
4. Update Prisma schema
5. Test with mocks before real APIs

### Human-in-the-Loop
All these require human approval:
- Custom pricing requests
- Workshop cancellations
- Refund processing
- Certification edge cases (<85% confidence)

**Notification Method:** Email or Teams (NOT Slack)

## CTO Project Commands

Use these slash commands from The CTO Project:

| Command | Purpose |
|---------|---------|
| `/review` | Code review before committing |
| `/peer-review` | Deep architecture review |
| `/prd` | Generate/update PRD |
| `/checklist` | Create development checklist |

## Related Projects

| Project | Path | Purpose |
|---------|------|---------|
| Scaling Up Beta | `D:\The CTO Project\Scaling Up Beta` | Alternative MVP (agentic) |
| CTO Project | `D:\The CTO Project` | Parent project with commands |

## Quick Start Development

```bash
# Clone V1 as starting point
git clone https://github.com/CAIOdaigle/scaling-up-platform.git src

# Install dependencies
cd src && npm install

# Set up environment
cp .env.example .env
# Fill in: DATABASE_URL, HUBSPOT_ACCESS_TOKEN, STRIPE_SECRET_KEY, etc.

# Run development
npm run dev
```

## Contact

- **Client:** Jeff Verdun (jeff@scalingup.com)
- **Operations:** Suzanne (handles approvals)
- **Dev Team:** Joshua Delos Santos, Chris Daigle

---

*Last Updated: January 28, 2026*
*Based on V1 diagnostics and January 27 call with Jeff Verdun*
