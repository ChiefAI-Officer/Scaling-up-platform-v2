"""
Multi-Gateway LLM System
========================

Intelligent task-based routing to optimal LLM providers.

Provider Specializations:
- CLAUDE: Planning, orchestration, self-annealing, complex reasoning
- GEMINI: Brand assets, landing pages, creative, API connections
- CODEX: Code execution, implementation, debugging

Usage:
    from core.llm import get_router, LLMRequest, TaskType
    
    router = get_router()
    
    response = await router.complete(
        LLMRequest(
            messages=[{"role": "user", "content": "Plan the auth system"}],
            task_type=TaskType.PLANNING,
            agent_name="ARCHITECT"
        )
    )
"""

from .llm_router import (
    get_router,
    MultiGatewayRouter,
    LLMRequest,
    LLMResponse,
    TaskType,
    LLMProvider,
    ClassificationSource,
    ProviderConfig,
    RoutePolicy,
    PROVIDER_CONFIGS,
    ROUTE_POLICIES,
)

__all__ = [
    "get_router",
    "MultiGatewayRouter",
    "LLMRequest",
    "LLMResponse",
    "TaskType",
    "LLMProvider",
    "ClassificationSource",
    "ProviderConfig",
    "RoutePolicy",
    "PROVIDER_CONFIGS",
    "ROUTE_POLICIES",
]
