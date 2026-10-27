# ADR-0001 — Monolithe modulaire sur Mac avec Docker Compose

Status: Accepted (proposal), 2026-10-27 (révision 2.0).

Decision: React/TypeScript + FastAPI + PostgreSQL, MySQL activable comme lab, gateway local dans Compose, déploiement **Mac + Cloudflare Tunnel uniquement** (cf ADR-0005). Interface de studio de cours indépendante du lecteur et du grading, publications versionnées et immuables.

Rationale: 10 étudiants, aucune installation étudiante, éditeur enseignant, sécurité et évolution continue avec coût maîtrisé. Ni VPS, ni Kubernetes, ni Docker séparé par élève pour parcours guidé.

Consequence: futurs labs/runner optionnels isolés ; migration vers autre mode d'hébergement seulement par **nouvel ADR explicite**.
