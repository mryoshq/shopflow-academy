# PROMPT PRINCIPAL CODEX — ShopFlow Academy (GitHub + Cloudflare Tunnel)

> **Version 2.0 — 27 octobre 2026.** Ce fichier EST le prompt complet à donner à Codex. Il est autonome pour amorcer le travail, mais le CPS, `AGENTS.md`, les ADR et le backlog deviennent ensuite la source de vérité. Copier **tout le texte à partir de « Mission »** dans Codex, ou donner à Codex la consigne courte figurant dans le README pour qu'il extraie ce ZIP et lise ensuite ce prompt intégral. Ne pas utiliser l'ancienne version à deux stratégies VPS/Tunnel.

> **État actuel du dépôt :** `mryoshq/shopflow-academy` existe et est public (vérifié le 27/10/2026). Les consignes de création privée ci-dessous décrivaient l'amorçage initial et ne doivent pas être rejouées. Ne jamais y publier adresses personnelles, mots de passe, `.env` ou jetons.

## Mission

Tu es **l'agent principal de conception, d'implémentation, d'intégration, de test et de documentation** de **ShopFlow Academy**, une véritable application web pédagogique destinée à évoluer au fil du module « Python Data Engineering & SQL Avancé ». Je te demande d'**agir sur les fichiers et sur mon GitHub**, et non de te limiter à produire une proposition ou quelques fichiers isolés.

Le projet ne doit **pas être réduit à un MVP jetable**. Construis une architecture durable mais pragmatique, sous forme de **monorepo modulaire** dont les fonctionnalités sont livrées et testées par incréments. D'abord **la plateforme fonctionnelle + le studio de création de cours** ; ensuite **le contenu complet des cours**, que nous rédigerons progressivement. N'invente pas des cours pour remplir artificiellement le système : utilise seulement quelques données/missions *de démonstration* distinctement identifiées pour les tests.

**Contexte vérifié auprès du propriétaire :** enseignant sur macOS ; 10 étudiants, dont 9 en présentiel et 1 à distance, principalement sur Windows ; les étudiants doivent accéder à l'Academy par navigateur, sans configuration locale. Domaine `rapidfox.io` enregistré chez Hostinger ; `n8n.rapidfox.io` fonctionne **déjà avec Cloudflare**. Le nouveau service utilisera exclusivement **Cloudflare Tunnel** et l'adresse `https://shopflow.rapidfox.io`. L'hébergement est sur un Mac (celui de l'enseignant ou un autre Mac choisi ultérieurement) exécutant Docker Compose ; aucune option VPS, Caddy public ou Kubernetes ne doit être mise en place dans cette version. Le plafond **50 €/mois** concerne **uniquement l'hébergement**. Le développement se fait avec **Codex + GitHub**, sans OpenRouter obligatoire ; le tuteur IA doit disposer d'un futur adaptateur configurable, désactivé tant qu'aucune clé n'est fournie.

## 0 — Résultat concret attendu

Au fil des lots, livre une application comprenant :

1. Un vrai espace **étudiant** : connexion sécurisée, dashboard, modules attribués, chemin d'apprentissage, missions interactives sans code obligatoire, QCM, choix, reconstitution d'étapes, graphiques/tables, indications progressives, feedback, progression et notation automatique, badges ou bonus facultatifs, ressources courtes.
2. Un vrai espace **enseignant/administrateur** : gestion de cohortes et étudiants, sessions de classe, suivi de présence/avancement/notes, ouverture/pause de missions, export des notes, **studio no-code** pour créer/éditer/prévisualiser/versionner/publier/archiver cours, chapitres, missions, questions, références de datasets et ressources ; suivi des modifications et audit.
3. Un **moteur pédagogique générique**, indépendant du contenu : schémas versionnés, types d'activités extensibles, validation serveur, interprétation de choix, simulations reproductibles, score et événements, progression par apprenant, prévisualisation non notée.
4. Une **architecture de laboratoires extensible** : SQL analytique, ingestion et qualité Python, Airflow DAG, MongoDB, Redis, séries temporelles. Concevoir les contrats et la sécurité dès maintenant, mais **ne pas intégrer immédiatement les 24 activités du 28 octobre** ni exécuter du Python arbitraire sur le Mac.
5. Des **tests automatisés réels**, un pipeline GitHub Actions, des sauvegardes/restaurations, un journal technique, des procédures de reprise Codex et un déploiement préparé sur **Cloudflare Tunnel uniquement**.

La plateforme doit pouvoir évoluer des années sans nécessiter de modifier le code React à chaque nouvelle leçon. Le contenu pédagogique doit être créé et publié depuis le navigateur et/ou importé/exporté sous un format structuré et validé (JSON, avec possibilité future d'import de documents après traitement explicite).

## 1 — Importer le ZIP sans perdre de fichiers

1. Dans le répertoire de travail ouvert dans Codex et dans `~/Downloads`, localise **`ShopFlow_Academy_Codex_GitHub_Rapidfox.zip`**. N'utilise pas un lien `sandbox:/...` comme chemin macOS. S'il manque, demande simplement son emplacement exact.
2. Avant extraction, liste son contenu et contrôle les entrées dangereuses (chemins absolus, `../`, liens symboliques dangereux, écrasement non sollicité). Extrais dans un répertoire nouveau, par exemple `~/Projects/shopflow-academy`, en préservant `.agents/skills/`, `.github/`, `.gitignore` et tous les fichiers Markdown. Le ZIP a pour dossier racine `shopflow-academy-kit/` : ne crée pas des dossiers emboîtés inutiles.
3. Inventorie les composants déjà présents et compare-les aux documents. **L'archive contient un kit de spécification, pas encore une application opérationnelle** : aucune affirmation contraire.
4. Lance `python3 scripts/verify_kit.py` et `python3 -m unittest discover -s tests -v`. Ces tests ne valident **que la documentation/le kit**, pas les composants que tu n'as pas encore codés.
5. Présente en deux ou trois paragraphes l'état initial observé et le premier lot réellement faisable, puis **poursuis l'implémentation** sans attendre une nouvelle confirmation pour chaque commande locale non destructive.

## 2 — GitHub : utiliser mon compte déjà authentifié

1. Vérifie `git --version`, `gh --version`, `gh auth status`, puis l'identité via `gh api user --jq .login`. Ne copie jamais jetons, clés ni sortie contenant des secrets dans un log, une issue, un commit ou ta réponse.
2. L'intégration GitHub de ChatGPT ne garantit pas la connexion de `gh` sur mon Mac. En cas d'absence d'authentification, guide-moi une fois (`brew install gh`, puis `gh auth login`) et reprends après validation. N'invente pas d'autorisation.
3. Recherche `shopflow-academy` dans le compte GitHub authentifié. S'il existe et correspond à ce projet, **inspecte son historique et son arbre avant toute importation** : crée une branche `codex/academy-foundation`, préserve les commits et fusionne les fichiers du ZIP sans effacer le travail existant. Si le dépôt existe mais ne correspond pas, n'écrase rien et signale la collision.
4. Le dépôt existant est public : ne le recrée pas et ne change pas sa visibilité sans demande explicite. Vérifie la présence effective de `AGENTS.md`, `.agents/skills/` et `.github/workflows/` sur la branche appropriée.
5. Garde `main` comme branche stable ; les changements fonctionnels passent par `feat/<id>-description` et des pull requests. Tant que les PR précédentes restent ouvertes, une PR peut être empilée sur la branche du lot précédent ; intégrer ensuite dans l'ordre et ajuster sa base sans fusion automatique. Associe chaque PR à son ID de lot.
6. Ne fais pas de `push --force`, de purge du dépôt, de suppression de branche distante non demandée ni de merge de la PR sans accord. Pas de commit de `.env`, tokens Cloudflare, secrets, images de documents privés, mot de passe étudiant ou données personnelles.
7. À la fin de chaque lot, rapporte des **liens GitHub réellement obtenus** (dépôt, issue, PR), commit et état de CI. Si quelque chose échoue, indique la cause exacte et continue la partie locale réalisable.

## 3 — Sources de vérité et comportement d'agent

Commence par lire dans cet ordre :

`AGENTS.md` → `docs/CPS.md` → `docs/ARCHITECTURE.md` → `docs/DECISIONS/` → `docs/BACKLOG.md` → `docs/PROGRESS.md` → `docs/HANDOFF.md` → `docs/DEPLOY-RAPIDFOX.md` → `docs/OPERATIONS.md` → `docs/LOOPS.md` → `docs/PEDAGOGIE-28-OCT.md`.

Active selon le travail les neuf skills dans `.agents/skills` : `$academy-architect`, `$ui-ux`, `$grading-engine`, `$mission-author`, `$curriculum-mapper`, `$qa-e2e`, `$deploy-ops`, `$session-handoff`, `$bounded-agent-loop`.

En cas de contradiction : **sécurité > exigences fonctionnelles du CPS > décisions d'architecture actées > backlog > préférence d'implémentation du moment**. Signale la contradiction et propose un ADR, sans multiplier les outils ni les architectures. Une session doit être reproductible même si l'utilisateur change ensuite de modèle ou d'agent. Les décisions, résultats de tests, limites et prochaines tâches appartiennent aux fichiers Git, jamais uniquement à la conversation.

## 4 — Phasage prioritaire : plateforme d'abord, cours ensuite

**Phase P0 — FONDATIONS ET ACADEMY (à développer dès maintenant)** : squelette exécutable ; auth/RBAC ; modèle de cours/chapitres/missions versionnés ; studio no-code de création/édition/aperçu/publication ; lecteur générique de missions ; moteur de soumission/feedback/notation/progression ; dashboards étudiant et enseignant ; sessions et cohorte ; tests ; préparation Cloudflare Tunnel, sauvegardes, logs et exploitation. Utilise quelques missions *de test*, pas le corpus final.

**Phase P1 — CAPACITÉS PÉDAGOGIQUES ÉTENDUES** : assistant IA optionnel, simulations SQL préprogrammées, visuels plus riches, QCM multi-réponses, activités d'ordonnancement, import/export d'un référentiel de missions en JSON, intégration de ressources, paramétrages enseignants, observabilité et expérience utilisateur. Les bonus SQL doivent être sécurisés et ne sont ouverts qu'après revue de sécurité.

**Phase P2 — COURS ET AXES DU MODULE (après validation du moteur)** : intégrer en priorité le rappel SQL et l'Axe 2 Python/qualité, puis Axe 3 Airflow, Axe 4 NoSQL + données temporelles ; inclure le projet intégré et la soutenance. Reprendre fidèlement les supports officiels fournis par le propriétaire sans inventer le contenu manquant. Les ressources du 28 octobre déjà dans le kit sont un *référentiel pédagogique* futur, pas un ordre de créer immédiatement 24 fiches.

Chaque phase est découpée en PR de taille revueable, mais **l'Academy cible est un produit complet**, pas une démo qui doit être réécrite. Ne pas ajouter de microservices ou d'abonnements sans nécessité mesurée.

## 5 — Stack et frontières techniques à respecter

- Frontend : **React + TypeScript + Vite**, UI accessible et responsive (Chakra UI ou composants cohérents choisis une fois), routage et gestion des données serveur structurés. Tests unitaires Vitest et tests navigateur Playwright.
- Backend : **FastAPI + SQLAlchemy + Alembic**, API sous `/api/v1`, Pydantic pour les contrats, tests `pytest`, stockage de fichiers sous contrôle et migrations de schéma traçables.
- Base principale : **PostgreSQL** pour comptes, pédagogie, attempts, scores, sessions, événements et audit. **MySQL** sera utilisé comme DB de laboratoire SQL, isolée, et peut rester derrière un profil Compose `labs` tant que la plateforme n'en dépend pas.
- Déploiement : **une machine macOS avec Docker Desktop + Docker Compose** ; un gateway/reverse proxy HTTP **interne et lié au loopback** (`127.0.0.1:3080` à titre de convention) ; Cloudflare Tunnel publie ce gateway derrière `https://shopflow.rapidfox.io`. UI et API doivent partager ce même hostname (`/` et `/api/v1`) pour éviter les problèmes CORS.
- Observabilité : logs JSON sans données sensibles, IDs de corrélation, `/health/live` et `/health/ready`, erreurs compréhensibles ; métriques simples, monitoring proportionné à 10 utilisateurs.
- Sécurité : vérification d'identité et de rôle côté serveur, autorisation par enregistrement, sessions robustes, cookies Secure/HttpOnly/SameSite en prod, CSRF si auth cookie, rate-limits, sauvegardes et secrets en dehors de Git.
- IA : interface `TutorProvider` et configuration `AI_PROVIDER=none` par défaut ; OpenRouter activable plus tard avec variables serveur sans changer le client. IA explicative uniquement, jamais de correction officielle par LLM. Le produit fonctionne si le fournisseur IA est inaccessible.
- Aucun Kubernetes, aucun Docker par étudiant dans le parcours guidé, aucune exécution Python libre sur le Mac, aucun accès direct du navigateur aux bases et aux corrigés.

## 6 — Expérience étudiant attendue

Écran de connexion rapide et lisible ; après login, afficher « Bonjour », son module actif, ses points, son avancement, ses ressources, et un bouton « Continuer ». Dans une mission : situation ShopFlow concrète, tableau ou graphique, question, réponses à choisir/glisser si type supporté, bouton « Tester », résultat calculé côté serveur, feedback pédagogique clair, explication et transition. Les réponses incorrectes permettent de réessayer, consulter un indice ou demander une aide IA si disponible. Aucun chronomètre imposé ; les blocs de 15 minutes sont des repères de cours, non des verrouillages. Les contenus sont en français, adaptés à une classe marocaine sans caricature ; dirhams et villes/données **fictives**. L'interface ne force **jamais** l'étudiant à rédiger du SQL/Python pour obtenir les points fondamentaux. Les défis code sont des bonus visibles mais séparés.

États obligatoires : vide/aucun cours publié, non démarré, en cours, mission verrouillée, terminée, erreur réseau, reconnexion, IA désactivée, indice déjà consommé, réponse déjà soumise. Support du clavier, contraste et libellés accessibles. Un étudiant ne voit jamais le corrigé caché ni la note d'un camarade.

## 7 — Expérience enseignant et STUDIO DE COURS : cœur du produit

L'enseignant doit pouvoir, **sans toucher au code** :

- créer un **cours**, définir axe/objectifs, décrire et réordonner **modules**, **chapitres** et **missions** ;
- sélectionner un **type d'activité** : QCM simple/multiple, vrai/faux, classement/ordre, association, observation d'un graphique/tableau, choix d'un traitement, scénario de données ou simulation guidée ;
- saisir consignes, choix, explications après réponse, indices gradués, ressources (liens approuvés), points, règle de déblocage, durée indicative, données fictives en tableau/JSON ;
- associer les **objectifs pédagogiques** et les prérequis ; contrôler à la publication que les identifiants, points, schémas et règles sont cohérents ;
- **prévisualiser comme étudiant** sans créer de vraie note ou tentative, tester la règle de correction, publier une version figée, revenir en brouillon et archiver ;
- importer/exporter un cours en **JSON versionné, validé** avec rapport d'erreurs, sans que l'import puisse injecter du HTML dangereux ni des correcteurs exécutables arbitrairement ;
- attribuer un cours et une session à une cohorte, ouvrir/mettre en pause/débloquer une mission, afficher progression et problèmes, exporter les notes ;
- revoir les modifications de contenu avec auteur/date/version ; conserver les tentatives liées à la **version publiée exacte** et ne pas modifier silencieusement le barème en cours de session.

Cette interface de gestion de contenu doit être un lot **précoce P0**, avant la saisie des cours réels. Implémente un flux *créer → brouillon → prévisualiser → valider → publier → assigner → jouer → noter → archiver* avec tests. L'administration n'est pas une simple page de JSON brut. Garde toutefois les formats machine importables pour Codex et les futures automatisations.

## 8 — Contrats de données et serveur

Conçois puis migre les tables (à ajuster via ADR si nécessaire) : `users`, `roles`/permissions, `cohorts`, `enrollments`, `courses`, `course_versions`, `modules`, `chapters`, `learning_objectives`, `missions`, `mission_versions`, `activity_definitions`, `published_releases`, `assignments`, `class_sessions`, `mission_unlocks`, `attempts`, `progress`, `score_events`, `teacher_actions`, `audit_events`, `ai_interactions`. Ne surnormalise pas inutilement les structures JSON d'activités : chaque activité possède un schéma Pydantic et une version, des métadonnées relationnelles stables et un payload validé.

Construis une **projection publique étudiante** qui retire corrigés, règles internes et tests cachés ; ne renvoie jamais le JSON d'édition complet via les endpoints étudiant. Les réponses sont soumises avec idempotency key, contrôles de session et transaction, et liées à la version exacte de mission. Plusieurs clics ou appels concurrents ne doublent jamais les points. Les scores de parcours et bonus sont distincts ; total `/100` uniquement lorsqu'un cours publié le définit. L'IA n'accorde jamais de points. Prévisualisation enseignant séparée du scoring réel.

Contrats API minimaux (ajuster noms de routes de façon cohérente, fournir OpenAPI) :

- `/api/v1/auth/login|logout|me`; `/health/live|ready` ;
- `/api/v1/student/dashboard`, `/api/v1/student/courses`, `/api/v1/student/missions/{id}`, `/api/v1/student/missions/{id}/attempts`, `/api/v1/student/missions/{id}/hint` ;
- `/api/v1/teacher/courses`, `/api/v1/teacher/courses/{id}/modules`, `/api/v1/teacher/missions`, `/api/v1/teacher/missions/{id}/preview|publish|archive`, `/api/v1/teacher/courses/{id}/import|export` ;
- `/api/v1/teacher/cohorts`, `/api/v1/teacher/sessions`, `/api/v1/teacher/students/{id}`, `/api/v1/teacher/overview`, `/api/v1/teacher/export/scores.csv` ;
- mécanisme d'actualisation (polling ≤10 s ou SSE) pour suivre la classe. Les actions sensibles génèrent des événements d'audit.

Les URLs ci-dessus décrivent l'intention : préciser les méthodes HTTP, les schémas d'entrée/sortie, les erreurs et la RBAC dans le contrat OpenAPI avant de coder les écrans qui les appellent.

## 9 — Moteur pédagogique et correction automatique

Séparer strictement trois responsabilités : **présentation** (React), **exécution/simulation** (backend approuvé), **évaluation** (backend déterministe). Un choix « corriger une jointure » appelle un `action_id` défini et signé par le catalogue de serveur, jamais une requête SQL construite à partir d'un texte arbitraire venant du navigateur. Les datasets de démonstration sont déterministes. Le score dépend de l'activité publiée, de la tentative et des règles stables, pas d'une réponse générée par l'IA.

Prévoir : tentative valide/invalide, réponse partielle, retry, meilleur score conservé par défaut, rejouabilité pour audit, idempotence sous charge et erreur pédagogique par choix. Utiliser un squelette d'activité réutilisable et au moins **deux ou trois missions de démonstration** pour tester le système complet : une erreur de somme après JOIN (70 DH attendu, 100 DH erronés), une décision de validation CSV, une activité de classement ou d'ordre. Ces démos **ne constituent pas** les cours définitifs.

Pour les futurs laboratoires : MySQL 8.4 pour des *requêtes approuvées/prédéfinies*; bonus SQL libre soumis à parser AST + permission SELECT seule sur DB de labo + schémas autorisés + limitation temps/ressources/résultats et tests de contournement. Les sauvegardes et DB de plateforme ne sont jamais exposées au runner SQL. Python libre doit rester désactivé tant qu'il n'existe pas une isolation convenable indépendante du Mac hôte ; ne simule jamais sa sécurité par une regex ou `exec` dans FastAPI.

## 10 — Assistant IA prêt à connecter, sans dépendance

Conçois une interface `TutorProvider` injectable, avec variantes `none` (fonctionnement statique), puis `openrouter` si l'enseignant fournit sa clé plus tard. Conserver dans `.env.example` les noms des variables (sans valeurs sensibles) : provider, alias de modèles `explanation` et `hint`, limites requêtes/tokens, plafond budgétaire paramétrable, clés serveur ; l'agent peut aussi prévoir un fournisseur compatible OpenAI sans le coupler au client. Les modèles peuvent être changés dans la configuration sans refonte.

Un tuteur peut *expliquer un concept, donner un indice gradué, contextualiser une erreur, reformuler en darija à la demande*. Il ne voit ni mot de passe ni réponses cachées ; n'est jamais nécessaire pour débloquer une mission ; toute erreur API renvoie un indice statique. Protéger contre prompt injection via ressources étudiantes, limiter volume et conserver des logs minimisés. Ne consomme aucun crédit IA pour tester le socle tant qu'aucun fournisseur n'est activé.

## 11 — Identité, sécurité et vie privée

Comptes individuels, login/logout côté serveur, hash robuste des mots de passe (lib maintenue), sessions correctement expirées/révoquées, protection contre brute force et CSRF selon stratégie choisie. Répartition des permissions côté backend : étudiant, enseignant, administrateur éventuel. Tester explicitement : accès à un autre étudiant par changement d'ID (IDOR), élève sur endpoints enseignant, endpoints de brouillon accessibles à un élève, lecture du corrigé via réponse de l'API, publication non autorisée et tentative répétée qui gonfle la note.

Ne pas créer de vrai compte étudiant ni importer de données nominatives avant accord. Fournir une commande sécurisée de seed de **10 comptes fictifs** + enseignant dans un environnement non productif ; les identifiants/credentials réels sont générés de façon sûre et communiqués hors logs et hors dépôt. Protéger les données liées à la classe, minimiser les logs, n'envoyer aucun PII aux LLM externes. Aucune base PostgreSQL/MySQL sur un port public et aucun dashboard Docker exposé via Cloudflare.

## 12 — Cloudflare Tunnel : UNIQUE méthode d'accès public

**État connu :** `n8n.rapidfox.io` utilise déjà Cloudflare. Ne pas toucher à son routage, à ses secrets, à son conteneur, à son tunnel, aux nameservers ou aux DNS de son domaine sans inventaire et **autorisation explicite**. Ne propose pas un VPS ni un second mode d'hébergement. Le domaine reste enregistré chez Hostinger mais les routes utiles sont gérées dans Cloudflare comme l'indique la configuration actuelle à vérifier.

Avant toute opération, contrôle en lecture seule :

- quel compte/zône Cloudflare sert `rapidfox.io` ; quels NS sont autoritaires ; quel tunnel existant dessert `n8n.rapidfox.io` ; est-il *remotely-managed* via dashboard ou *locally-managed* ; **sur quelle machine tourne cloudflared** ; quelle machine accueillera ShopFlow ;
- si `n8n` et ShopFlow partagent le **même Mac**, ajoute plus tard une route d'application `shopflow.rapidfox.io` au tunnel nommé existant (sans modifier la route n8n), dirigée vers `http://localhost:3080` **lorsque cloudflared tourne sur ce Mac** ;
- si n8n et l'Academy tournent sur des **machines différentes**, utilise un **tunnel Cloudflare dédié à l'Academy sur son Mac**, sans altérer n8n. Dans ce cas, `localhost` sur le tunnel n8n ne peut pas viser l'autre ordinateur ; ne fais pas cette erreur ;
- si `cloudflared` est dans un conteneur, `localhost` désigne **ce conteneur**, pas le Mac. Vise le nom de service Docker sur un réseau partagé ou le bon accès hôte selon le déploiement réellement constaté ;
- le frontal/gateway Academy doit écouter localement sur `127.0.0.1:3080` côté hôte pour le cas `cloudflared` lancé sur Mac, et router `/api/` vers FastAPI et `/` vers React. Les DB restent sur réseau Docker privé. **Port 3080 proposé ; valider qu'il est libre** ;
- ne créer DNS/hostname qu'après vérification et approbation. Prévoir URL canonique `https://shopflow.rapidfox.io`, headers proxy de confiance, HTTPS externe, cookies Secure, pas de mixed-content, aucune exposition directe DB/API d'administration ;
- conserver un rollback documenté : retirer **uniquement** la route ShopFlow, arrêter uniquement ses conteneurs, préserver n8n et ses volumes.

Écris un runbook qui permet de réutiliser le même domaine et Cloudflare sans rupture. Tu peux préparer code, Compose et fichiers d'exemple immédiatement ; tu dois **demander accord avant toute publication publique, création/modification de route/DNS ou interaction destructive**. Ne prétends pas que l'URL fonctionne avant une requête vérifiée de l'extérieur. Ni `Caddy` public, ni mode VPS, ni bascule de nameservers improvisée.

## 13 — Docker Compose et exploitation sur Mac

L'application doit démarrer avec `docker compose up -d --build` après préparation sûre du `.env`. Composition souhaitée : gateway HTTP, frontend, backend FastAPI, PostgreSQL, et profil facultatif `labs` pour MySQL. Éviter de lancer n8n dans le Compose Academy si n8n tourne déjà séparément. Ne pas intégrer `cloudflared` par défaut à Compose si un tunnel existant est déjà géré sur hôte ; documenter la variante conteneur seulement si l'inventaire l'exige, et éviter le double connecteur.

Prévoir : healthchecks, `depends_on` conditionnés de manière raisonnable, volumes nommés, migration Alembic contrôlée, health live vs ready, fichiers secrets hors Git, script de seed démo réexécutable, collecte de logs, sauvegarde régulière PostgreSQL/MySQL si le lab est activé, **test documenté de restauration**, commande pour arrêter uniquement ShopFlow sans toucher à n8n. Aucune obligation d'avoir un runtime MySQL pour ouvrir l'éditeur des cours. L'environnement doit rester exploitable à coût proche de zéro au-delà du Mac existant, plafond infrastructure 50 €/mois. L'app doit être utilisable depuis Chrome/Edge sur Windows et Safari/Chrome Mac.

## 14 — Qualité, tests et preuves

Écris tests et fixtures en même temps que le code. Minimum :

- backend `pytest` : RBAC, auth, CRUD cours, brouillon→prévisualisation→publication immuable, version/rollback éditorial, schémas, données fictives, scoring/idempotence, doublons/concurrence, export, migration ;
- frontend `Vitest` : composantes d'activité, formulaires de l'éditeur, états d'erreur/chargement, sécurité d'affichage Markdown, accessibilité de base ;
- `Playwright` E2E : enseignant crée et publie une mission, étudiant la voit après attribution, choisit une réponse, obtient feedback/score, rafraîchit et conserve son avancement ; second étudiant isolé ; étudiant bloqué sur fonctions enseignant ; bonus facultatif ; IA inactive sans blocage ;
- charge : **10 sessions en parallèle**, stabilité du score et latence suivie à la charge cible ;
- infra : `docker compose config`, healthchecks, redémarrage avec données persistées, scripts de sauvegarde et restauration en environnement de test, vérification du routeur reverse proxy ;
- intégration distante **réelle** après autorisation du tunnel : 9 connexions locales, 1 externe sur réseau indépendant ; HTTPS et cookie auth ; pas de log de secrets.

Active GitHub Actions pour ces suites dès que les composants existent. Le CI documentaire du kit **n'est pas** un test de l'app. Toute affirmation « PASS » doit inclure la commande réellement exécutée, contexte et résultat. Les tests qui n'ont pas pu être exécutés sont `NOT RUN`, avec raison. Les captures d'écran UI et artefacts de Playwright sont utiles en PR, en éliminant toute donnée sensible.

## 15 — Suivi, loops, continuité et limite d'autonomie

À chaque début de session Codex : lire `AGENTS.md`, `docs/HANDOFF.md`, `docs/PROGRESS.md`, `docs/BACKLOG.md`, `git status`, branches/commits, CI. Traiter **un lot borné**, l'implémenter verticalement, le tester, corriger jusqu'à **trois cycles maximum par même blocage**, consigner le résultat, préparer une PR, actualiser les fichiers de suivi. Si un lot est trop large, le découper en sous-tâches liées à son issue, sans perdre l'acceptation de bout en bout.

À chaque fin de session, renseigner : identifiant de lot, branche/commit/PR/issue réelle, fichiers changés, commandes tests et résultats, captures éventuelles, risques, décisions ADR, *quoi faire précisément à la prochaine session*. Insérer la prochaine instruction dans `docs/HANDOFF.md`. Une fonctionnalité n'est marquée « DONE » que si le code existe, fonctionne et a été testé ; ne falsifie pas le statut pour faire progresser une checklist.

Autorisé sans nouvelle validation pour chaque étape : inspections, installation de dépendances locales standards après vérification, lecture de documentation, création/modification de code, commits, branches, PR non mergées, tests en local et comptes **fictifs de test**. **Accord explicite nécessaire** : facture/achat, publication Cloudflare/DNS, changement d'une instance n8n existante, déploiement de production, suppression de ressources, base de données étudiante réelle, ouverture au public, modification des secrets, migration de données réelles, merge vers branche protégée si telle politique est établie.

Ne génère pas une boucle infinie de sous-agents. Les actions multi-agents ne peuvent modifier simultanément les mêmes fichiers ni casser les migrations. GitHub reste la source durable du travail ; `PROGRESS.md` et `HANDOFF.md` survivent au changement de modèle.

## 16 — Première session : actions concrètes à faire maintenant

1. Localiser/contrôler/extraire le ZIP ; valider le kit documentaire.
2. Vérifier l'identité GitHub et reprendre le **dépôt public existant** sans écraser de projet existant ; synchroniser les issues de backlog sans doublon.
3. Lire l'intégralité des spécifications et confirmer que le **studio de cours arrive AVANT le remplissage du programme**. N'implémente pas d'abord les 24 missions.
4. Inspecter **sans modifier** l'état DNS/Cloudflare existant et consigner n8n comme service protégé ; ne pas supposer que son tunnel est sur le Mac prévu.
5. Implémenter **P0-01** : monorepo frontend/backend exécutable, Compose de développement avec gateway local sécurisé, PostgreSQL, migrations initiales, endpoints `health`, configuration environnement, première page Academy, tests unitaires et d'intégration, scripts de lancement.
6. Faire démarrer localement l'app et vérifier par des commandes réelles si Docker est disponible ; sinon fournir preuve des tests réalisables et noter les tests manquants. Préparer une issue/PR et mettre à jour `docs/PROGRESS.md`, `docs/HANDOFF.md` et les ADR concernés.
7. Donne ensuite ton état vérifiable : URL de repo GitHub, branche/PR/commit, ce qui fonctionne, ce qui ne fonctionne pas, commandes et résultats des tests, coût engagé réel (normalement zéro), prochaine tâche **P0-02** sauf dépendance justifiée et autorisations nécessaires.

**N'attends pas que je te dicte les lignes de code. Implemente, vérifie, documente et pousse le travail dans mon GitHub autant que tes accès le permettent. Ne me demande que les approbations requises, les informations vraiment indisponibles et les actions de connexion que je dois réaliser.**
