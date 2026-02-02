"""
Scaling Up Platform v2 - Core Module
=====================================

Core infrastructure components including the Multi-Gateway LLM Router.
"""

from .llm import get_router, LLMRequest, LLMResponse, TaskType

__all__ = [
    "get_router",
    "LLMRequest", 
    "LLMResponse",
    "TaskType",
]
