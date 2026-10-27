---
name: mission-author
description: Définir les types de missions génériques et produire 2–3 démos pour tester le studio; cours réels plus tard.
---

# mission-author

During P0, implement/test **2–3 clearly labeled demonstration missions**, not the 24 real exercises. Use CPS for activity schema and authoring flow: choice, multi-choice, reorder, hints and feedback. Provide deterministic fixtures (e.g. shipping fees 70 vs 100), teacher/private correction and student/public sanitized payload, preview non-scoring and publication versioning. Only in P2 transform actual approved course materials into mission JSON through the studio. For each published mission enforce schema validity, objective IDs, scoring constraints, accessible wording and no hidden answers in student payload; optional code challenges always bonuses.

## Sortie obligatoire
- Lot ID, fichiers modifiés, critères d'acceptation.
- Commandes de tests + statut **PASS/FAIL/NOT RUN** réel.
- Risques, demande d'accord humain éventuelle, lien issue/PR si disponible.
- Mise à jour `docs/PROGRESS.md` et `docs/HANDOFF.md`.
