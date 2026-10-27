# ADR-0010 — Publication anticipée de shopflow.rapidfox.io

**Date :** 2026-10-27
**Statut :** accepté (autorisation écrite du propriétaire, session Claude Code du 27/10/2026)

## Contexte

Le BACKLOG place la publication Cloudflare dans P0-10, après le lecteur étudiant, la notation et le dashboard. Le propriétaire veut que `https://shopflow.rapidfox.io` montre l'état le plus avancé de la plateforme pendant le développement, pour tester depuis un téléphone et un réseau externe. `n8n.rapidfox.io` tourne déjà sur le même Mac via un tunnel Cloudflare géré depuis le tableau de bord (connecteur `cloudflared` lancé par LaunchDaemon avec un jeton, sans `config.yml`).

## Décision

- Publier dès maintenant via **une seule route supplémentaire** sur le tunnel existant (cas A de `DEPLOY-RAPIDFOX.md`) : `shopflow.rapidfox.io` → `HTTP` → `127.0.0.1:3080`. Aucune autre modification du tunnel, du DNS ni de n8n.
- La stack Compose tourne en `APP_ENV=production` : cookies `__Host-` `Secure`/`HttpOnly`/`SameSite=Lax`, schéma OpenAPI masqué, CSP et en-têtes de sécurité dans le gateway. L'origine locale `http://127.0.0.1:3080` reste autorisée explicitement par `APP_EXTRA_ORIGINS` pour l'enseignant (Chrome).
- La stack publiée suit la branche de travail la plus avancée (PR empilées non fusionnées) ; chaque redéploiement est suivi de `scripts/smoke_public.py`.
- Le jeton du connecteur, apparu dans une sortie d'outil Codex, est **conservé** sur décision du propriétaire (risque accepté). Sa rotation reste une action future.

## Conséquences

- P0-10 reste ouvert : sauvegarde automatisée, restauration testée, charge 10 utilisateurs et runbook complet.
- Le site est aussi disponible que le Mac : veille, coupure réseau ou arrêt de Docker Desktop le rendent inaccessible (voir `OPERATIONS.md`).
- Aucun cours réel n'est publié et aucun cours n'est attribué aux dix vrais étudiants avant P2 ; seuls des comptes et contenus de démonstration servent aux tests.
- Retour arrière : supprimer uniquement la route/CNAME `shopflow`, arrêter uniquement le projet Compose `shopflow-academy`.
