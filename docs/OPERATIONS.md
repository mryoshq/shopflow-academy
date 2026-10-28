# Exploitation — Mac + Cloudflare Tunnel, coût infra plafonné à 50 €/mois

**Choix acté : une seule stratégie de publication**, un Mac disposant de Docker Desktop et **Cloudflare Tunnel** vers `shopflow.rapidfox.io`. `n8n.rapidfox.io` existe déjà sur Cloudflare : préserver son service, ses routes et son tunnel. La présence d'un autre Mac pour héberger l'Academy n'est pas une nouvelle stratégie : ce serait toujours Docker sur Mac via Cloudflare Tunnel.

## Dépenses

- Le Mac et l'abonnement Internet existent déjà ; pas de VPS commandé.
- GitHub, Codex (selon abonnement/quotas disponibles), Docker Desktop (vérifier le régime de licence selon usage) et Cloudflare Tunnel selon leurs conditions propres ; ne suppose pas un engagement payant.
- **Plafond de 50 €/mois réservé à l'hébergement**, pas aux appels API LLM ; aucune dépense ne doit être déclenchée automatiquement.
- Stockage des sauvegardes et éventuels médias peuvent générer un coût : vérifier avant activation.

## Services du projet

`gateway` sur **127.0.0.1:3080** côté hôte si port libre ; `frontend` et `backend` sur réseaux Compose ; `postgres` privé et `mysql` facultatif derrière profil `labs`. **N'ajouter ni n8n à cette stack ni cloudflared automatiquement tant que l'inventaire de son mode existant n'a pas été effectué.** Si tunnel partagé et cloudflared sur Mac, envoyer le nouveau hostname vers gateway. Si n8n sur un autre serveur, créer un tunnel Academy sur son Mac après validation.

## Déploiement opérationnel

1. Vérifier sauvegardes et états de Git/Compose, configuration hors dépôt et tests locaux.
2. `docker compose config`, construction et lancement local, migration contrôlée et smoke test des deux rôles.
3. Sauvegarde avec protection, simulation restauration en environnement de test, contrôle des volumes.
4. Après accord, créer/activer **uniquement la route Cloudflare ShopFlow**, vérifier `n8n` avant/après et tester depuis un réseau extérieur.
5. Surveillance de santé et logs, plan de récupération et rollback indépendant de n8n.

## Risques explicites

Un tunnel Cloudflare **ne rend pas** une machine disponible si le Mac dort ou tombe en panne. Empêcher la mise en veille, stabiliser réseau/alimentation, tester l'upload et la connexité distancielle. Ne pas confondre le `localhost` d'un `cloudflared` dans Docker avec `localhost` de macOS ; voir `docs/DEPLOY-RAPIDFOX.md`. Pas de base exposée, pas de socket Docker exposé. Aucune exécution Python étudiante arbitraire sur Mac.

## Vérification

10 utilisateurs de test (9 locaux, 1 extérieur une fois tunnel publié), isolation inter-comptes, restauration, publication/aperçu/version d'une mission, cookies et TLS, réponse du service n8n inchangée. Tout test non exécuté reste `NOT RUN`.

## Runbook courant (Claude Code, 27/10/2026)

Clone de travail : `~/Developer/shopflow-academy` (l'ancien clone dans `~/Documents/Codex/…` ne doit plus être utilisé). Projet Compose `shopflow-academy`, volume `shopflow-academy_pg_data`.

- **Démarrer / redéployer :** `cd ~/Developer/shopflow-academy && git switch <branche> && docker compose up -d --build --wait && python3 scripts/smoke_public.py http://127.0.0.1:3080`, puis `python3 scripts/smoke_public.py` pour l'URL publique.
- **Arrêter ShopFlow seul :** `docker compose stop` (ou `down` **sans** `-v`). Ne jamais toucher au projet `wordpress` (n8n) ni au LaunchDaemon `cloudflared`.
- **Sauvegarde automatique (P0-10) :** service `backup` toutes les 6 h, voir `docs/RUNBOOK.md`.
- **Sauvegarde manuelle :** `docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > ~/Developer/shopflow-backups/academy-$(date +%Y%m%d-%H%M%S).dump && chmod 600 ~/Developer/shopflow-backups/*.dump`. Sauvegarde automatique et restauration testée : P0-10.
- **Si le Mac redémarre :** Docker Desktop doit démarrer à l'ouverture de session (Réglages Docker → General → *Start Docker Desktop when you sign in*) ; les services ont `restart: unless-stopped`. `cloudflared` est un LaunchDaemon système et redémarre seul. Vérifier avec le smoke test.
- **Empêcher la veille pendant les cours (proposé, non appliqué) :** `caffeinate -dimsu` dans un terminal ouvert pendant la séance, ou durablement `sudo pmset -c sleep 0 disksleep 0` (secteur uniquement) ; écran verrouillable sans veille système.
- **Accès local de l'enseignant :** `http://127.0.0.1:3080` fonctionne dans Chrome (cookies `Secure` acceptés sur loopback). Safari peut refuser ces cookies en HTTP : utiliser alors `https://shopflow.rapidfox.io`.
