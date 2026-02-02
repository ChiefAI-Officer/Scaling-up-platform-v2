#!/usr/bin/env python3
"""
Multi-Gateway LLM Router
========================

Intelligent task-based routing to optimal LLM providers with automatic fallback.

Provider Specializations:
- CLAUDE (Opus/Sonnet): Planning, orchestration, self-annealing, complex reasoning
- GEMINI (2.5 Pro/Flash): Brand assets, landing pages, visual/creative, API connections
- CODEX (OpenAI): Code execution, implementation, debugging

Routing Strategy:
1. Classify task type (explicit or heuristic-based)
2. Select optimal provider chain for task
3. Execute with fallback through chain
4. Track usage/cost per provider per task type

Usage:
    from core.llm.llm_router import get_router, LLMRequest, TaskType
    
    router = get_router()
    
    # Explicit task type (recommended)
    response = await router.complete(
        LLMRequest(
            messages=[{"role": "user", "content": "Plan the authentication system"}],
            task_type=TaskType.PLANNING,
            agent_name="ARCHITECT"
        )
    )
    
    # Auto-classified
    response = await router.complete(
        LLMRequest(
            messages=[{"role": "user", "content": "Generate a landing page hero section"}],
            agent_name="CRAFTER"
        )
    )
"""

import os
import sys
import json
import asyncio
import logging
import time
import re
from enum import Enum
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field, asdict
from abc import ABC, abstractmethod

# Setup paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / '.env', override=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('llm_router')


# =============================================================================
# ENUMS
# =============================================================================

class TaskType(Enum):
    """Task types for intelligent routing."""
    PLANNING = "planning"           # Architecture, strategy, roadmaps
    ORCHESTRATION = "orchestration" # Agent coordination, workflow design
    SELF_ANNEALING = "self_annealing"  # Learning, optimization, reflection
    CREATIVE = "creative"           # Brand assets, landing pages, copy
    IMPLEMENTATION = "implementation"  # Code writing, feature building
    DEBUGGING = "debugging"         # Bug fixing, error analysis
    API_INTEGRATION = "api_integration"  # Hard-coding API endpoints
    GENERIC = "generic"             # Fallback for unclassified tasks


class LLMProvider(Enum):
    """Available LLM providers."""
    CLAUDE_OPUS = "claude_opus"
    CLAUDE_SONNET = "claude_sonnet"
    GEMINI_PRO = "gemini_pro"
    GEMINI_FLASH = "gemini_flash"
    OPENAI_CODEX = "openai_codex"
    OPENAI_GPT4O = "openai_gpt4o"
    OPENAI_GPT4O_MINI = "openai_gpt4o_mini"


class ClassificationSource(Enum):
    """How the task type was determined."""
    EXPLICIT = "explicit"           # Caller provided task_type
    AGENT_HINT = "agent_hint"       # Inferred from agent_name
    KEYWORD = "keyword"             # Matched keywords in content
    OPERATION = "operation"         # Matched operation name
    DEFAULT = "default"             # Fallback to generic


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ProviderConfig:
    """Configuration for an LLM provider."""
    name: str
    provider: LLMProvider
    model: str
    api_key_env: str
    base_url: str
    timeout_seconds: float = 60.0
    max_retries: int = 2
    enabled: bool = True
    
    # Pricing per 1M tokens
    input_price_per_million: float = 0.0
    output_price_per_million: float = 0.0
    
    # Rate limits
    requests_per_minute: int = 60
    tokens_per_minute: int = 100000
    
    # Capabilities
    supports_vision: bool = False
    supports_tools: bool = True
    supports_json_mode: bool = True
    max_context_tokens: int = 128000


@dataclass
class RoutePolicy:
    """Defines provider chain for a task type."""
    task_type: TaskType
    provider_keys: List[str]  # Ordered by priority
    description: str
    max_total_attempts: int = 4


@dataclass
class LLMRequest:
    """A request to the LLM router."""
    messages: List[Dict[str, str]]
    max_tokens: int = 2000
    temperature: float = 0.7
    agent_name: str = "UNKNOWN"
    operation: str = "completion"
    system_prompt: Optional[str] = None
    task_type: Optional[TaskType] = None  # Explicit routing
    routing_hint: Optional[str] = None    # Free-form hint
    require_json: bool = False
    require_vision: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        if self.task_type:
            d['task_type'] = self.task_type.value
        return d


@dataclass
class LLMResponse:
    """Response from the LLM router."""
    content: str
    provider: str
    model: str
    task_type: str
    classification_source: str
    route_name: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0
    fallback_used: bool = False
    fallback_reason: Optional[str] = None
    attempt_number: int = 1
    cost_estimate: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# =============================================================================
# PROVIDER CONFIGURATIONS
# =============================================================================

PROVIDER_CONFIGS: Dict[str, ProviderConfig] = {
    # Claude Models (Planning, Orchestration, Self-Annealing)
    "claude_opus": ProviderConfig(
        name="Claude Opus",
        provider=LLMProvider.CLAUDE_OPUS,
        model="claude-opus-4-20250514",
        api_key_env="ANTHROPIC_API_KEY",
        base_url="https://api.anthropic.com/v1",
        input_price_per_million=15.0,
        output_price_per_million=75.0,
        max_context_tokens=200000,
        supports_vision=True
    ),
    "claude_sonnet": ProviderConfig(
        name="Claude Sonnet",
        provider=LLMProvider.CLAUDE_SONNET,
        model="claude-sonnet-4-20250514",
        api_key_env="ANTHROPIC_API_KEY",
        base_url="https://api.anthropic.com/v1",
        input_price_per_million=3.0,
        output_price_per_million=15.0,
        max_context_tokens=200000,
        supports_vision=True
    ),
    
    # Gemini Models (Creative, Landing Pages, API Connections)
    "gemini_pro": ProviderConfig(
        name="Gemini 2.5 Pro",
        provider=LLMProvider.GEMINI_PRO,
        model="gemini-2.5-pro-preview-06-05",
        api_key_env="GEMINI_API_KEY",
        base_url="https://generativelanguage.googleapis.com/v1beta",
        input_price_per_million=1.25,
        output_price_per_million=10.0,
        max_context_tokens=1000000,
        supports_vision=True
    ),
    "gemini_flash": ProviderConfig(
        name="Gemini 2.5 Flash",
        provider=LLMProvider.GEMINI_FLASH,
        model="gemini-2.5-flash-preview-05-20",
        api_key_env="GEMINI_API_KEY",
        base_url="https://generativelanguage.googleapis.com/v1beta",
        input_price_per_million=0.15,
        output_price_per_million=0.60,
        max_context_tokens=1000000,
        supports_vision=True
    ),
    
    # OpenAI Models (Code Execution, Implementation, Debugging)
    "openai_codex": ProviderConfig(
        name="OpenAI Codex (o3)",
        provider=LLMProvider.OPENAI_CODEX,
        model="o3",  # Latest reasoning/code model
        api_key_env="OPENAI_API_KEY",
        base_url="https://api.openai.com/v1",
        input_price_per_million=10.0,
        output_price_per_million=40.0,
        max_context_tokens=128000
    ),
    "openai_gpt4o": ProviderConfig(
        name="GPT-4o",
        provider=LLMProvider.OPENAI_GPT4O,
        model="gpt-4o",
        api_key_env="OPENAI_API_KEY",
        base_url="https://api.openai.com/v1",
        input_price_per_million=2.5,
        output_price_per_million=10.0,
        max_context_tokens=128000,
        supports_vision=True
    ),
    "openai_gpt4o_mini": ProviderConfig(
        name="GPT-4o Mini",
        provider=LLMProvider.OPENAI_GPT4O_MINI,
        model="gpt-4o-mini",
        api_key_env="OPENAI_API_KEY",
        base_url="https://api.openai.com/v1",
        input_price_per_million=0.15,
        output_price_per_million=0.60,
        max_context_tokens=128000,
        supports_vision=True
    ),
}


# =============================================================================
# ROUTING POLICIES
# =============================================================================

ROUTE_POLICIES: Dict[TaskType, RoutePolicy] = {
    # Claude is the brain - planning, orchestration, self-annealing
    TaskType.PLANNING: RoutePolicy(
        task_type=TaskType.PLANNING,
        provider_keys=["claude_opus", "claude_sonnet", "openai_gpt4o"],
        description="Architecture, strategy, roadmaps - Claude excels at complex reasoning"
    ),
    TaskType.ORCHESTRATION: RoutePolicy(
        task_type=TaskType.ORCHESTRATION,
        provider_keys=["claude_sonnet", "claude_opus", "openai_gpt4o"],
        description="Agent coordination, workflow design - Claude for reliable orchestration"
    ),
    TaskType.SELF_ANNEALING: RoutePolicy(
        task_type=TaskType.SELF_ANNEALING,
        provider_keys=["claude_sonnet", "openai_gpt4o", "gemini_pro"],
        description="Learning, optimization, reflection - Claude for nuanced analysis"
    ),
    
    # Gemini for creative/visual/connection tasks
    TaskType.CREATIVE: RoutePolicy(
        task_type=TaskType.CREATIVE,
        provider_keys=["gemini_pro", "gemini_flash", "claude_sonnet"],
        description="Brand assets, landing pages, copy - Gemini for creative generation"
    ),
    TaskType.API_INTEGRATION: RoutePolicy(
        task_type=TaskType.API_INTEGRATION,
        provider_keys=["gemini_pro", "openai_codex", "claude_sonnet"],
        description="Hard-coding API endpoints, webhooks - Gemini for connection logic"
    ),
    
    # Codex/OpenAI for code execution
    TaskType.IMPLEMENTATION: RoutePolicy(
        task_type=TaskType.IMPLEMENTATION,
        provider_keys=["openai_codex", "claude_sonnet", "gemini_pro"],
        description="Code writing, feature building - Codex for implementation"
    ),
    TaskType.DEBUGGING: RoutePolicy(
        task_type=TaskType.DEBUGGING,
        provider_keys=["openai_codex", "claude_sonnet", "openai_gpt4o_mini"],
        description="Bug fixing, error analysis - Codex for debugging"
    ),
    
    # Generic fallback
    TaskType.GENERIC: RoutePolicy(
        task_type=TaskType.GENERIC,
        provider_keys=["claude_sonnet", "openai_gpt4o", "gemini_flash"],
        description="Unclassified tasks - balanced chain"
    ),
}


# =============================================================================
# TASK CLASSIFIER
# =============================================================================

class TaskClassifier:
    """Rule-based task classifier (no LLM cost for routing decisions)."""
    
    # Keyword patterns for classification
    PATTERNS = {
        TaskType.PLANNING: [
            r'\bplan\b', r'\bstrategy\b', r'\barchitecture\b', r'\broadmap\b',
            r'\bdesign\s+system\b', r'\bphase\b', r'\bmilestone\b', r'\bprioritize\b'
        ],
        TaskType.ORCHESTRATION: [
            r'\borchestrat\w*\b', r'\bcoordinat\w*\b', r'\bworkflow\b', r'\bpipeline\b',
            r'\bagent\s+spawn\b', r'\bswarm\b', r'\bdelegat\w*\b'
        ],
        TaskType.SELF_ANNEALING: [
            r'\bself[-_]?anneal\w*\b', r'\blearn\w*\b', r'\boptimiz\w*\b',
            r'\breflect\w*\b', r'\bimprov\w*\b', r'\bpattern\s+match\b'
        ],
        TaskType.CREATIVE: [
            r'\bbrand\b', r'\blanding\s+page\b', r'\bhero\b', r'\bcopy\b',
            r'\bdesign\b', r'\bpalette\b', r'\blogo\b', r'\bvisual\b',
            r'\bmarketing\b', r'\bcontent\b', r'\bheadline\b', r'\bcta\b'
        ],
        TaskType.API_INTEGRATION: [
            r'\bapi\b', r'\bendpoint\b', r'\bwebhook\b', r'\bintegrat\w*\b',
            r'\bconnect\w*\b', r'\bhard[-_]?cod\w*\b', r'\brest\b', r'\bgraphql\b'
        ],
        TaskType.IMPLEMENTATION: [
            r'\bimplement\w*\b', r'\bbuild\b', r'\bcreate\s+\w+\s+(function|class|component)\b',
            r'\badd\s+feature\b', r'\bwrite\s+code\b', r'\brefactor\b'
        ],
        TaskType.DEBUGGING: [
            r'\bbug\b', r'\bdebug\b', r'\berror\b', r'\bfix\b', r'\btraceback\b',
            r'\bstack\s*trace\b', r'\bfail\w*\b', r'\bbroken\b', r'\bissue\b'
        ],
    }
    
    # Agent name hints
    AGENT_HINTS = {
        'QUEEN': TaskType.ORCHESTRATION,
        'UNIFIED_QUEEN': TaskType.ORCHESTRATION,
        'ALPHA_QUEEN': TaskType.ORCHESTRATION,
        'ARCHITECT': TaskType.PLANNING,
        'PLANNER': TaskType.PLANNING,
        'CRAFTER': TaskType.CREATIVE,
        'DESIGNER': TaskType.CREATIVE,
        'HUNTER': TaskType.IMPLEMENTATION,
        'ENRICHER': TaskType.API_INTEGRATION,
        'DEBUGGER': TaskType.DEBUGGING,
        'CODER': TaskType.IMPLEMENTATION,
        'ANNEALER': TaskType.SELF_ANNEALING,
    }
    
    # Operation hints
    OPERATION_HINTS = {
        'plan': TaskType.PLANNING,
        'design': TaskType.PLANNING,
        'orchestrate': TaskType.ORCHESTRATION,
        'coordinate': TaskType.ORCHESTRATION,
        'anneal': TaskType.SELF_ANNEALING,
        'learn': TaskType.SELF_ANNEALING,
        'generate_landing': TaskType.CREATIVE,
        'create_brand': TaskType.CREATIVE,
        'implement': TaskType.IMPLEMENTATION,
        'build': TaskType.IMPLEMENTATION,
        'debug': TaskType.DEBUGGING,
        'fix': TaskType.DEBUGGING,
        'integrate_api': TaskType.API_INTEGRATION,
        'connect': TaskType.API_INTEGRATION,
    }
    
    def classify(self, request: LLMRequest) -> Tuple[TaskType, ClassificationSource]:
        """Classify request into task type with source tracking."""
        
        # 1. Explicit task type (highest priority)
        if request.task_type:
            return request.task_type, ClassificationSource.EXPLICIT
        
        # 2. Agent name hint
        agent_upper = request.agent_name.upper()
        for agent_pattern, task_type in self.AGENT_HINTS.items():
            if agent_pattern in agent_upper:
                return task_type, ClassificationSource.AGENT_HINT
        
        # 3. Operation hint
        operation_lower = request.operation.lower()
        for op_pattern, task_type in self.OPERATION_HINTS.items():
            if op_pattern in operation_lower:
                return task_type, ClassificationSource.OPERATION
        
        # 4. Keyword matching in content
        content = self._extract_content(request)
        for task_type, patterns in self.PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    return task_type, ClassificationSource.KEYWORD
        
        # 5. Default fallback
        return TaskType.GENERIC, ClassificationSource.DEFAULT
    
    def _extract_content(self, request: LLMRequest) -> str:
        """Extract searchable text from request."""
        parts = [request.operation, request.agent_name]
        
        if request.routing_hint:
            parts.append(request.routing_hint)
        
        if request.system_prompt:
            parts.append(request.system_prompt)
        
        for msg in request.messages[-3:]:  # Last 3 messages
            parts.append(msg.get('content', ''))
        
        return ' '.join(parts)


# =============================================================================
# PROVIDER CLIENTS
# =============================================================================

class BaseProviderClient(ABC):
    """Abstract base for provider clients."""
    
    @abstractmethod
    async def complete(
        self, 
        config: ProviderConfig, 
        request: LLMRequest
    ) -> Tuple[str, int, int]:
        """Return (content, input_tokens, output_tokens)."""
        pass


class AnthropicClient(BaseProviderClient):
    """Anthropic Claude API client."""
    
    async def complete(
        self, 
        config: ProviderConfig, 
        request: LLMRequest
    ) -> Tuple[str, int, int]:
        try:
            import anthropic
        except ImportError:
            raise ImportError("anthropic package required: pip install anthropic")
        
        api_key = os.getenv(config.api_key_env)
        if not api_key:
            raise ValueError(f"Missing {config.api_key_env}")
        
        client = anthropic.Anthropic(api_key=api_key)
        
        system = request.system_prompt or "You are a helpful AI assistant."
        
        response = client.messages.create(
            model=config.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            system=system,
            messages=request.messages
        )
        
        content = response.content[0].text
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        
        return content, input_tokens, output_tokens


class GeminiClient(BaseProviderClient):
    """Google Gemini API client."""
    
    async def complete(
        self, 
        config: ProviderConfig, 
        request: LLMRequest
    ) -> Tuple[str, int, int]:
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError("google-generativeai package required: pip install google-generativeai")
        
        api_key = os.getenv(config.api_key_env)
        if not api_key:
            raise ValueError(f"Missing {config.api_key_env}")
        
        genai.configure(api_key=api_key)
        
        model = genai.GenerativeModel(
            model_name=config.model,
            system_instruction=request.system_prompt
        )
        
        # Convert messages to Gemini format
        history = []
        for msg in request.messages[:-1]:
            role = "user" if msg["role"] == "user" else "model"
            history.append({"role": role, "parts": [msg["content"]]})
        
        chat = model.start_chat(history=history)
        
        last_msg = request.messages[-1]["content"] if request.messages else ""
        response = chat.send_message(
            last_msg,
            generation_config=genai.GenerationConfig(
                max_output_tokens=request.max_tokens,
                temperature=request.temperature
            )
        )
        
        content = response.text
        # Gemini doesn't always return token counts directly
        input_tokens = getattr(response.usage_metadata, 'prompt_token_count', 0) if hasattr(response, 'usage_metadata') else 0
        output_tokens = getattr(response.usage_metadata, 'candidates_token_count', 0) if hasattr(response, 'usage_metadata') else 0
        
        return content, input_tokens, output_tokens


class OpenAIClient(BaseProviderClient):
    """OpenAI API client (GPT-4o, Codex/o3)."""
    
    async def complete(
        self, 
        config: ProviderConfig, 
        request: LLMRequest
    ) -> Tuple[str, int, int]:
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("openai package required: pip install openai")
        
        api_key = os.getenv(config.api_key_env)
        if not api_key:
            raise ValueError(f"Missing {config.api_key_env}")
        
        client = OpenAI(api_key=api_key)
        
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.extend(request.messages)
        
        response = client.chat.completions.create(
            model=config.model,
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        
        content = response.choices[0].message.content
        input_tokens = response.usage.prompt_tokens
        output_tokens = response.usage.completion_tokens
        
        return content, input_tokens, output_tokens


# =============================================================================
# MULTI-GATEWAY ROUTER
# =============================================================================

class MultiGatewayRouter:
    """
    Intelligent LLM router with task-based provider selection.
    
    Routes requests to optimal providers based on task type,
    with automatic fallback through provider chains.
    """
    
    def __init__(self):
        self.classifier = TaskClassifier()
        self.providers = PROVIDER_CONFIGS
        self.routes = ROUTE_POLICIES
        
        # Provider clients
        self.clients: Dict[LLMProvider, BaseProviderClient] = {
            LLMProvider.CLAUDE_OPUS: AnthropicClient(),
            LLMProvider.CLAUDE_SONNET: AnthropicClient(),
            LLMProvider.GEMINI_PRO: GeminiClient(),
            LLMProvider.GEMINI_FLASH: GeminiClient(),
            LLMProvider.OPENAI_CODEX: OpenAIClient(),
            LLMProvider.OPENAI_GPT4O: OpenAIClient(),
            LLMProvider.OPENAI_GPT4O_MINI: OpenAIClient(),
        }
        
        # Storage
        self.storage_dir = PROJECT_ROOT / ".hive-mind" / "llm_router"
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        
        # Usage tracking: by provider, by task, by agent
        self._usage_by_provider: Dict[str, Dict[str, Any]] = {}
        self._usage_by_task: Dict[str, Dict[str, Any]] = {}
        self._usage_by_agent: Dict[str, Dict[str, Any]] = {}
        self._route_activations: List[Dict[str, Any]] = []
        
        self._load_state()
        logger.info(f"MultiGatewayRouter initialized with {len(self.providers)} providers")
    
    def _load_state(self):
        """Load persisted usage state."""
        state_file = self.storage_dir / "state.json"
        if state_file.exists():
            try:
                with open(state_file) as f:
                    data = json.load(f)
                self._usage_by_provider = data.get("by_provider", {})
                self._usage_by_task = data.get("by_task", {})
                self._usage_by_agent = data.get("by_agent", {})
            except Exception as e:
                logger.warning(f"Failed to load state: {e}")
    
    def _save_state(self):
        """Persist usage state."""
        state_file = self.storage_dir / "state.json"
        try:
            with open(state_file, 'w') as f:
                json.dump({
                    "by_provider": self._usage_by_provider,
                    "by_task": self._usage_by_task,
                    "by_agent": self._usage_by_agent,
                    "last_updated": datetime.now(timezone.utc).isoformat()
                }, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save state: {e}")
    
    def _is_provider_available(self, key: str) -> Tuple[bool, Optional[str]]:
        """Check if provider is available."""
        if key not in self.providers:
            return False, f"Unknown provider: {key}"
        
        config = self.providers[key]
        
        if not config.enabled:
            return False, "Provider disabled"
        
        api_key = os.getenv(config.api_key_env)
        if not api_key:
            return False, f"Missing {config.api_key_env}"
        
        return True, None
    
    def _get_provider_chain(
        self, 
        task_type: TaskType, 
        request: LLMRequest
    ) -> List[str]:
        """Get ordered provider chain for task type, filtering by capabilities."""
        route = self.routes.get(task_type, self.routes[TaskType.GENERIC])
        chain = []
        
        for key in route.provider_keys:
            available, reason = self._is_provider_available(key)
            if not available:
                logger.debug(f"Skipping {key}: {reason}")
                continue
            
            config = self.providers[key]
            
            # Filter by required capabilities
            if request.require_vision and not config.supports_vision:
                continue
            if request.require_json and not config.supports_json_mode:
                continue
            
            chain.append(key)
        
        return chain
    
    def _calculate_cost(
        self, 
        config: ProviderConfig, 
        input_tokens: int, 
        output_tokens: int
    ) -> float:
        """Calculate cost estimate."""
        input_cost = (input_tokens / 1_000_000) * config.input_price_per_million
        output_cost = (output_tokens / 1_000_000) * config.output_price_per_million
        return input_cost + output_cost
    
    def _update_usage(
        self, 
        provider_key: str, 
        task_type: TaskType, 
        agent_name: str,
        input_tokens: int,
        output_tokens: int,
        cost: float,
        success: bool
    ):
        """Update usage tracking."""
        # By provider
        if provider_key not in self._usage_by_provider:
            self._usage_by_provider[provider_key] = {
                "requests": 0, "input_tokens": 0, "output_tokens": 0,
                "total_cost": 0.0, "errors": 0, "fallbacks_caught": 0
            }
        self._usage_by_provider[provider_key]["requests"] += 1
        self._usage_by_provider[provider_key]["input_tokens"] += input_tokens
        self._usage_by_provider[provider_key]["output_tokens"] += output_tokens
        self._usage_by_provider[provider_key]["total_cost"] += cost
        if not success:
            self._usage_by_provider[provider_key]["errors"] += 1
        
        # By task
        task_key = task_type.value
        if task_key not in self._usage_by_task:
            self._usage_by_task[task_key] = {
                "requests": 0, "total_cost": 0.0, "providers_used": {}
            }
        self._usage_by_task[task_key]["requests"] += 1
        self._usage_by_task[task_key]["total_cost"] += cost
        if provider_key not in self._usage_by_task[task_key]["providers_used"]:
            self._usage_by_task[task_key]["providers_used"][provider_key] = 0
        self._usage_by_task[task_key]["providers_used"][provider_key] += 1
        
        # By agent
        if agent_name not in self._usage_by_agent:
            self._usage_by_agent[agent_name] = {
                "requests": 0, "total_cost": 0.0, "tasks": {}
            }
        self._usage_by_agent[agent_name]["requests"] += 1
        self._usage_by_agent[agent_name]["total_cost"] += cost
        if task_key not in self._usage_by_agent[agent_name]["tasks"]:
            self._usage_by_agent[agent_name]["tasks"][task_key] = 0
        self._usage_by_agent[agent_name]["tasks"][task_key] += 1
    
    async def complete(self, request: LLMRequest) -> LLMResponse:
        """
        Complete request with intelligent routing and fallback.
        
        1. Classify task type
        2. Get provider chain for task
        3. Execute through chain until success
        4. Track usage and return response
        """
        # Classify task
        task_type, classification_source = self.classifier.classify(request)
        
        logger.info(
            f"Routing {request.agent_name}/{request.operation} → "
            f"{task_type.value} (source: {classification_source.value})"
        )
        
        # Get provider chain
        chain = self._get_provider_chain(task_type, request)
        
        if not chain:
            return LLMResponse(
                content="[ERROR: No available providers for this task type]",
                provider="none",
                model="none",
                task_type=task_type.value,
                classification_source=classification_source.value,
                route_name=task_type.value,
                fallback_used=True,
                fallback_reason="No providers available"
            )
        
        route = self.routes.get(task_type, self.routes[TaskType.GENERIC])
        last_error = None
        primary_provider = chain[0] if chain else None
        
        for attempt, provider_key in enumerate(chain, 1):
            if attempt > route.max_total_attempts:
                break
            
            config = self.providers[provider_key]
            client = self.clients[config.provider]
            
            try:
                logger.info(f"Attempt {attempt}: {config.name} ({config.model})")
                
                start_time = time.time()
                content, input_tokens, output_tokens = await client.complete(config, request)
                latency_ms = (time.time() - start_time) * 1000
                
                cost = self._calculate_cost(config, input_tokens, output_tokens)
                
                # Update usage
                self._update_usage(
                    provider_key, task_type, request.agent_name,
                    input_tokens, output_tokens, cost, success=True
                )
                
                is_fallback = attempt > 1
                
                if is_fallback:
                    self._usage_by_provider[provider_key]["fallbacks_caught"] += 1
                    logger.warning(f"Fallback success: {primary_provider} → {provider_key}")
                
                self._save_state()
                
                return LLMResponse(
                    content=content,
                    provider=config.name,
                    model=config.model,
                    task_type=task_type.value,
                    classification_source=classification_source.value,
                    route_name=route.description,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    latency_ms=latency_ms,
                    fallback_used=is_fallback,
                    fallback_reason=str(last_error) if is_fallback else None,
                    attempt_number=attempt,
                    cost_estimate=cost
                )
                
            except Exception as e:
                error_msg = str(e)
                logger.error(f"{config.name} failed: {error_msg}")
                
                self._update_usage(
                    provider_key, task_type, request.agent_name,
                    0, 0, 0.0, success=False
                )
                
                last_error = error_msg
                continue
        
        # All providers failed
        logger.error(f"All providers exhausted for {task_type.value}")
        self._save_state()
        
        return LLMResponse(
            content=f"[ERROR: All providers failed. Last error: {last_error}]",
            provider="none",
            model="none",
            task_type=task_type.value,
            classification_source=classification_source.value,
            route_name=route.description,
            fallback_used=True,
            fallback_reason=f"All providers exhausted: {last_error}"
        )
    
    def get_status(self) -> Dict[str, Any]:
        """Get router status and usage statistics."""
        providers_status = []
        
        for key, config in self.providers.items():
            available, reason = self._is_provider_available(key)
            usage = self._usage_by_provider.get(key, {})
            
            providers_status.append({
                "key": key,
                "name": config.name,
                "model": config.model,
                "available": available,
                "unavailable_reason": reason,
                "usage": usage
            })
        
        # Calculate cost by task type
        task_costs = {}
        for task_type in TaskType:
            task_data = self._usage_by_task.get(task_type.value, {})
            task_costs[task_type.value] = {
                "requests": task_data.get("requests", 0),
                "cost": task_data.get("total_cost", 0.0),
                "preferred_providers": list(task_data.get("providers_used", {}).keys())[:3]
            }
        
        return {
            "providers": providers_status,
            "routes": {k.value: v.description for k, v in self.routes.items()},
            "task_costs": task_costs,
            "agent_usage": self._usage_by_agent,
            "total_cost": sum(p.get("total_cost", 0) for p in self._usage_by_provider.values())
        }
    
    def print_status(self):
        """Print formatted status report."""
        print("\n" + "=" * 70)
        print("  MULTI-GATEWAY LLM ROUTER STATUS")
        print("=" * 70)
        
        status = self.get_status()
        
        print("\n  PROVIDERS:")
        for p in status["providers"]:
            icon = "✅" if p["available"] else "❌"
            usage = p.get("usage", {})
            cost = usage.get("total_cost", 0)
            requests = usage.get("requests", 0)
            print(f"    {icon} {p['name']} ({p['model']})")
            print(f"       Requests: {requests} | Cost: ${cost:.4f}")
            if not p["available"]:
                print(f"       Reason: {p['unavailable_reason']}")
        
        print("\n  ROUTES:")
        for task, desc in status["routes"].items():
            task_data = status["task_costs"].get(task, {})
            print(f"    • {task}: {desc}")
            print(f"      Requests: {task_data.get('requests', 0)} | Cost: ${task_data.get('cost', 0):.4f}")
        
        print(f"\n  TOTAL COST: ${status['total_cost']:.4f}")
        print("=" * 70)


# =============================================================================
# SINGLETON ACCESS
# =============================================================================

_router: Optional[MultiGatewayRouter] = None


def get_router() -> MultiGatewayRouter:
    """Get or create the global router instance."""
    global _router
    if _router is None:
        _router = MultiGatewayRouter()
    return _router


# =============================================================================
# CLI
# =============================================================================

async def main():
    """Test the multi-gateway router."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Multi-Gateway LLM Router")
    parser.add_argument("--status", action="store_true", help="Show router status")
    parser.add_argument("--test", type=str, help="Test with task type: planning, creative, implementation, etc.")
    
    args = parser.parse_args()
    
    router = get_router()
    
    if args.status:
        router.print_status()
    
    if args.test:
        task_type = TaskType(args.test) if args.test in [t.value for t in TaskType] else None
        
        prompts = {
            "planning": "Design the architecture for a multi-tenant SaaS platform",
            "creative": "Generate hero section copy for an AI consulting landing page",
            "implementation": "Write a Python function to validate JWT tokens",
            "debugging": "Fix this error: TypeError: Cannot read property 'map' of undefined",
            "api_integration": "Connect to the HubSpot API and sync contacts",
        }
        
        prompt = prompts.get(args.test, "Hello, how are you?")
        
        request = LLMRequest(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            agent_name="TEST",
            task_type=task_type
        )
        
        print(f"\nTesting with task type: {args.test}")
        print(f"Prompt: {prompt[:50]}...")
        
        response = await router.complete(request)
        
        print(f"\nResponse ({response.provider}):")
        print(response.content[:500])
        print(f"\nTask Type: {response.task_type}")
        print(f"Classification: {response.classification_source}")
        print(f"Fallback Used: {response.fallback_used}")
        print(f"Latency: {response.latency_ms:.0f}ms")
        print(f"Cost: ${response.cost_estimate:.6f}")


if __name__ == "__main__":
    asyncio.run(main())
