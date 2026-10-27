# Progression vérifiée du projet — à mettre à jour à chaque session IA

**Date : 2026-10-27 · État : kit documentaire v2.0, AUCUN code applicatif testé · Branche/PR : non définies.**

## Livré et vérifiable dans le ZIP

- [x] CPS révisé **plateforme + studio d'abord, cours réels ensuite**.
- [x] Prompt Codex exhaustif import ZIP + connexion GitHub + implémentation et CI.
- [x] Runbook **Cloudflare Tunnel seulement** pour `shopflow.rapidfox.io`, sans perturber `n8n.rapidfox.io`.
- [x] Backlog P0 plateforme/P1 extensions/P2 cours ; neuf skills et conventions de handoff.
- [ ] Monorepo React/FastAPI effectif construit et testé.
- [ ] Authentification, studio, correcteur, dashboards.
- [ ] Déploiement public et vérification externe.

## Prochain lot réel

**P0-01** — monorepo React+FastAPI+Postgres, gateway local loopback, Docker Compose, health, CI applicative initiale et tests. Ne pas prétendre que le fichier Compose du kit démarre déjà l'Academy.

## Registre des sessions

| Date | Lot | Branche / commit / PR | Tests exécutés | Résultat / risques |
|---|---|---|---|---|
| 2026-10-27 | KIT-02 | ZIP local sans dépôt GitHub | `python3 scripts/verify_kit.py` PASS 0 erreurs ; `python3 -m unittest discover -s tests -v` PASS 4 tests | Kit documentaire validé ; aucune application / aucun conteneur testé |
