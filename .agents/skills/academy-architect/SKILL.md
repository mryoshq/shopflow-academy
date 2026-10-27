---
name: academy-architect
description: Concevoir les frontières React/FastAPI/PostgreSQL, le studio de cours versionnés, les API, la sécurité et Docker Mac + Cloudflare Tunnel.
---

# academy-architect

Read CPS, architecture and ADRs. Prioritize **course studio and generic platform before final course content**. Prepare modular data models and public/student versus private/teacher projections. Build one vertical backlog slice with schema migration, authz, API, UI when applicable, and real tests. Keep Mac Docker Compose + Cloudflare Tunnel as the **only deployment design**, protect existing n8n, no VPS/Kubernetes. Keep DB ports private. New major design decisions require ADR. Do not present unrun Compose/CI as verified.

## Sortie obligatoire
- Lot ID, fichiers modifiés, critères d'acceptation.
- Commandes de tests + statut **PASS/FAIL/NOT RUN** réel.
- Risques, demande d'accord humain éventuelle, lien issue/PR si disponible.
- Mise à jour `docs/PROGRESS.md` et `docs/HANDOFF.md`.
