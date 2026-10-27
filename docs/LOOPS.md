# Boucles de développement Codex — bornées et auditables

**Codex + GitHub suffisent pour le développement.** Aucun orchestrateur payant ou boucle auto-relancée sans limite. Lire `AGENTS.md` et le backlog à chaque session. **La plateforme et le studio passent avant les contenus réels.**

## Loop A — Développer une fonctionnalité P0 (une issue à la fois)

1. `python3 scripts/next_task.py` identifie le premier lot TODO et un prompt de reprise (lecture seule).
2. Vérifier état GitHub/local, planifier périmètre vertical, définir tests/critères.
3. Implémenter, exécuter tests locaux, inspecter erreurs et réparer (≤3 essais même blocage).
4. Capturer UI/E2E si nouvelle page. Vérifier permission étudiant/enseignant si endpoints touchés.
5. Commit sur branche + PR ; **pas de merge/deploiement public automatique**.
6. Actualiser `docs/PROGRESS.md` et `docs/HANDOFF.md`, issue et ADR si nécessaire.

## Loop B — Qualité GitHub Actions

CI documentaire initiale **ne teste pas l'Academy**. Faire évoluer en tests FastAPI/pytest, Vitest, Playwright, migrations/permissions et charge de 10 utilisateurs quand ces composants existent. Bloquer PR en cas de régression prouvée. Traces sans données sensibles.

## Loop C — UX et studio de cours

Via Playwright : enseignant crée brouillon → preview non notée → valide → publie → attribue ; étudiant voit mission, répond, note sauvegardée, feedback et progression ; autre élève isolé ; ancienne version reste inchangée. Démos de test, **pas le corpus réel**.

## Loop D — Auteur de cours, **seulement après P0**

Utiliser `$mission-author` + `$curriculum-mapper` pour transformer les supports approuvés en missions JSON validées, testées, intégrées via studio. Vérifier objectifs et notation puis demander revue enseignant. Les 24 séquences du 28 restent en backlog P2 tant que la plateforme n'est pas prête.

## Loop E — Mise en ligne Cloudflare Tunnel

Inventaire n8n/cloudflared et de l'hôte Academy → backups → tests locaux → **accord humain explicite** → ajout du seul hostname ShopFlow au tunnel approprié → smoke-test depuis un réseau externe → vérifier **n8n inchangé** → rollback spécifique ShopFlow en cas d'échec.

## Stop rules

- Pas de boucle récursive indéfinie de `codex exec` ni de sous-agents concurrents sur les mêmes fichiers.
- Aucun achat, modification DNS/tunnel public, touché à n8n, données réelles, merge ou déploiement sans approbation.
- Si secrets exposés, interrompre, ne pas afficher, demander rotation.
- Si tests manquent, afficher `NOT RUN` et ne pas marquer DONE.
