> **Cadrage v2.0 :** Codex + GitHub, Mac + Cloudflare Tunnel uniquement, n8n préservé, plateforme/studio avant les cours. Aucun MCP supplémentaire n'est obligatoire au démarrage.

# Skills et MCP externes — sélection vérifiée

## Installer / activer en priorité

**Skill Creator, fourni par Codex** : pour améliorer les skills maison, et tester leur déclenchement. Exemple : « Utilise `$skill-creator` pour valider notre `mission-author` ». Référence : https://learn.chatgpt.com/docs/build-skills

**Playwright CLI + skills (Microsoft, recommandé pour coding agents)** : pour inspecter l'interface, tester les missions et enregistrer des captures en limitant l'utilisation du contexte. Référence : https://github.com/microsoft/playwright-cli

```bash
npm install -g @playwright/cli@latest
playwright-cli install --skills=agents
```

**OpenAI Developer Docs MCP, lecture seule (recommandé)** : pour vérifier les contrats d'API et de plugins sans inventer des paramètres.

```bash
codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp
```

**GitHub (déjà utilisé dans ChatGPT)** : GitHub CLI pour les issues/PR locales et GitHub Actions comme boucle de validation; un GitHub MCP supplémentaire est facultatif, pas indispensable. Serveur officiel : https://github.com/github/github-mcp-server

## Installer selon besoin

**Playwright MCP (Microsoft)** : navigation exploratoire en session persistante, débogage visuel ; pour CI, préférer les tests Playwright standards.

```bash
codex mcp add playwright npx '@playwright/mcp@latest'
```

**Skills internes du repo** (ne nécessitent aucune installation) : `academy-architect`, `curriculum-mapper`, `mission-author`, `grading-engine`, `ui-ux`, `qa-e2e`, `deploy-ops`, `session-handoff`, `bounded-agent-loop`.

## À éviter au début
Kubernetes MCP, accès MCP direct aux bases de production, services d'agent payants redondants, auto-merge non supervisé, agents disposant du Docker socket ou de tous les droits cloud. Chaque connecteur externe augmente la surface d'accès.

## Notes de fiabilité
`openai/skills` a été signalé comme dépôt historique/déprécié au profit du catalogue plugins dans une partie de sa documentation. Ne pas installer en masse des skills tiers non audités. Les skills peuvent exécuter des scripts avec les droits de l'agent : inspecter leurs sources et permissions. Versions et commandes à vérifier lors de l'installation.
