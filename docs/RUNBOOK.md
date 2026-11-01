# Runbook d'exploitation — Rapidfox Academy (shopflow.rapidfox.io, Mac + Docker Compose + Cloudflare Tunnel)

Clone de travail : `~/Developer/shopflow-academy`. Projet Compose `shopflow-academy` (services `postgres`, `migrate`, `backend`, `frontend`, `gateway`, `backup`, `labdb`, `lab-init`). `labdb` est la base de laboratoire des exercices SQL (données fictives, non sauvegardée, rechargée à chaque import du cours, ADR-0017). Gateway : `127.0.0.1:3080` uniquement. Sauvegardes : `~/Developer/shopflow-backups` (hors dépôt, hors iCloud, disque chiffré FileVault, fichiers 0600). n8n (projet `wordpress`) et le connecteur `cloudflared` (LaunchDaemon) ne font **pas** partie de ShopFlow : ne jamais les arrêter ni les modifier.

**Deux stacks, jamais confondues** :

| | Production | Stack de test |
|---|---|---|
| Projet Compose | `shopflow-academy` | `shopflow-academy-test` |
| Adresse | `127.0.0.1:3080` → `https://shopflow.rapidfox.io` | `127.0.0.1:3180` (locale seulement) |
| Configuration | `.env` (secrets, jamais affiché) | `config/test-stack.env` (valeurs fictives, versionné) |
| Base | volume `shopflow-academy_pg_data`, données réelles | volume `shopflow-academy-test_pg_data`, jetable |
| Comptes | propriétaire + étudiants `@ynov.com` | comptes fictifs `demo.*` (`.local/test-stack-credentials.json`) |
| Sauvegardes | `~/Developer/shopflow-backups` | `./.backups-test` (ignoré par Git) |

E2E, charge et persistance ne tournent **que** sur la stack de test : `load_test.py`, `persistence_check.py` et Playwright refusent une adresse de production avant toute requête.

## Avant chaque cours (5 minutes)

1. Mac sur secteur, Docker Desktop lancé. La veille système est réglée sur « jamais » (`pmset -g` : `sleep 0`) ; sinon garder un terminal avec `caffeinate -dimsu` ouvert pendant le cours.
2. `python3 scripts/ops_status.py` → « Prêt pour le cours. » (conteneurs, santé, sauvegarde < 7 h, disque, URL publique, n8n inchangé).
3. Depuis un téléphone en 4G : ouvrir `https://shopflow.rapidfox.io` et se connecter.
4. Dans « Ma classe », vérifier que la séquence est « Ouverte » ; pendant le cours, « Ouvrir le bloc suivant » toutes les ~15 minutes (repère visible par vous seul, rien ne se ferme automatiquement) et traiter les demandes d'aide.

## Démarrer, arrêter, redéployer

| Action | Commande |
|---|---|
| Démarrer / après redémarrage du Mac | `cd ~/Developer/shopflow-academy && docker compose up -d --wait` |
| Arrêter ShopFlow seul | `docker compose stop` (ou `down` **sans** `-v`) |
| Redéployer une branche (coupure réduite, ADR-0038) | `git switch <branche> && docker compose build && docker compose up -d --wait && python3 scripts/smoke_public.py http://127.0.0.1:3080` |
| Journaux | `docker compose logs --tail 200 backend` (rotation 3 × 10 Mo par service) |
| Test public complet | `python3 scripts/smoke_public.py` (16 contrôles, connexion du propriétaire, compte de démo refusé, n8n inchangé) |
| État complet | `python3 scripts/ops_status.py` |

Les migrations s'appliquent automatiquement (service `migrate`) ; faire une sauvegarde manuelle avant tout redéploiement qui ajoute une migration.

### Redéployer avec une coupure minimale (ADR-0038)
0. **Vérifier l'activité juste avant de remplacer les conteneurs**, pas au début de la session : sessions actives et dernières tentatives des 10 dernières minutes, sans les noms. Si un étudiant travaille, attendre l'accord « redéploie maintenant » du propriétaire.
1. **Construire d'abord, remplacer ensuite.**
   - `docker compose build` prépare toutes les images pendant que l'ancienne version sert toujours les étudiants (plusieurs minutes, sans coupure).
   - `docker compose up -d --wait` ne remplace ensuite que les conteneurs dont l'image a changé. La coupure se limite au redémarrage du backend (et des migrations s'il y en a).
   - Éviter `up -d --build` pendant un cours : il enchaîne construction et remplacement.
2. **Mesurer la coupure.**
   - Dans un second terminal, avant l'étape 1 : `python3 scripts/ops/measure_downtime.py http://127.0.0.1:3080`.
   - Après le smoke test : Ctrl+C. Le script affiche la plus longue coupure de `/health/ready`, en lecture seule.
   - Noter la valeur dans `docs/PROGRESS.md`.
   - Mesures sur le Mac : 1,6 s et 2,9 s sans migration ; 16,3 s avec la migration 0015 et le remplacement du gateway (31/10/2026).
3. **Pendant la coupure, côté étudiants** :
   - Les sessions sont en base : un redémarrage ou un redéploiement ne déconnecte personne. Une connexion dure 30 jours et se prolonge à chaque visite.
   - Une page déjà ouverte affiche un bandeau « La plateforme est momentanément indisponible… ». Elle retente seule, après 1, 2, 4, 8, 16 s puis toutes les 30 s. Les réponses en cours de saisie restent à l'écran.
   - Une page rechargée pendant la coupure affiche la page « momentanément indisponible » de l'application, servie par le service worker depuis la dernière version en cache. Elle revient seule à l'adresse demandée.
   - Seul un 401 (session expirée ou révoquée) ramène à la connexion. Une erreur 502, 503 ou 504, ou une coupure du réseau, ne déconnecte jamais.
   - **Limite** : un étudiant qui ouvre le site **pour la première fois** pendant une panne voit encore la page d'erreur de Cloudflare, car le service worker n'est pas encore installé sur son appareil. Il suffit de recharger après le rétablissement.

## Badges et objectif de classe (ADR-0039)
- Recalculer tous les badges à partir des tentatives (sans notification, idempotent) : `docker compose exec backend python -m app.rewards recompute`. Le tableau de bord le fait aussi sans bruit pour chaque étudiant qui l'ouvre.
- L'objectif de classe se règle dans Réglages > Objectif de classe ; rien à faire côté serveur.

## Rappels automatiques des jalons et annonces (ADR-0045, ADR-0047)
- Rien à planifier sur le Mac : le backend envoie les rappels lui-même, dans sa boucle de fond (toutes les `LIVE_TICK_SECONDS`, 15 s par défaut), 3 jours avant, 1 jour avant et le jour même de chaque date limite, à 9 h heure du Maroc.
- Même boucle : « bloc ouvert pas encore terminé », une fois par étudiant et par bloc, à partir de 9 h le lendemain de l'ouverture. Vérifier : `docker compose logs backend | grep "open block announcement"`.
- Rafi présente ces annonces et les messages de l'enseignant côté étudiant. Couper ses sons pour la classe : Réglages > Notifications > « Sons de Rafi pour toute la classe ».
- Le backend doit tourner ce jour-là : un rappel manqué pendant un arrêt part au redémarrage, le même jour seulement, jamais le lendemain.
- Désactiver pour un jalon : Projet > Jalons > interrupteur « Rappels automatiques ».
- Vérifier ce qui est parti :
  - `docker compose logs backend | grep "project reminder"` ;
  - ou `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select milestone_id, reminder, target, sent_at from project_reminders order by sent_at desc limit 20"'`.
- Chaque envoi est unique par jalon, rappel et binôme (ou étudiant) : redémarrer ou relancer le backend ne renvoie rien.

## Radio d'ambiance (facultative, ADR-0024)
- Dans `.env` (une ligne) ; ce sont les adresses officielles vérifiées le 30/10/2026 :
  `RADIO_STREAMS='[{"label":"Nightride FM — Chillsynth","url":"https://stream.nightride.fm/chillsynth.mp3"},{"label":"Nightwave Plaza","url":"https://radio.plaza.one/mp3"}]'`
- Puis `docker compose up -d --wait backend`. Vide = pas de radio.
- Seuls les hôtes `stream.nightride.fm` et `radio.plaza.one` sont acceptés : ce sont ceux de `media-src` dans `gateway/nginx.conf`. Ajouter une autre station = ajouter son hôte aux deux endroits (`RADIO_HOSTS` dans `backend/app/comfort.py` et la CSP), avec une PR.
- Vérifier un flux : `curl -sI https://radio.plaza.one/mp3 | head -3` doit répondre `audio/mpeg`.
- Si une station tombe, l'étudiant voit « Radio indisponible pour le moment » ; rien d'autre n'est touché.

## E-mails des invitations d'observateurs (facultatif, ADR-0042)

Sans réglage SMTP, rien n'est envoyé : dans Réglages > Observateurs, l'enseignant copie le lien d'invitation ou prépare l'e-mail dans sa propre messagerie (bouton « Préparer l'e-mail »).

Pour l'envoi automatique avec Resend (domaine expéditeur vérifié chez Resend) :
1. Ajouter dans `.env`, ligne par ligne, sans jamais afficher le fichier ni la clé :
   - `SMTP_HOST=smtp.resend.com` ;
   - `SMTP_USER=resend` ;
   - `SMTP_PASSWORD=` suivi de la clé API ;
   - `SMTP_FROM=` suivi de l'adresse d'envoi vérifiée ;
   - `SMTP_SECURITY=ssl` avec `SMTP_PORT=465`, ou `SMTP_SECURITY=starttls` avec `SMTP_PORT=587`.
2. Redémarrer le backend : `docker compose up -d backend`.
3. Réglages > Observateurs > « Envoyer un e-mail de test ». En cas d'échec, le message dit seulement si l'identification a été refusée ou si le serveur est injoignable ; la configuration n'est jamais affichée.

## Sauvegardes et restauration

- **Automatique** : le service `backup` fait un `pg_dump` vérifié (`pg_restore --list`) au démarrage puis toutes les 6 h, avec somme SHA-256 et `last-backup.json` ; il garde les 28 dernières (`*-auto.dump`, 7 jours) et ne supprime jamais les sauvegardes manuelles. Réglages : `BACKUP_DIR`, `BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP` dans `.env`.
- **Manuelle** (avant une opération), conservée hors rotation grâce à son suffixe :
  `docker compose exec -T backup sh -c 'set -e; umask 077; f=/backups/academy-$(date -u +%Y%m%d-%H%M%S)-avant-OPERATION.dump; pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$f"; pg_restore --list "$f" >/dev/null && echo "$f"'`
  (`sh /ops/backup.sh once` produit une sauvegarde `*-auto`, supprimée à son tour par la rotation).
- **Restauration testée** sans toucher à la base en service : `python3 scripts/restore_check.py` (conteneur jetable sans réseau, comparaison table par table, conteneur supprimé). À lancer au moins une fois par semaine. La CI fait la même vérification sur la stack de test (`--test-stack`).
- **Pas de copie hors du Mac** (décision du propriétaire, 28/10/2026) : seule la sauvegarde automatique toutes les 6 h est conservée. Risque accepté : une panne ou un vol du Mac emporte la base et ses sauvegardes. Ces fichiers contiennent des données personnelles des étudiants : jamais dans Git, jamais par e-mail.

### Restaurer réellement la base (incident grave uniquement)

1. `docker compose exec -T backup sh /ops/backup.sh once` (sauvegarder l'état actuel, même abîmé).
2. `docker compose stop backend gateway` (les étudiants voient la page indisponible).
3. Choisir le fichier : `ls -1t ~/Developer/shopflow-backups/*.dump | head`.
4. `docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < ~/Developer/shopflow-backups/<fichier>.dump`
5. `docker compose up -d --wait` puis `python3 scripts/smoke_public.py http://127.0.0.1:3080` et vérification du suivi de classe.

## Tests (stack de test séparée)

```sh
python3 scripts/test_stack.py up          # construit et démarre, crée les comptes fictifs et le cours de démonstration
python3 scripts/smoke_public.py http://127.0.0.1:3180
cd frontend && npm run test:e2e && cd ..  # Playwright, par défaut sur 127.0.0.1:3180
python3 scripts/load_test.py              # 10 étudiants fictifs + enseignant
python3 scripts/persistence_check.py      # redémarre et recrée les conteneurs de TEST uniquement
python3 scripts/restore_check.py --test-stack
python3 scripts/test_stack.py down        # arrête et supprime la base de test (jamais la production)
```

Raccourcis : `make test-stack-up`, `make test-e2e`, `make test-load`, `make test-stack-down`. La limite de 20 réponses par minute et par étudiant peut faire échouer deux exécutions E2E lancées à moins d'une minute d'intervalle : attendre une minute. Pour repartir d'une base vierge : `python3 scripts/test_stack.py reset`.

## Comptes de production (décisions du 28/10/2026)

- **Un seul enseignant** : le compte dont l'adresse est dans `.local/teacher-email.txt` (jamais écrite dans le dépôt). Il possède tous les cours ; le studio et le suivi de classe n'affichent et n'acceptent que les cours de leur propriétaire (404 sinon, tests `backend/tests/test_ownership.py`).
- **Étudiants** : seuls les identifiants qui se terminent par `@ynov.com` restent actifs. Tous les autres comptes, dont les `demo.*` et `demo.enseignant`, sont **désactivés, pas supprimés**, et leurs sessions révoquées.
- Contrôle (simulation, n'écrit rien, affiche seulement des comptages) :
  `docker compose exec -T backend python -m app.account_policy < .local/teacher-email.txt`
- Application (après une sauvegarde manuelle) : même commande avec `--apply`. Idempotent ; chaque changement est inscrit dans le journal d'audit.
- Après un import d'étudiants, relancer la simulation : un nouveau compte hors `@ynov.com` apparaît dans `accounts_to_disable`.
- Le cours de démonstration (`app.demo_course`) et les comptes fictifs (`app.seed_demo`) refusent de s'exécuter en production.

## Incidents

| Symptôme | Cause probable | Action |
|---|---|---|
| `shopflow.rapidfox.io` : erreur Cloudflare 1033/502 | Mac en veille, Docker arrêté, ou connecteur coupé | Réveiller le Mac, `docker compose up -d --wait`, `python3 scripts/ops_status.py`. Si n8n répond aussi en erreur, le connecteur `cloudflared` est en cause : `sudo launchctl kickstart -k system/com.cloudflare.cloudflared` (coupe n8n quelques secondes). |
| Page ou bandeau « La plateforme est momentanément indisponible » | backend ou base arrêtés (la page retente seule ; personne n'est déconnecté) | `docker compose ps`, `docker compose logs --tail 100 backend postgres`, `docker compose up -d --wait` |
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
- Comptes `demo.*` et `demo.enseignant` **désactivés** en production le 28/10/2026 (11 comptes, voir « Comptes de production »).
- Avant un cours réel : `python -m app.account_policy` en simulation doit indiquer 0 compte à désactiver, puis attribuer le cours publié à la cohorte réelle depuis le studio.
- Le jeton `cloudflared` n'est ni modifié ni affiché (décision du propriétaire du 28/10/2026 : on n'y touche pas).
