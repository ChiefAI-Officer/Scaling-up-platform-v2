# Multi-Gateway LLM Router

## Overview

The Multi-Gateway LLM Router provides intelligent task-based routing to optimal LLM providers, saving credits by using the right model for each task instead of locking into a single expensive LLM.

## Provider Specializations

| Provider | Best For | Cost Tier |
|----------|----------|-----------|
| **Claude Opus/Sonnet** | Planning, orchestration, self-annealing, complex reasoning | Premium/Standard |
| **Gemini 2.5 Pro/Flash** | Brand assets, landing pages, creative content, API connections | Standard/Economy |
| **OpenAI Codex (o3)** | Code execution, implementation, debugging | Premium |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MULTI-GATEWAY LLM ROUTER                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Classifier │  │    Router    │  │   Fallback   │          │
│  │  (Rule-based)│  │  (Task→Chain)│  │   Executor   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    PROVIDER CLIENTS                         │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │ │
│  │  │ Claude  │  │ Gemini  │  │  Codex  │  │ GPT-4o  │       │ │
│  │  │ Opus    │  │  Pro    │  │  (o3)   │  │  Mini   │       │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Routing Policies

### Claude Tasks (Brain/Planning)
- **Planning**: Architecture, strategy, roadmaps
- **Orchestration**: Agent coordination, workflow design  
- **Self-Annealing**: Learning, optimization, reflection

### Gemini Tasks (Creative/Connections)
- **Creative**: Brand assets, landing pages, marketing copy
- **API Integration**: Hard-coding endpoints, webhooks, connections

### Codex Tasks (Code Execution)
- **Implementation**: Code writing, feature building
- **Debugging**: Bug fixing, error analysis

## Usage

### Basic Usage

```python
from core.llm import get_router, LLMRequest, TaskType

router = get_router()

# Explicit task type (recommended for accuracy)
response = await router.complete(
    LLMRequest(
        messages=[{"role": "user", "content": "Plan the authentication system"}],
        task_type=TaskType.PLANNING,
        agent_name="ARCHITECT"
    )
)

# Auto-classified (heuristic-based)
response = await router.complete(
    LLMRequest(
        messages=[{"role": "user", "content": "Generate landing page hero copy"}],
        agent_name="CRAFTER"
    )
)
```

### Task Types

```python
class TaskType(Enum):
    PLANNING = "planning"           # → Claude
    ORCHESTRATION = "orchestration" # → Claude
    SELF_ANNEALING = "self_annealing"  # → Claude
    CREATIVE = "creative"           # → Gemini
    API_INTEGRATION = "api_integration"  # → Gemini
    IMPLEMENTATION = "implementation"  # → Codex
    DEBUGGING = "debugging"         # → Codex
    GENERIC = "generic"             # → Claude (fallback)
```

### Response Structure

```python
@dataclass
class LLMResponse:
    content: str              # The LLM response
    provider: str             # Which provider was used
    model: str                # Which model
    task_type: str            # Classified task type
    classification_source: str # How task was classified
    route_name: str           # Route description
    input_tokens: int
    output_tokens: int
    latency_ms: float
    fallback_used: bool       # Did we fall back?
    fallback_reason: str      # Why?
    attempt_number: int       # Which attempt succeeded
    cost_estimate: float      # Estimated cost in USD
```

## Classification

The router uses rule-based classification (no LLM cost for routing):

1. **Explicit** - Caller sets `task_type` directly
2. **Agent Hint** - Inferred from `agent_name` (e.g., CRAFTER → creative)
3. **Operation Hint** - Inferred from `operation` (e.g., "debug_error" → debugging)
4. **Keyword Match** - Regex patterns in content
5. **Default** - Falls back to generic

## Fallback Chains

Each task type has a prioritized provider chain:

| Task Type | Primary | Secondary | Tertiary |
|-----------|---------|-----------|----------|
| Planning | Claude Opus | Claude Sonnet | GPT-4o |
| Orchestration | Claude Sonnet | Claude Opus | GPT-4o |
| Self-Annealing | Claude Sonnet | GPT-4o | Gemini Pro |
| Creative | Gemini Pro | Gemini Flash | Claude Sonnet |
| API Integration | Gemini Pro | Codex | Claude Sonnet |
| Implementation | Codex | Claude Sonnet | Gemini Pro |
| Debugging | Codex | Claude Sonnet | GPT-4o Mini |
| Generic | Claude Sonnet | GPT-4o | Gemini Flash |

## Cost Tracking

Usage is tracked by:
- **Provider**: Total requests, tokens, cost per provider
- **Task Type**: Which tasks cost the most
- **Agent**: Which agents use the most credits

```python
status = router.get_status()
print(f"Total cost: ${status['total_cost']:.2f}")
print(f"Planning tasks: ${status['task_costs']['planning']['cost']:.2f}")
```

## Environment Variables

Required in `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...
```

## CLI

```bash
# Check status
python -m core.llm.llm_router --status

# Test routing
python -m core.llm.llm_router --test planning
python -m core.llm.llm_router --test creative
python -m core.llm.llm_router --test implementation
```

## Integration with chiefaiofficer-alpha-swarm

The router can replace the existing `llm_provider_fallback.py`:

```python
# Old way (single chain)
from core.llm_provider_fallback import get_llm_provider
provider = get_llm_provider()
response = await provider.complete(request)

# New way (intelligent routing)
from core.llm import get_router
router = get_router()
response = await router.complete(request)
```

## Cost Savings

Expected savings by task:
- **Planning/Orchestration**: Use Claude only when needed (vs all tasks)
- **Creative/Landing Pages**: Gemini Flash is 20x cheaper than Claude Opus
- **Simple Tasks**: GPT-4o Mini fallback for economy

Estimated 40-60% cost reduction vs using Claude for everything.
