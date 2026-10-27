# Prompts secondaires — ne remplacent PAS le prompt principal exhaustif

**Démarrage initial complet :** `docs/PROMPT-CODEX-IMPORT-GITHUB-CLOUDFLARE.md`. Copier entièrement ce fichier lors de la première session. Les variantes ci-dessous servent **uniquement après initialisation**.

## Développer le prochain lot

> Lis `AGENTS.md`, `docs/CPS.md`, `docs/BACKLOG.md`, `docs/PROGRESS.md` et `docs/HANDOFF.md`, inspecte git/PR/CI. Utilise `$bounded-agent-loop` et le skill du module ciblé. Réalise le premier lot P0 non terminé. Tests pertinents réels, commit + PR, mise à jour PROGRESS/HANDOFF. Préserve Cloudflare/n8n et ne déploie pas sans accord.

## Construire le studio de création de cours

> Utilise `$academy-architect`, `$ui-ux`, `$grading-engine` et `$qa-e2e`. Implémente le flux enseignant brouillon→édition visuelle→prévisualisation NON notée→validation→publication versionnée→assignation, puis lecteur étudiant. Les contenus définitifs restent en attente P2. Teste sécurité/immutabilité et effectue E2E.

## Ajouter des cours plus tard (P2)

> Utilise `$mission-author`, `$curriculum-mapper` et les supports du professeur. Publie depuis le studio des activités sans code obligatoire. Vérifie barème, objectifs, schéma, datasets et corrections privées ; ne crée pas de contenu non confirmé par les supports.

## Reprendre une session

> Lis AGENTS/HANDOFF/PROGRESS, examine git status, l'issue active et les tests. Continue exactement le lot indiqué, ne casse pas de modifications en cours, finis avec `$session-handoff`.

## Préparer la publication Cloudflare (sans l'activer)

> Utilise `$deploy-ops`. Lis `docs/DEPLOY-RAPIDFOX.md`, détecte l'emplacement existant de n8n/cloudflared et celui de l'Academy, prépare la bonne route `shopflow.rapidfox.io`, vérifie Compose local et les tests. Demande accord AVANT création d'une route/DNS ou exposition publique. Pas de VPS.
