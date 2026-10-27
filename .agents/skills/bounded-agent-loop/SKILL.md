---
name: bounded-agent-loop
description: Boucle Codex GitHub bornée planifier→coder→tester→corriger→documenter pour une issue/lot avec suivi et garde-fous.
---

# bounded-agent-loop

Read AGENTS.md, HANDOFF, PROGRESS, backlog, git status and CI. Pick **one P0 platform task first** (course studio before full courses), implement vertically, run actual tests and inspect failures; retry <=3 times for same blocker, then document. Commit on feature branch, prepare PR, update progress and handoff. Never create recursive unattended agent loop, perform public Cloudflare changes, buy hosting, touch n8n, merge or overwrite data without human approval. Avoid parallel agents changing same file.

## Sortie obligatoire
- Lot ID, fichiers modifiés, critères d'acceptation.
- Commandes de tests + statut **PASS/FAIL/NOT RUN** réel.
- Risques, demande d'accord humain éventuelle, lien issue/PR si disponible.
- Mise à jour `docs/PROGRESS.md` et `docs/HANDOFF.md`.
