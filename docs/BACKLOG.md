# Backlog ShopFlow Academy — plateforme en premier, contenu ensuite

> Source de vérité des lots Codex. **Ce projet n'est pas un MVP jetable** : architecture cible complète, livraison incrémentale. `TODO` = aucune implémentation applicative fournie par le kit. Mise à jour des cases seulement avec commit/PR et preuves de tests. Un lot peut être scindé en sous-issues mais conserve ses critères d'acceptation.

## P0 — Infrastructure et plateforme complète, sans production de cours réels

- [x] **P0-01** Initialiser monorepo React/TypeScript/Vite + FastAPI/SQLAlchemy/Alembic + PostgreSQL, gateway HTTP local `127.0.0.1:3080`, Docker Compose, `/health/live|ready`, config `.env`, Makefile/scripts et CI initiale. **AC :** frontend local et API accessibles via gateway, schéma migrations, tests effectifs, pas de base publique. [Issue #1](https://github.com/mryoshq/shopflow-academy/issues/1) · [PR #11](https://github.com/mryoshq/shopflow-academy/pull/11), CI PASS, non mergée.
- [ ] **P0-02** Authentification, rôles étudiant/enseignant, sessions sécurisées, 10 comptes *fictifs* et 1 enseignant via seed local, RBAC. **AC :** login/logout/me, protection auth, étudiant→enseignant 403, étudiant A→B 403, rate-limits et tests.
- [ ] **P0-03** Modélisation du référentiel pédagogique **sans contenu final** : cours, objectifs, modules, chapitres, missions, définitions typées, brouillons, versions publiées immuables, cohortes, assignations, événements d'audit. **AC :** migrations/CRUD métier et validation Pydantic, projection publique sans corrigés.
- [ ] **P0-04** **Studio de création de cours** pour enseignant : formulaire visuel, éditeur QCM/choix/ordre, réorganisation, points/indices/datasets fictifs, aperçu sans notation, prévalidation, publication versionnée, archivage. **AC :** créer→preview→publier dans navigateur, refus de publier contenu invalide, non enseignant 403.
- [ ] **P0-05** **Lecteur étudiant générique** + tableau de bord initial : cours assignés, scénario, table/chart, QCM, choix, ordre, indices, feedback et navigation sans écrire du code. **AC :** clavier/1366×768, toutes les variantes d'état (vide, verrouillé, réseau), démo fonctionnelle sur trois activités.
- [ ] **P0-06** **Correction déterministe et progression** liées à la version publiée : tentatives atomiques/idempotentes, score, bonus séparés, best score, verrouillages, historique. **AC :** aucun double comptage, aucune réponse cachée dans le payload étudiant, reprise après redémarrage, tests concurrence et authz.
- [ ] **P0-07** **Dashboard enseignant** : liste élèves, progressions, notes, tentatives et interventions ; cohortes, sessions, unlock/pause, export CSV, audit ; actualisation quasi temps réel. **AC :** 10 utilisateurs test, retard mesuré ≤10 s cible, accès propriétaire protégé.
- [ ] **P0-08** **Administration de contenu industrialisée** : import/export JSON versionné, schémas publics/privés, recherche/classement de cours, historisation changements, sauvegarde de publication, rollback éditorial sécurisé. **AC :** roundtrip import→validation→preview→publication et refus des données malformées.
- [ ] **P0-09** **Expérience complète de démonstration**, CI fiable et qualité : 3 missions démonstratives isolées des cours réels, tests pytest/Vitest/Playwright, authz/IDOR, a11y de base, charge 10, restart et persistance. **AC :** enseignant publie une démo, étudiant la termine, note persistante et test cross-account.
- [ ] **P0-10** **Déploiement Mac + Cloudflare Tunnel EXCLUSIVEMENT**, sauvegarde/restauration, logs/health, runbook et smoke test externe une fois autorisé ; n8n existant préservé. **AC :** Docker local vérifié, route `shopflow.rapidfox.io` validée seulement après accord, test distant et non-régression n8n.

## P1 — Extensions pédagogiques et expériences avancées, après P0 stable

- [ ] **P1-01** Adaptateur tuteur IA optionnel (none et OpenRouter configurable), indices statiques en fallback, plafond requêtes/coûts, confidentialité et journaux minimaux.
- [ ] **P1-02** Scénarios métier SQL/Python prédéfinis pilotés par choix, datasets fictifs versionnés, tables/charts plus riches, simulateurs sandboxés sans Python arbitraire.
- [ ] **P1-03** Ressources pédagogiques, mini-vidéos, glossaire, badges, activités pour les rapides, variantes de langue et accessibilité avancée.
- [ ] **P1-04** Bonus SQL libre **optionnel**, revue sécurité, DB laboratoire lecture seule, isolation schémas, limites temps/mémoire/résultats et batterie de tests de contournement ; désactivé si non conforme.
- [ ] **P1-05** Qualité UX/analytics : statistiques agrégées de questions, repérage des difficultés, filtres, amélioration éditeur et expérience enseignant en classe.

## P2 — Intégration des cours **après** plateforme et studio

- [ ] **P2-01** Importer/rédiger le **rappel SQL analytique**, maximum 90 minutes, à partir des supports validés du professeur ; QCM et situations sans code, bonus séparés.
- [ ] **P2-02** Intégrer l'**Axe 2 Python ingestion et qualité**, 270 minutes indicatives, avec simulations guidées, validation de données et datasets ; progression par blocs souples de 15 min.
- [ ] **P2-03** Intégrer l'**Axe 3 Airflow** : activité visuelle DAG, dépendances, retry, logs, démonstration de vraies tâches préconfigurées.
- [ ] **P2-04** Intégrer l'**Axe 4 MongoDB/Redis/TimescaleDB** et comparaison InfluxDB ; choix guidés et visualisations.
- [ ] **P2-05** Projet final, soutenance, évaluations, exports, couverture des objectifs, QA sur tous les contenus publiés.
- [ ] **P2-06** Runner **Python libre** en sandbox à frontière de sécurité adaptée, non activé sur Mac tant qu'aucune solution revue et éprouvée n'existe. Aucun prérequis pour réussir le cours.

## Definition of Done par lot

Code réellement utilisable dans ses flux, critères d'acceptation et tests pertinents (avec commandes et résultats exacts), migrations si nécessaire, CI, revue RBAC/sécurité, documentation, changelog, `docs/PROGRESS.md` et `docs/HANDOFF.md` à jour. PR GitHub sans merge automatique. Pour toute UI, screenshot ou E2E vérifiable ; publication internet exige accord explicite.
