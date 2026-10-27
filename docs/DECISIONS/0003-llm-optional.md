# ADR-0003 — IA optionnelle à fournisseur remplaçable
Status: Accepted (proposal), 2026-10-27.
Decision: Backend TutorProvider interface; disabled by default, static hints available; OpenRouter-compatible HTTP adapter can be implemented when `AI_PROVIDER=openrouter`; never direct browser calls. No LiteLLM proxy required initially.
Rationale: classroom reliability and freedom to change models. Fallback = deterministic static hints, not hallucinated answer.
