---
name: session-handoff
description: Assurer la continuité Codex/GitHub entre sessions, modèles, PR avec faits vérifiés, état des tests et reprise exacte.
---

# session-handoff

At end of EVERY substantial session inspect git status, commit/PR and CI. Update PROGRESS strictly from verified evidence, replace HANDOFF with current backlog ID, PR URL, modified files, exact tests/results, risks, next single instruction and approval blockers. Remind future agent: **P0 platform/studio first, P2 course contents later; Cloudflare Tunnel on Mac only; n8n preserved**. Never claim push, deploy or tests without confirmation. Avoid including credentials. Stage files deliberately.

## Sortie obligatoire
- Lot ID, fichiers modifiés, critères d'acceptation.
- Commandes de tests + statut **PASS/FAIL/NOT RUN** réel.
- Risques, demande d'accord humain éventuelle, lien issue/PR si disponible.
- Mise à jour `docs/PROGRESS.md` et `docs/HANDOFF.md`.
