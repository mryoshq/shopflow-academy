---
name: grading-engine
description: Concevoir scoring déterministe versionné, bonus séparés, preview non notée, idempotence, audit et tests de concurrence.
---

# grading-engine

Read CPS and grading ADR. Correct generic P0 activity types **before loading real course content**. Define a private grading contract and distinct sanitized student payload. Preview in teacher studio must **never award points**. Use immutable published mission version, per-attempt idempotency key, transaction and unique constraint to prevent double award, best-score rule configurable. Bonus separate; actual /100 rubric only after course publication, 25+75 is future Oct 28 course specification. Test concurrent duplicate submits, wrong-user IDOR, teacher-only export, edits after publication, replayability and scores. AI never grades.

## Sortie obligatoire
- Lot ID, fichiers modifiés, critères d'acceptation.
- Commandes de tests + statut **PASS/FAIL/NOT RUN** réel.
- Risques, demande d'accord humain éventuelle, lien issue/PR si disponible.
- Mise à jour `docs/PROGRESS.md` et `docs/HANDOFF.md`.
