> **Cadrage v2.0 :** Codex + GitHub, Mac + Cloudflare Tunnel uniquement, n8n préservé, plateforme/studio avant les cours. Aucun MCP supplémentaire n'est obligatoire au démarrage.

# Intégrations ciblées pour Codex — quoi installer et pourquoi

## Niveau 1 — immédiatement utile
1. **GitHub** : issues, branches, PRs, historique, Actions. Déjà connecté dans l'environnement ChatGPT actuel; pour Codex sur Mac, connexion GitHub / CLI selon son setup. Aucun second dépôt ou outil de gestion nécessaire.
2. **OpenAI Developer Docs MCP (officiel, lecture seule)** : pour les API OpenAI/Codex et docs plugins. `codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp`.
3. **Playwright CLI + skill (Microsoft, recommandé pour coder)** : `npm install -g @playwright/cli@latest && playwright-cli install --skills=agents` ; utiliser les tests Playwright en CI, puis MCP en complément.
4. **Playwright MCP (Microsoft), optionnel** : pour naviguer dans l'Academy en tant qu'étudiant/enseignant et reproduire les erreurs UX. `codex mcp add playwright npx '@playwright/mcp@latest'`. Pré-requis Node/npm. Préférer des tests Playwright classiques en CI, plus reproductibles; MCP pour exploration ponctuelle.

## Niveau 2 — selon usage
- **GitHub MCP Server officiel** : utile si Codex local manque d'accès aux issues/PR par outils GitHub; vérifier permissions limitées et ne pas stocker de token dans le repo. Un GitHub CLI (`gh`) peut suffire; éviter doublon d'accès.
- **Playwright CLI + skill** : souvent moins coûteux en contexte pour agents de code que MCP; découvrir `https://github.com/microsoft/playwright-cli` et installer en suivant sa doc si les tests navigateurs deviennent intensifs.
- **Docker CLI + Compose** : outils locaux natifs, aucun MCP nécessaire pour des commandes déjà accessibles au terminal.
- **Postgres / MySQL** : préférer migrations et tests via scripts Python, ne pas exposer les bases à un MCP généraliste connecté à la production.

## Skills prévus dans le repo
Les skills personnalisés à `.agents/skills/` : `academy-architect`, `curriculum-mapper`, `mission-author`, `grading-engine`, `ui-ux`, `qa-e2e`, `deploy-ops`, `session-handoff`, `bounded-agent-loop`. Les invoquer par `$nom` dans Codex ou laisser Codex les détecter.

## Boucles de développement recommandées
- **Feature loop (manuelle via Codex)**: choisir un lot → plan → code → tests → analyse erreurs → correctif (≤3 itérations identiques) → commit/PR → mise à jour tracking.
- **QA loop**: tests CI sur PR GitHub + Playwright; si échec, déboguer sur branche, sans auto-merge.
- **Release loop (enseignant)**: revue critères → backup → déploiement staging → smoke test 2 rôles + élève distant → validation humaine → production.
- **Curriculum loop**: auteur mission → grille objectifs → tests de barème et corrigés → revue enseignant → version de publication.
Les automations Codex/GitHub programmées sont facultatives. Ne jamais créer une boucle autonome infinie ou des déploiements non supervisés.

## Liens de référence officiels
- https://learn.chatgpt.com/docs/build-skills
- https://developers.openai.com/resources/docs-mcp
- https://github.com/microsoft/playwright-mcp
- https://github.com/microsoft/playwright-cli
- https://github.com/github/github-mcp-server
- https://docs.github.com/en/actions
- https://developers.openai.com/blog/run-long-horizon-tasks-with-codex

## Claude Code (agent principal depuis le 27/10/2026)

- **`CLAUDE.md`** importe `AGENTS.md` (`@AGENTS.md`) et n'ajoute que les règles propres à Claude Code : ordre de lecture, interdits, commandes de test, preuve, fin de lot, économie de tokens.
- **Skills** : les neuf skills de `.agents/skills/` sont exposés sous `.claude/skills/<nom>` par **liens symboliques relatifs** (source unique). La documentation officielle indique qu'une entrée `<skill-name>` de projet peut être un lien vers un dossier ; `scripts/verify_kit.py` échoue si un lien manque ou pointe ailleurs.
- **`.claude/settings.json`** (committé) : `deny` force-push, suppression de branche distante, `docker compose down -v`, `wrangler`, `upsert_teacher.py`, lecture de `.env*` (sauf `.env.example`), `.local/**`, `~/.cloudflared/**` ; `ask` pour `cloudflared`, `gh pr merge|edit`, `git push`, `docker volume rm`, actions sur n8n/`wordpress`, `seed_demo.py`, `sudo` ; `allow` pour tests et lectures courantes. Ordre officiel : deny → ask → allow ; les règles `ask` s'appliquent aussi en mode auto. Ces règles visent l'usage courant et ne sont pas une frontière de sécurité (une commande écrite autrement peut y échapper). `.claude/settings.local.json` est ignoré par Git.
- **Outils complémentaires (installation côté utilisateur, non effectuée — accord requis)** :
  - Context7 MCP pour la documentation à jour (Chakra UI v3, FastAPI, SQLAlchemy 2, Playwright) : `claude mcp add --transport http context7 https://mcp.context7.com/mcp` (vérifier la commande dans la doc Context7 avant).
  - Plugin `frontend-design` depuis le marketplace officiel Anthropic via `/plugin`, s'il y est listé.
  - Pas de Playwright MCP par défaut (coûteux en contexte), pas de MCP Cloudflare ni base de données, pas de skills tiers non audités.
