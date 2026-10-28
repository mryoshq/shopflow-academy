# ShopFlow Academy

**État au 27 octobre 2026 : P0-03 en revue, référentiel pédagogique local.** Ce dépôt contient le kit documentaire original et un socle exécutable React/Chakra UI v3, FastAPI, Alembic, PostgreSQL et gateway Nginx local. La connexion, les rôles, les sessions et les versions de cours côté API sont implémentés ; le studio visuel et les cours définitifs restent dans les lots suivants. Aucun contenu pédagogique définitif n'est publié.

## Démarrer le socle en local sur Mac

Pré-requis : Docker Desktop avec Compose. Le seul port hôte publié par cette stack est `127.0.0.1:3080`. Vérifier sa disponibilité avant le lancement. La stack ne contient ni n8n ni cloudflared.

```bash
python3 scripts/init_env.py
docker compose config --quiet
docker compose up -d --build
curl --fail http://127.0.0.1:3080/health/ready
```

Ouvrir `http://127.0.0.1:3080/` pour la page de connexion. Pour créer uniquement les comptes fictifs de développement, exécuter `python3 scripts/seed_demo.py` ; les identifiants sont sauvés dans `.local/demo-credentials.json`, ignoré par Git et accessible au seul utilisateur local. Les dix adresses fournies séparément sont importables avec `python3 scripts/import_students.py` depuis `.local/student-emails.txt`, également ignoré par Git. Aucun script n'envoie de message. Conserver les fichiers de mots de passe localement et ne pas les ajouter à Git. Arrêter uniquement cette stack avec `docker compose down` ; ne pas utiliser `-v` si les données PostgreSQL doivent être conservées. Pour les tests hors Docker : installer `backend/requirements-dev.txt` dans un environnement Python, exécuter `python -m pytest -q` depuis `backend`, puis `npm ci`, `npm run test -- --pool=threads --maxWorkers=1` et `npm run build` depuis `frontend`.

Le domaine `https://shopflow.rapidfox.io` reste réservé au déploiement ultérieur sur Mac via Cloudflare Tunnel, après accord explicite. `n8n.rapidfox.io` est hors de cette stack et reste inchangé.

## Démarrage recommandé — directement dans Codex sur le Mac

1. Télécharger **uniquement** `ShopFlow_Academy_Codex_GitHub_Rapidfox.zip` dans `~/Downloads`. Aucun autre fichier séparé nécessaire.
2. **Le plus simple :** utiliser `DEMARRAGE-CODEX.txt` (petit message d'amorçage) ; Codex extraira alors le ZIP et lira le **prompt complet** du fichier `docs/PROMPT-CODEX-IMPORT-GITHUB-CLOUDFLARE.md` (ou demander à Codex d'ouvrir ce fichier après extraction ; il doit alors d'abord extraire le ZIP).
3. Codex inspecte/extrait le ZIP, vérifie les neuf skills et le kit, utilise ton compte GitHub local (`gh auth status`) et crée ou reprend le dépôt **privé** `shopflow-academy` sans écraser des fichiers existants.
4. Codex commence le backlog **P0**, dans l'ordre : infrastructure → auth → schéma de cours → **studio de création de cours** → lecteur étudiant → score → dashboards → qualité → tunnel.
5. **Les cours réels seront ajoutés après** depuis le studio. Le document `docs/PEDAGOGIE-28-OCT.md` est une référence pédagogique, pas un ordre de produire immédiatement les 24 missions.

## Choix actés

- **Développement** : Codex + GitHub ; OpenRouter uniquement si besoin ultérieur et clé ajoutée hors Git.
- **Public URL** : `https://shopflow.rapidfox.io` ; `rapidfox.io` est enregistré chez Hostinger et **`n8n.rapidfox.io` fonctionne déjà sur Cloudflare**.
- **Une seule stratégie d'hébergement** : **Mac Docker Desktop/Compose + Cloudflare Tunnel**. Si n8n utilise le tunnel sur le même Mac, nouvelle route sur ce tunnel ; sinon tunnel nommé dédié sur le Mac Academy. **Ne pas toucher à n8n.** Aucun VPS, Kubernetes ou bascule DNS complète prévu.
- **Budget** : ≤50 €/mois consacré **à l'hébergement uniquement**, pas au développement ou aux appels IA.
- **10 étudiants** (9 en classe, 1 à distance, navigateurs Windows) et enseignant sur Mac.
- **Sans code obligatoire** : situations, QCM, choix, tableaux/graphes, progression, feedback et notation. Code en bonus, isolé lorsqu'autorisé.
- **Pédagogie future** : 25 % de temps SQL (≤90 min), 75 % Python ingestion/qualité (270 min), étapes souples de ~15 min ; programme complet SQL, Python, Airflow, MongoDB, Redis et séries temporelles.
- UI en français, cas e-commerce fictifs marocains, DH, option d'aide en darija.

## Vérifier ce kit (ne remplace pas les tests de l'application)

```bash
python3 scripts/verify_kit.py
python3 -m unittest discover -s tests -v
python3 scripts/next_task.py
```

La vérification documentaire du kit ne valide pas l'application. Les tests applicatifs se trouvent désormais dans `backend/tests` et `frontend/src/*.test.tsx` ; la CI dédiée est `.github/workflows/app-ci.yml`.

## Carte des fichiers

| Chemin | Rôle |
|---|---|
| `DEMARRAGE-CODEX.txt` | Petit message de lancement à coller dans Codex : extraction automatique et lecture du prompt complet |
| `docs/PROMPT-CODEX-IMPORT-GITHUB-CLOUDFLARE.md` | **Prompt principal complet à coller dans Codex** : ZIP, GitHub, implémentation, sécurité, tests et tunnel |
| `AGENTS.md` | Règles permanentes à lire à chaque session Codex |
| `docs/CPS.md` | Cahier des prescriptions complet, plateforme d'abord |
| `docs/ARCHITECTURE.md` | Modèle de contenu, frontières, API, sécurité |
| `docs/BACKLOG.md` | Lots P0 plateforme → P1 extensions → P2 cours |
| `docs/DEPLOY-RAPIDFOX.md` | **Seul** runbook de mise en ligne Cloudflare Tunnel, n8n préservé |
| `docs/OPERATIONS.md` | Budget, sauvegarde, exploitation sur Mac |
| `docs/DECISIONS/` | Décisions d'architecture vérifiables |
| `docs/PROGRESS.md`, `docs/HANDOFF.md` | Traçabilité et continuité inter-sessions/agents |
| `.agents/skills/*/SKILL.md` | Neuf skills spécialisés de développement |
| `docs/LOOPS.md`, `docs/MCP-AND-SKILLS.md` | Boucles bornées et MCP pertinents |
| `docs/PEDAGOGIE-28-OCT.md` | Référence pour le contenu à intégrer ultérieurement |
| `.github/` | CI documentaire initiale, modèles PR/issue ; CI app à étendre |
| `.env.example`, `compose.yaml`, `config/llm.example.yaml` | Configurations de référence **sans secrets** |

## État vérifiable

**Livré dans P0-01 à P0-03** : page React/Chakra v3, API FastAPI de santé, Compose Mac avec gateway loopback, authentification, rôles, sessions, référentiel versionné, projections étudiantes et tests. **À livrer dans les lots suivants** : studio visuel, lecteur, correction, dashboards et publication Cloudflare après accord.
