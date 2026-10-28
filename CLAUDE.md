@AGENTS.md

# Claude Code — règles propres à ce dépôt

Les règles de `AGENTS.md` s'appliquent telles quelles ; « Codex » y désigne l'agent en charge, donc Claude Code.

## Ordre de lecture en début de session
`docs/HANDOFF.md` (reprise unique) → `docs/PROGRESS.md` → `docs/BACKLOG.md` → `docs/CPS.md` → ADR utiles dans `docs/DECISIONS/` → skill concerné dans `.claude/skills/`.

## Interdits sans accord écrit du propriétaire dans la conversation
- Fusion de PR, `git push --force`, suppression de branche distante, réécriture d'historique.
- Toute modification Cloudflare (tunnel, DNS, Access), `cloudflared`, `n8n.rapidfox.io` et le projet Compose `wordpress`.
- Lire, afficher, copier dans Git `.env`, `.env.*` (sauf `.env.example`), `.local/**`, `~/.cloudflared/**`, tout jeton.
- `scripts/upsert_teacher.py` (régénère le mot de passe enseignant) ; `scripts/seed_demo.py` si `.local/demo-credentials.json` existe.
- `docker compose down -v`, `docker volume rm` ; assigner un cours ou écrire aux dix vrais étudiants ; contenu de cours définitif (P2).

## Commandes de test
- Backend : `cd backend && ../.venv/bin/python -m pytest -q` (Python 3.12).
- Frontend : `cd frontend && npm run test -- --maxWorkers=1 && npm run build`.
- E2E (stack lancée) : `cd frontend && npm run test:e2e` — comptes de démo uniquement.
- Stack : `docker compose up -d --build --wait` puis `python3 scripts/smoke_public.py http://127.0.0.1:3080` (et sans argument pour l'URL publique).
- Kit documentaire : `python3 scripts/verify_kit.py`.

## Preuve
Toute affirmation PASS cite la commande réellement exécutée ; sinon `NOT RUN` avec la raison. Au plus 3 cycles de réparation sur un même blocage, puis journaliser et passer à la suite.

## Fin de lot
Lot · branche, commit, PR, issue · fichiers · critères couverts · commandes PASS/FAIL/NOT RUN · risques · accord humain nécessaire · prochaine action **unique** (dans `docs/HANDOFF.md`). Mettre à jour `docs/PROGRESS.md`, `docs/HANDOFF.md`, `CHANGELOG.md` et pousser avant de commencer le lot suivant.

## Économie de tokens
- Ne jamais lire `package-lock.json`, `node_modules/`, `dist/`, `.venv/`, `playwright-report/`, `test-results/` ni de gros logs en entier : `rg` ciblé, `git diff --stat`, `gh pr diff --name-only`, plages de lignes.
- Tests en sortie courte (`pytest -q`, `| tail`) ; ne relire que les échecs.
- Une phase = un objectif ; proposer `/compact` après chaque phase documentée dans `HANDOFF.md`.
- Sous-agents seulement pour des lectures parallèles indépendantes ; jamais deux agents qui écrivent les mêmes fichiers.
- Réponses courtes : résultats, preuves, risques, décisions attendues.
