# Scaling Up Platform v2 - Development Roadmap

> Enterprise-grade workshop automation with Multi-Gateway LLM intelligence

---

## Current Status

```
Phase 1 ████████████████████ COMPLETE  (Foundation)
Phase 2 ████████████████████ COMPLETE  (PRD & Architecture)  
Phase 3 ████████████████████ COMPLETE  (Multi-Gateway LLM)
Phase 4 ████████████████████ COMPLETE  (Schema & Database)
Phase 5 ████████████████████ COMPLETE  (Service Layer)
Phase 6 ████████████████████ COMPLETE  (Inngest Jobs)
Phase 7 ████████████████████ COMPLETE  (Testing & Validation)
Phase 8 ░░░░░░░░░░░░░░░░░░░░ READY     (Production Deployment)
```

**Last Updated:** January 30, 2026

---

## ✅ Completed Work

### Phase 1: Foundation
- [x] V1 repository cloned to `src/`
- [x] Project structure established
- [x] PRD documented
- [x] V1 deep diagnostics complete

### Phase 2: Architecture & Planning
- [x] Call transcript analysis (Jeff Verdun requirements)
- [x] PRD v2 finalized
- [x] Tech stack decisions locked
- [x] Business rules documented

### Phase 3: Multi-Gateway LLM Router ✅
- [x] **Multi-Gateway LLM system created** → `core/llm/`
- [x] Task-based routing (Claude/Gemini/Codex)
- [x] Automatic fallback chains
- [x] Cost tracking by provider/task/agent
- [x] Documentation complete

### Phase 7: Testing & Validation ✅ COMPLETE
- [x] **Unit tests passing** → 153/153 tests (100%)
- [x] Fixed all test failures (Request polyfill, exports, mocking)
- [x] Admin layout auth protection added
- [x] Zod validation coverage: 81% (13/16 routes)
- [x] E2E tests: `workshop-creation-flow.spec.ts`, `approval-workflow.spec.ts`
- [x] Load testing script → `scripts/load-test.js`
- [x] Security audit script → `scripts/security-audit.js` (75% score)
- [x] Vercel deployment config → `vercel.json`
- [x] Deployment checklist → `docs/DEPLOYMENT_CHECKLIST.md`
- [x] npm scripts: `test:load`, `test:security`, `deploy:staging`

---

## 🔄 Current Phase: Services & Integration

### Multi-Gateway LLM Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MULTI-GATEWAY LLM ROUTER                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   📥 Request → 🏷️ Classify → 🔀 Route → ⚡ Execute → 📊 Track   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   🧠 CLAUDE (Brain)        🎨 GEMINI (Creative)   💻 CODEX     │
│   ├─ Planning              ├─ Landing Pages       ├─ Implement  │
│   ├─ Orchestration         ├─ Brand Assets        ├─ Debug      │
│   └─ Self-Annealing        └─ API Connections     └─ Refactor   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Routing Strategy

| Task Type | Primary | Fallback | Cost Tier |
|-----------|---------|----------|-----------|
| Planning/Orchestration | Claude Opus/Sonnet | GPT-4o | Premium |
| Self-Annealing | Claude Sonnet | GPT-4o → Gemini | Standard |
| Creative/Landing Pages | Gemini 2.5 Pro | Flash → Claude | Economy |
| API Integration | Gemini Pro | Codex → Claude | Standard |
| Implementation | Codex (o3) | Claude → Gemini | Premium |
| Debugging | Codex | Claude → GPT-4o Mini | Standard |

### Files Created

| File | Purpose | Status |
|------|---------|--------|
| `core/llm/llm_router.py` | Main router with classification | ✅ Complete |
| `core/llm/__init__.py` | Package exports | ✅ Complete |
| `core/llm/config.json` | Route configuration | ✅ Complete |
| `docs/MULTI_GATEWAY_LLM_ROUTER.md` | Full documentation | ✅ Complete |

---

## ✅ Completed Phases

### Phase 4: Schema & Database ✅ COMPLETE
- [x] Prisma schema extensions (ApprovalQueue, AuditLog, LandingPage, FollowUpReport)
- [x] Workshop approval states (ApprovalType, ApprovalStatus enums)
- [x] Audit trail tables (AuditLog model)
- [x] All V2 enums (EmailType, PageStatus, ReportStatus)

### Phase 5: Service Layer ✅ COMPLETE
- [x] Circle.so certification service (`src/services/circle.ts`)
- [x] HubSpot sync service (`src/services/hubspot.ts`)
- [x] Stripe service (`src/services/stripe.ts`)
- [x] Email sender service (`src/services/email-sender.ts`)
- [x] Notification service (`src/services/notifications.ts`)

### Phase 6: Inngest Jobs ✅ COMPLETE
- [x] Inngest client configured (`src/inngest/client.ts`)
- [x] Email sequence scheduler (`src/inngest/functions/schedule-emails.ts`)
- [x] Workshop automation hooks
- [x] Approval timeout handlers

---

## 📋 Remaining Phase

### Phase 8: Production Deployment (Ready to Start)
- [ ] Deploy to Vercel staging
- [ ] Configure production environment variables
- [ ] Run database migrations
- [ ] Smoke test all critical flows
- [ ] Run E2E tests against staging
- [ ] Run load tests against staging
- [ ] Configure monitoring (Vercel Analytics, error tracking)
- [ ] Production deploy with gradual rollout

---

## Architecture Layers

```
┌────────────────────────────────────────────────────────────────┐
│  DIRECTIVE LAYER                                                │
│  PRD + Business Rules (human-readable)                         │
├────────────────────────────────────────────────────────────────┤
│  INTELLIGENCE LAYER ← NEW                                       │
│  Multi-Gateway LLM Router (task-based routing)                 │
│  • Claude: Planning & Orchestration                            │
│  • Gemini: Creative & Connections                              │
│  • Codex: Implementation & Debugging                           │
├────────────────────────────────────────────────────────────────┤
│  ORCHESTRATION LAYER                                            │
│  Next.js API + Inngest (decision-making)                       │
├────────────────────────────────────────────────────────────────┤
│  EXECUTION LAYER                                                │
│  Services (deterministic, single-purpose)                      │
└────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
# 1. Clone V1 as foundation
git clone https://github.com/CAIOdaigle/scaling-up-platform.git src
cd src && npm install

# 2. Configure environment
cp .env.example .env.local
# Required for Multi-Gateway:
# ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=AIza...
# OPENAI_API_KEY=sk-...
# Plus: DATABASE_URL, HUBSPOT_ACCESS_TOKEN, STRIPE_SECRET_KEY

# 3. Test LLM Router
python -m core.llm.llm_router --status

# 4. Run development
npm run dev
```

---

## Critical Guardrails

### Human Approval Required (HITL)
- Custom pricing requests
- Workshop cancellations ($500 fee)
- Date changes ($500 fee)
- Refunds > $250
- Certification confidence < 85%

### Auto-Approved
- Standard pricing + valid certification (≥85% confidence)
- Standard registrations
- Automated email sequences

---

## External Integrations

| Service | Purpose | Status |
|---------|---------|--------|
| **Claude API** | Planning, orchestration brain | ✅ Configured |
| **Gemini API** | Creative, landing pages | ✅ Configured |
| **OpenAI API** | Codex for implementation | ✅ Configured |
| Circle.so | Certification verification | 🔲 Day 1 priority |
| HubSpot | CRM, email lists | 🔲 Needs sandbox |
| Stripe | Payments, refunds | ✅ Connected |
| Teams/Email | HITL notifications | 🔲 NOT Slack |

---

## Key Business Rules

| Rule | Value |
|------|-------|
| Cancellation fee | $500 + refund overage > $250 |
| Date change fee | $500 |
| In-person lead time | 90 days |
| Virtual lead time | 60 days |
| Revenue split | 75% Coach / 25% Scaling Up |

---

## File Structure

```
Scaling Up Platform v2/
├── core/                          # ← NEW: Intelligence Layer
│   └── llm/
│       ├── llm_router.py          # Multi-Gateway Router
│       ├── config.json            # Route configuration
│       └── providers/             # Provider clients
├── docs/
│   ├── PRD_SCALING_UP_PLATFORM_V2.md
│   ├── MULTI_GATEWAY_LLM_ROUTER.md  # ← NEW
│   └── V1_DEEP_DIAGNOSTICS.md
├── src/                           # Next.js application
│   ├── app/api/                   # API routes
│   ├── services/                  # Service layer
│   ├── inngest/                   # Job processing
│   └── templates/                 # Landing pages & emails
└── config/                        # Environment configs
```

---

## Success Metrics

| Metric | Before | Target | Current |
|--------|--------|--------|---------|
| Workshop setup | 30-60 min | < 5 min | - |
| Manual steps | 4-5 | 1 | - |
| Q1 capacity | ~50 | 200+ | - |
| Suzanne involvement | Every workshop | Approvals only | - |
| LLM cost efficiency | N/A | 40-60% savings | ✅ Multi-Gateway |

---

## Next Actions

1. **Add API keys** to `.env` (Anthropic, Gemini, OpenAI)
2. **Test router**: `python -m core.llm.llm_router --status`
3. **Begin Phase 4**: Circle.so service integration
4. **Create Prisma schema** extensions for approvals

---

*Last Updated: January 29, 2026*
*See: `docs/MULTI_GATEWAY_LLM_ROUTER.md` for LLM routing details*
