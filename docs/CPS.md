# Cahier des prescriptions (CPS) — ShopFlow Academy

**Version 2.0 — 27 octobre 2026. Produit durable, implémentation progressive, contenus pédagogiques ajoutés après la plateforme.** Ce dossier est la référence fonctionnelle pour Codex et tout agent de reprise.

## A. Objet et philosophie

Construire **une Academy complète**, accessible dans le navigateur sur `https://shopflow.rapidfox.io`, destinée au cours **Python Data Engineering & SQL Avancé**. La plateforme sépare totalement **moteur pédagogique** (auth, activités, notation, parcours, données, administration) et **contenu** (cours, missions, textes, vidéos, datasets, corrigés). Aucun changement de code ne doit être nécessaire pour créer la plupart des activités depuis le studio enseignant. Le système est versionné et extensible sans réécriture.

**Ne pas développer tous les cours maintenant.** Implémenter en premier l'application complète : gestion des comptes, studio de création de cours, lecteur étudiant, correcteur serveur, progression, dashboards, opérations/tests. Utiliser deux ou trois missions fictives de test, clairement indiquées « démonstration ». Les cours définitifs seront intégrés ensuite à partir des supports validés de l'enseignant.

## B. Contexte et expérience

- **10 étudiants** : neuf en salle sur Windows, un à distance ; **enseignant sur Mac**.
- Navigateur seul (Chrome/Edge Windows, Chrome/Safari Mac), aucune installation requise pour l'étudiant.
- Français clair et naturel, éléments marocains authentiques sans stéréotypes : dirhams, villes fictives et contexte e-commerce **ShopFlow**. Darija facultative pour le tuteur.
- L'étudiant **n'a pas à écrire du code** pour réussir le tronc commun. Il observe des données, choisit des solutions, manipule des scénarios et reçoit un feedback. Défis SQL/Python facultatifs et strictement séparés du parcours noté.
- Progression ludique mais non infantilisante, peu de slides, interactions en classe, séquences souples proches de 15 minutes, liberté d'entraide et de consultation des ressources.
- Les missions sont disponibles même si l'assistant IA est désactivé ou indisponible. Aucun classement public imposé.

## C. Rôles, droits et sessions

**Étudiant** : connexion, module attribué, dashboard, progression, activités, notes personnelles, historique, indices, ressources et bonus opt-in. Impossible d'accéder à une autre identité, aux dashboards enseignants, aux brouillons, corrigés secrets et grilles cachées.

**Enseignant / administrateur** : comptes/cohortes, assignments, sessions de classe, ouverture/pause/déblocage, visualisation actualisée de dix utilisateurs, gestion des notes et export, **création de cours no-code**, prévisualisation, publication versionnée, accès aux analytics agrégées, audit des interventions. Les modifications de notes sont motivées, enregistrées et protégées.

**Anonyme** : uniquement login et ressources publiques explicitement publiées ; aucune progression, aucune API interne accessible.

Comptes de développement créés par seed idempotent pour dix profils **fictifs** et un enseignant ; pas de vrais identifiants déposés dans Git.

## D. Fonctionnalités plateforme obligatoires (P0)

### D1. Administration et studio de contenu : priorité structurante

Interface permettant **sans coder** :

1. Créer, décrire, réordonner et classer cours, objectifs, modules, chapitres et missions ; lier objectifs/prérequis.
2. Choisir un type d'activité parmi QCM simple/multiple, vrai/faux, association, ordre/étapes, lecture de tableau/graphique, décision sur incident, simulation déterministe à choix. Étendre ensuite aux labs SQL/Python via adaptateurs.
3. Saisir un scénario, données fictives, consignes, propositions, indices en niveaux, explications, feedback par erreur, points, conditions de déblocage, liens ressources.
4. Prévisualiser la mission en mode étudiant **sans créer de note** ; simuler les bonnes et mauvaises réponses.
5. Valider un brouillon (schéma, références, correction complète, score, absence d'options ambiguës), puis **publier une version immuable** ; ne jamais modifier rétroactivement un parcours déjà commencé. Permettre une nouvelle révision et archivage.
6. Attribuer un contenu à une cohorte/session, gérer les déblocages, exporter/importer du JSON **schéma-validé** et versionné, avec rapport d'erreurs explicites. Ne jamais exécuter des scripts fournis par un import JSON.
7. Journaliser date/auteur/changement et protéger édition/publication/exports derrière RBAC.

L'interface n'est pas limitée à un éditeur de JSON brut : un auteur non développeur doit pouvoir créer une activité de démonstration de bout en bout dans son navigateur.

### D2. Lecteur étudiant

Dashboard initial : cours actifs, progression, score actuel, ressources, bouton « Continuer ». Page mission : situation → tableau/graphique → choix/interactions → « Tester ma décision » → feedback/exemple corrigé selon règles → « Continuer ». États : aucun cours publié, verrouillé, en cours, réussi, aide demandée, réseau indisponible, session expirée, IA inactive. Navigation accessible au clavier, informations au-delà de la couleur, largeur de référence 1366×768.

### D3. Moteur et notation

Le moteur doit être **agnostique du sujet**. Activités/versions créées par enseignants, action `action_id` appartenant à un registre d'opérations approuvées côté serveur, résultat déterministe. Soumission authentifiée, transactionnelle et **idempotente**, identifiant unique de tentative, validation de cohorte et déblocage ; feedback selon le choix. Corrigés, barème et grader **serveur uniquement**.

Score du tronc commun calculé selon les barèmes publiés, meilleure réponse conservée par défaut ; les bonus sont comptés à part, sans pénaliser l'étudiant. Scores rejouables depuis les événements ; ne pas incrémenter deux fois un même résultat ; tentatives associées à la version exacte publiée. L'IA ne calcule aucun score.

### D4. Enseignant et suivi

Vue de classe de dix utilisateurs : progression, mission courante, tentative, score, besoin d'aide, statut d'activité ; rafraîchissement cible ≤10 s (polling SSE/optimisation mesuré). Actions contrôlées : ouvrir/pause/reprendre une séquence, débloquer un étudiant, exporter CSV, filtrer par cohorte/module, journaliser modifications. Aucun accès étudiant à ces endpoints, y compris en falsifiant un ID.

### D5. Qualité et services

Frontend React TypeScript, backend FastAPI, PostgreSQL, Docker Compose, gateway local, santé, logs structurés minimisant les données, migrations, backups et restauration. GitHub Actions avec tests véritables au fur et à mesure ; Playwright pour E2E. Interface IA désactivée par défaut, indices statiques disponibles. MySQL de lab peut n'être activé qu'avec profil `labs` jusqu'aux activités SQL.

## E. Modèle de contenu à versionner

`Course → CourseRelease → Module → Chapter → Mission → Activity`, et `LearningObjective` associé aux missions. Les schémas métiers doivent identifier les versions du contenu et du correcteur. Exemple de contrat `MissionDefinition` :

`id`, `version`, `objectives`, `title`, `scenario`, `kind`, `display_data`, `choices`, `action_id`, `grading_ref`, `max_points`, `hints`, `feedback`, `unlock_rules`, `resources`, `bonus`, `estimated_duration`, `acceptance_tests`.

**Scinder** toujours la représentation enseignant (incluant correction/règles) et la représentation étudiant **expurgée**. L'API de correction compare un `answer` soumis à la version publiée immuable ; pas de réponses directes au navigateur avant les autorisations de révélation définies. Import JSON/édition validés strictement ; sanitizer pour Markdown/HTML.

## F. Extensibilité des laboratoires

La plateforme doit comprendre des interfaces d'extension pour des **opérations guidées approuvées** et, plus tard, pour un **runner optionnel**. Architecture des domaines :

- **Axe 1** : grain et jointures, fenêtres `ROW_NUMBER`, `RANK`, `LAG`, `LEAD`, `NTILE`, `PERCENT_RANK`, CTE classiques et récursives, `EXPLAIN ANALYZE`, optimisation/partitionnement/dénormalisation. Clarifier les différences MySQL/PostgreSQL sur les index partiels.
- **Axe 2** : CSV/JSON, chargement Python, types, dates, nettoyage, règles de qualité, valeurs manquantes, doublons, rejets et idempotence d'import, contrôles d'indicateurs ; l'étudiant choisit la règle, l'Academy exécute une simulation approuvée.
- **Axe 3** : Airflow DAG, scheduling, dépendances, retries, logs et incidents par manipulation visuelle, démos de tâches préparées.
- **Axe 4** : MongoDB documents, Redis cache TTL/invalidation, TimescaleDB séries temporelles, InfluxDB en comparaison.

Aucune obligation de lancer Airflow, MongoDB, Redis ou TimescaleDB avant les lots correspondants. Pas d'exécution arbitraire de Python sur le Mac. Bonus SQL libres seulement avec restrictions lecture seule/AST/quotas/isolations et revue de sécurité.

## G. Intégration **ultérieure** du parcours du 28 octobre (référence, pas livraison immédiate)

**Durée de cours** : 6 h, 25 % rappel SQL = **90 min maximum**, 75 % Axe 2 = **270 min** ; séquences de 15 minutes **indicatives**. **Barème pédagogique proposé** pour ce parcours uniquement : 25/100 SQL + 75/100 Axe 2, bonus séparés, sans confondre temps et points. Le document `docs/PEDAGOGIE-28-OCT.md` conserve les 6 séquences SQL et 18 séquences Python en attente de création via le studio, après P0.

Reprendre les supports originaux du professeur avant de publier des questions définitives. Quelques slides suffisent ; le détail vient des missions publiées. Il est inutile de coder des pages spécifiques pour chaque leçon.

## H. Modèle de données suggéré

`users`, `cohorts`, `enrollments`, `courses`, `course_releases`, `modules`, `chapters`, `objectives`, `missions`, `mission_versions`, `activities`, `assignments`, `class_sessions`, `mission_unlocks`, `attempts`, `progress`, `score_events`, `teacher_actions`, `audit_events`, `ai_interactions`, `resource_links`.

Contraintes unicité pertinentes, clés étrangères, migrations Alembic et vérification de concurrents. Les fixtures ShopFlow `orders`, `order_items`, `customers`, `products`, agrégats et CSV/JSON sont **fictives** et appartiendront au catalogue des simulations ou au MySQL lab (séparé des données sensibles de la plateforme).

## I. Sécurité et disponibilité

- RBAC et autorisation **au niveau de chaque enregistrement**, contrôles IDOR, protège les endpoints brouillon/pub/notes.
- Sessions côté serveur ou cookies sécurisés, hash robuste, expiration et révocation, CSRF et rate limits selon contrat d'auth.
- Aucun mot de passe/corrigé secret/jeton Cloudflare/API LLM dans Git, navigateur ou journaux.
- Rate-limit et droits stricts des importeurs JSON ; aucun SQL/Python construit à partir d'un champ de réponse étudiant.
- L'IA externe ne reçoit pas de PII ou réponses correctes cachées, n'attribue jamais de note et se dégrade vers indices statiques.
- Persistance après redémarrage, sauvegarde chiffrée et procédure de restauration **testée**.
- Rôle de `n8n.rapidfox.io` **préservé sans modification**, tunnel Academy publié uniquement après accord ; test de non-régression n8n.

## J. Unique stratégie de déploiement

**Mac Docker Compose + Cloudflare Tunnel uniquement**, adresse `shopflow.rapidfox.io`. Le Mac n'est pas nécessairement celui qui héberge n8n. Si c'est le même hôte que le tunnel existant, ajouter après accord une published application sur le tunnel existant. Sinon, créer un tunnel dédié sur le Mac Academy, sans déplacer n8n. Seul le gateway sur loopback `127.0.0.1:3080` (port à confirmer) est joignable par cloudflared installé sur Mac ; aucune exposition internet de DB/API dédiée. Voir runbook `docs/DEPLOY-RAPIDFOX.md`.

Plafond d'hébergement **50 €/mois**, aucun abonnement additionnel autorisé implicitement. Domaine déjà possédé ; ne changer ni nameservers Hostinger, ni DNS `n8n`, ni site racine, ni MX. Sécuriser HTTPS via Cloudflare, sessions cookies et headers proxy. Aucun VPS ou Kubernetes dans cette version de plan.

## K. Critères d'acceptation transverses

1. Un enseignant peut créer, corriger, prévisualiser, publier, assigner et archiver une mission sans accès au code ; une publication ancienne reste intacte.
2. Un étudiant peut suivre des missions **sans coder**, recevoir feedback et note fiable, reprendre après redémarrage et utiliser hints même sans IA.
3. Deux étudiants n'accèdent pas aux notes/progression l'un de l'autre ; le navigateur ne reçoit aucun corrigé privé ; tests négatifs couvrent les contournements.
4. L'enseignant observe le progrès de dix utilisateurs et exporte les notes ; les tentatives concurrentes n'engendrent pas de doublons.
5. L'absence d'OpenRouter/API IA n'affecte jamais les fonctions essentielles.
6. Un Mac peut lancer les services Compose sur réseau local ; puis, après accord uniquement, la publication `shopflow.rapidfox.io` fonctionne à distance, sans casser n8n.
7. Playwright, pytest, Vitest et tests de migration/charge/backup sont mis en place au fur et à mesure, et les preuves réelles figurent dans GitHub/PROGRESS/HANDOFF.
8. Les vrais cours du module sont éditables/importables dans le studio **sans développer de nouvelles pages React à chaque sujet**.

## L. Hors périmètre de la phase plateforme

Créer immédiatement les 24 missions définitives du 28 octobre, applications mobiles natives, SaaS multi-écoles facturé, Kubernetes, VPS, LLM local gourmand, exécution Python arbitraire sur le Mac, microservices séparés. Ces exclusions n'empêchent pas la prise en compte architecturale d'axes avancés.
