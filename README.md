# ShopFlow Academy — Kit complet de pilotage Codex + GitHub + Cloudflare Tunnel

**Version 2.0 — 27 octobre 2026.** Ce ZIP contient **le CPS, le prompt principal exhaustif, neuf skills, les conventions d'architecture, le backlog, les tests documentaires et le plan d'exploitation**. **Ce n'est pas encore le code de l'Academy** : Codex doit l'implémenter à partir de ces documents.

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

La configuration `compose.yaml` incluse ne sert **au départ que de base infrastructure** (PostgreSQL + MySQL facultatif via profil labs) ; frontend/backend/gateway seront construits dans P0-01. Le kit ne prouve ni conteneurs opérationnels ni publication du sous-domaine.

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

**Livré dans ce ZIP** : spécifications + prompt exhaustif + skills + backlog + tests du kit + documentation Tunnel. **Non livré** : plateforme React/FastAPI, véritable studio, moteur de missions, comptes utilisateurs, correcteur déployé, Cloudflare configuré. Ne pas confondre ces états.
