# Runbook d'exploitation — ShopFlow Academy (Mac + Docker Compose + Cloudflare Tunnel)

Clone de travail : `~/Developer/shopflow-academy`. Projet Compose `shopflow-academy` (services `postgres`, `migrate`, `backend`, `frontend`, `gateway`, `backup`). Gateway : `127.0.0.1:3080` uniquement. Sauvegardes : `~/Developer/shopflow-backups` (hors dépôt, hors iCloud, disque chiffré FileVault, fichiers 0600). n8n (projet `wordpress`) et le connecteur `cloudflared` (LaunchDaemon) ne font **pas** partie de ShopFlow : ne jamais les arrêter ni les modifier.

## Avant chaque cours (5 minutes)

1. Mac sur secteur, Docker Desktop lancé. La veille système est réglée sur « jamais » (`pmset -g` : `sleep 0`) ; sinon garder un terminal avec `caffeinate -dimsu` ouvert pendant le cours.
2. `python3 scripts/ops_status.py` → « Prêt pour le cours. » (conteneurs, santé, sauvegarde < 7 h, disque, URL publique, n8n inchangé).
3. Depuis un téléphone en 4G : ouvrir `https://shopflow.rapidfox.io` et se connecter.
4. Dans « Suivi de classe », vérifier que la séquence est « Ouverte » et que la cohorte attendue est attribuée.

## Démarrer, arrêter, redéployer

| Action | Commande |
|---|---|
| Démarrer / après redémarrage du Mac | `cd ~/Developer/shopflow-academy && docker compose up -d --wait` |
| Arrêter ShopFlow seul | `docker compose stop` (ou `down` **sans** `-v`) |
| Redéployer une branche | `git switch <branche> && docker compose up -d --build --wait && python3 scripts/smoke_public.py http://127.0.0.1:3080` |
| Journaux | `docker compose logs --tail 200 backend` (rotation 3 × 10 Mo par service) |
| État complet | `python3 scripts/ops_status.py` |

Les migrations s'appliquent automatiquement (service `migrate`) ; faire une sauvegarde manuelle avant tout redéploiement qui ajoute une migration.

## Sauvegardes et restauration

- **Automatique** : le service `backup` fait un `pg_dump` vérifié (`pg_restore --list`) au démarrage puis toutes les 6 h, avec somme SHA-256 et `last-backup.json` ; il garde les 28 dernières (`*-auto.dump`, 7 jours) et ne supprime jamais les sauvegardes manuelles. Réglages : `BACKUP_DIR`, `BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP` dans `.env`.
- **Manuelle** (avant une opération) : `docker compose exec -T backup sh /ops/backup.sh once`.
- **Restauration testée** sans toucher à la base en service : `python3 scripts/restore_check.py` (conteneur jetable sans réseau, comparaison table par table, conteneur supprimé). À lancer au moins une fois par semaine ; aussi exécuté par la CI.
- **Copie hors du Mac** (recommandé, décision du propriétaire) : copier régulièrement `~/Developer/shopflow-backups` sur un support chiffré. Ces fichiers contiennent des données personnelles des étudiants : jamais dans Git, jamais par e-mail.

### Restaurer réellement la base (incident grave uniquement)

1. `docker compose exec -T backup sh /ops/backup.sh once` (sauvegarder l'état actuel, même abîmé).
2. `docker compose stop backend gateway` (les étudiants voient la page indisponible).
3. Choisir le fichier : `ls -1t ~/Developer/shopflow-backups/*.dump | head`.
4. `docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < ~/Developer/shopflow-backups/<fichier>.dump`
5. `docker compose up -d --wait` puis `python3 scripts/smoke_public.py http://127.0.0.1:3080` et vérification du suivi de classe.

## Incidents

| Symptôme | Cause probable | Action |
|---|---|---|
| `shopflow.rapidfox.io` : erreur Cloudflare 1033/502 | Mac en veille, Docker arrêté, ou connecteur coupé | Réveiller le Mac, `docker compose up -d --wait`, `python3 scripts/ops_status.py`. Si n8n répond aussi en erreur, le connecteur `cloudflared` est en cause : `sudo launchctl kickstart -k system/com.cloudflare.cloudflared` (coupe n8n quelques secondes). |
| Page « Academy momentanément indisponible » | backend ou base arrêtés | `docker compose ps`, `docker compose logs --tail 100 backend postgres`, `docker compose up -d --wait` |
| Un étudiant est bloqué « trop de tentatives » | 5 mots de passe faux en 15 min | Attendre 1 minute (verrou par identifiant). |
| « Beaucoup d’essais en peu de temps » | plus de 20 réponses/min | Attendre 1 minute (protection voulue). |
| Mission verrouillée pour un étudiant | prérequis non réussi | Suivi de classe → Détail → « Débloquer pour cet étudiant » (audité). |
| Besoin d'arrêter la classe | — | Suivi de classe → « Mettre en pause » (les réponses sont refusées, la relecture reste possible), puis « Reprendre la séquence ». |
| Disque presque plein | journaux ou sauvegardes | `docker system df` ; supprimer d'anciennes sauvegardes **manuelles** après copie hors du Mac. |

## Retour arrière de la publication (sans toucher à n8n)

1. Tableau de bord Cloudflare → Networks → Tunnels → tunnel existant → supprimer **uniquement** la route `shopflow.rapidfox.io` (et le CNAME `shopflow` s'il reste).
2. `docker compose stop` dans `~/Developer/shopflow-academy` si nécessaire.
3. `curl -sI https://n8n.rapidfox.io` doit toujours répondre `302` vers `mryoshq.cloudflareaccess.com`.

## Sécurité

- Le jeton du connecteur `cloudflared` est apparu dans une sortie d'outil Codex : **risque accepté** par le propriétaire le 27/10/2026. À planifier hors cours : tableau de bord → tunnel → *Refresh token*, puis mise à jour du LaunchDaemon (coupure brève de n8n).
- Comptes `demo.*` actifs dans la base publiée (mots de passe aléatoires hors Git) : les désactiver avant le premier cours réel si la démonstration n'est plus utile.
- Avant un cours réel : vérifier qu'aucun compte enseignant inutile n'est actif, puis attribuer le cours publié à la cohorte réelle depuis le studio.
