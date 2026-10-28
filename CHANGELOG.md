# Changelog

## 2026-10-28 — Sprint 2, partie M : cartes à retourner (`claude/lucid-brahmagupta-htwgun-m`)

- `data.kind: flashcards` (2 à 30 cartes recto/verso, mise en forme légère) dans les leçons et le nouvel élément non noté « Révision » (`### Révision :`, `kind: review`), compté comme une leçon.
- Lecteur : une carte à la fois, retournement 3D (clic, Espace, Entrée ; instantané en mouvement réduit), flèches, compteur, « Mélanger », « Je savais / À revoir » gardé dans le navigateur sans effet sur la note, verso annoncé aux lecteurs d'écran. Exemple dans le cours de démonstration. ADR-0028.

## 2026-10-28 — Sprint 2, partie I : PWA, confort, couleurs (`claude/lucid-brahmagupta-htwgun-i`)

- Application installable : manifeste, service worker limité aux fichiers statiques (jamais l'API ni les médias), page hors ligne, bandeau « Nouvelle version disponible », invite d'installation ; CSP `worker-src`/`manifest-src 'self'`.
- Bouton « Confort » des étudiants : pomodoro facultatif et radio d'ambiance (flux YouTube nocookie définis sur le serveur, vide par défaut, son coupé au départ ; trois flux proposés dans l'ADR, non activés).
- Couleurs : tableau de contrastes, bouton principal sombre AAA, bordure des champs à 3:1 ; lien « Aller au contenu ». ADR-0024.

## 2026-10-28 — Correctifs de relecture (`claude/lucid-brahmagupta-htwgun-relecture`)

- Une leçon ne rapporte jamais de points, même si une ancienne version était notée ; une réussite notée ne vaut pas lecture.
- Reprise entre versions par mission (même mission, ou même slug à la même place) : un slug réutilisé dans un autre bloc est une autre mission, une tentative ne compte qu'une fois.
- Un bloc ouvert pendant le chargement de la page rafraîchit le tableau de bord ; « Activer les notifications hors de l'onglet » reste proposé si l'autorisation est déjà donnée sans abonnement Web Push.

## 2026-10-28 — Sprint 2, partie H : suivi en direct (`claude/lucid-brahmagupta-htwgun-h`)

- Présence (30 s), grille étudiants × blocs dans « Ma classe », message aux étudiants (280 caractères, accusés de lecture), notifications automatiques, centre de notifications de l'enseignant (aide, blocage, bloc terminé à X %, ouverture automatique, déconnexion ; réglages par type), cloche et historique, notifications système et Web Push facultatif.
- Déblocage d'un bloc pour un seul étudiant (« Ouvert pour vous »), ouverture automatique des blocs selon le temps restant (planning pondéré, rattrapage, pause, décalage, avance, recalcul, jamais de fermeture). Migration 0012. ADR-0023.

## 2026-10-28 — Résultats et accompagnement (`codex/resultats`)

- Résultats : points principaux et bonus séparés, pourcentage principal, missions principales réussies/non réussies et détail par étudiant ; icône et texte « À accompagner » sous un seuil réglable (50 % par défaut), tri et filtre, top 5 des missions les moins réussies sur la classe entière.
- Endpoint de lecture et CSV propres à Résultats, réservés au propriétaire ; points lus dans le moteur existant, dégressivité et meilleur essai compris. Format CSV conservé (BOM, séparateur, nombres et colonnes historiques), colonne `a_accompagner` ajoutée ; le compteur de réussite suit les missions principales affichées. Sans migration ni modification du suivi ou de la notation.

## 2026-10-28 — Sprint 2, partie K : classement facultatif (`codex/k-classement`)

- Page « Classement » et onglet « Progression du jour », actualisation toutes les 5 secondes, points principaux et bonus distincts, ex æquo au même rang, ligne personnelle marquée « Vous ».
- Réglages enseignant : désactivé par défaut, top 3 avec ex æquo et position personnelle, masquage pendant un bloc ouvert. Filtrage serveur, inscription/propriété, CSRF, aucun identifiant de connexion exposé. Pseudonyme choisi (24 caractères), nom neutre en attendant.
- Podium SVG original, Chakra v3, clavier, clair/sombre, mouvement réduit et contrôle axe. Migration `0011_leaderboard` limitée aux préférences et pseudonymes. ADR-0026. Aucun changement de notation ou d’export ; aucun contenu de cours ajouté.
- Retours CI K : propriété vérifiée avant validation des réglages (404 pour une autre classe même avec un corps invalide), navigation sans débordement mobile avec libellés longs ; régressions ciblées ajoutées.

## 2026-10-28 — Correctif : blocs terminés et republication (`claude/lucid-brahmagupta-htwgun-lecons`)

- Un bloc est « terminé » quand toutes ses missions notées sont réussies (hors bonus et hors leçons) ; « leçons lues x/y » s'affiche à part (étudiant, « Ma classe », vue de classe). Le score « missions réussies » ne compte plus les leçons.
- Après une republication, une leçon validée dans n'importe quelle version publiée du même slug reste lue, et une mission inchangée (même définition) reste réussie. Calcul à la lecture : les validations déjà enregistrées comptent tout de suite, sans migration ni copie.

## 2026-10-28 — Sprint 2, partie L : décourager le clic au hasard (`claude/lucid-brahmagupta-htwgun-l`)

- « Mon cours » → « Règles » : points dégressifs (100/70/50 puis 30 %, missions principales seulement), pause après une erreur (10/20/30 s, 429 côté serveur), lecture minimale des leçons (200 mots/min, 10 à 60 s, vérifiée par le serveur), repérage des clics rapides (badge dans « Ma classe », sans sanction), annonce modifiable. Tout désactivé par défaut sauf le repérage ; réglages audités.
- Pourcentage enregistré par essai, meilleur essai retenu, non rétroactif (date d'activation), rejouable. Migration 0010. ADR-0027.

## 2026-10-28 — Logo du propriétaire (`claude/lucid-brahmagupta-htwgun-logo`)

- En-tête et page de connexion : logo complet à côté du nom « ShopFlow Academy » en texte ; variante verte du propriétaire en mode sombre.
- Favicon SVG et PNG 16/32 : tête du renard seule, traits épaissis, couleurs de la variante verte en mode sombre ; icônes 192/512, apple-touch-icon et icône masquable tirées de la variante verte ; image de partage 1200×630 et balises Open Graph. ADR-0022c (remplace le monogramme de l'ADR-0022b).

## 2026-10-28 — Sprint 2, partie G2 : plan du cours, objectifs par catégorie, logo et icônes (`claude/lucid-brahmagupta-htwgun-g2`)

- Studio et aperçu : plan module → bloc → éléments, blocs repliables (le bloc courant ouvert), une ligne par élément (type, points, durée, badges Leçon / Bonus / Exécution, état), en-tête de bloc (numéro, durée, points), compteurs, recherche et filtre par type ; navigation par bloc dans l'aperçu.
- Objectifs groupés par catégorie (`category` facultatif, sinon déduit de `SQL-`, `PY-`, `BLOC-`), couverture cliquable, alerte si aucun élément ne couvre l'objectif. Migration 0009.
- Étudiant : objectif de chaque bloc ouvert en une phrase, aucun code d'objectif dans les réponses de l'API.
- Logo original (monogramme), favicon SVG, PNG 32/192/512, apple-touch-icon, icône masquable, `theme-color` clair et sombre. ADR-0022b.
## 2026-10-28 — Sprint 2, partie G : mise en page des leçons (`claude/lucid-brahmagupta-htwgun-g`)

- Leçon structurée : `objective`, `hook`, `key_terms`, `example`, `practice` (facultatifs) affichés dans un ordre fixe (objectif, accroche, vocabulaire, texte, exemple résolu, média, « À vous ») ; l'ancien format `body` seul reste valable.
- `data.description` pour tous les médias : lue par les lecteurs d'écran (`aria-describedby`), visible seulement via « Description du média ».
- Mise en forme légère sûre (gras, code en ligne, listes, sous-titres dans `body`) dans tous les textes du cours ; rendu React, aucun HTML interprété.
- Compilateur : nouveaux champs, erreurs localisées, avertissements de lisibilité (paragraphe > 80 mots, objectif de plus d'une phrase). `docs/COURSE-AUTHORING.md` (§ 5 bis, 5 ter), cours de démonstration, ADR-0022.

## 2026-10-28 — Sprint 2, partie E : suggestions (`claude/lucid-brahmagupta-htwgun-e`)

- `docs/SUGGESTIONS.md` : 14 améliorations classées par valeur et effort (S/M/L), distinctes de ce que le sprint a livré ; recommandation : signal des demandes d'aide hors de l'onglet et contrôle d'avant séance avant le prochain cours.

## 2026-10-28 — Sprint 2, partie B : expérience simple et mode sombre (`claude/lucid-brahmagupta-htwgun-b`)

- Mode sombre : chaque jeton du thème a sa valeur `_dark` ; sélecteur « Système / Clair / Sombre » mémorisé dans le navigateur, sans flash (`public/theme-init.js`, compatible CSP). axe 0 violation sérieuse dans les deux thèmes.
- Étudiant : lecteur en une colonne, aide repliable (état mémorisé), « Mission suivante » en bouton principal après une réussite, « Presque ! Réessayez » au lieu de « À revoir », raccourcis 1 à 9 et Entrée, libellés longs qui passent à la ligne (aucun défilement horizontal à 390 px).
- Enseignant : « Réinitialiser le mot de passe » d'un étudiant (affiché une seule fois, sessions fermées, audité sans le mot de passe).
- `scripts/login_sheets.py` : fiches de connexion imprimables (adresse, QR code, identifiant ; mot de passe seulement avec `--with-passwords`), écrites hors du dépôt. QR code sans dépendance (`scripts/qrcode_min.py`). ADR-0021.

## 2026-10-28 — Sprint 2, partie C : exécution de code préconfiguré (`claude/lucid-brahmagupta-htwgun-c`)

- Service `labdb` (PostgreSQL 16, réseau interne dédié, volume et identifiants à part) et `lab-init` (rôles `lab_reader` en lecture seule bornée, `lab_owner`) ; jeu fictif de démonstration ; `datasets/shopflow-lab.sql` chargé à l'import.
- « Exécuter » sur les requêtes du cours (seulement celles stockées dans la mission), sortie des extraits Python exécutés une fois sur le Mac dans un conteneur jetable sans réseau ; défi SQL bonus : contrôle `sqlglot`, exécution en lecture seule, correction par comparaison avec le résultat attendu.
- Le compilateur exécute les requêtes et extraits et signale les échecs avec fichier et ligne. 38 contournements testés. ADR-0017. `scripts/init_lab_env.py` (secrets du laboratoire).

## 2026-10-28 — Sprint 2, partie F : médias et animations codés (`claude/lucid-brahmagupta-htwgun-f`)

- `data.kind` `animation` (tables, surlignage, flèches, compteur, badge ; lecture, pause, pas à pas, recommencer ; description textuelle), `mindmap` (arbre au clavier, repliable, apparition progressive, alternative en liste), `flow` (jeton animé, compteurs acceptées/rejetées), `video` (youtube-nocookie.com / player.vimeo.com en iframe isolée, ou fichier du cours avec sous-titres).
- Vidéos du cours : adresse de contenu, volume `media_data` servi en lecture seule par le gateway ; CSP `frame-src` restreinte ; `prefers-reduced-motion` respecté. ADR-0018. Exemples dans `docs/examples/demo-course/`.

## 2026-10-28 — Sprint 2, partie D : chaîne d'import du cours Markdown (`claude/lucid-brahmagupta-htwgun-d`)

- `scripts/course_md.py compile|import [--publish]` et `app.course_md` : erreurs en français avec fichier et ligne, résumé par module et par bloc, couverture des objectifs, rapport `RETOURS-PLATEFORME.md` ; import en brouillon du cours (création ou mise à jour), publication facultative.
- Publication : les missions inchangées gardent leur version, donc la progression et les notes des étudiants ; nouveaux blocs fermés.
- Nouveaux contenus : leçon non notée (« J'ai compris »), graphique en courbes (points absents), code à lire, comparaison côte à côte ; `run` et `sql_challenge` acceptés et stockés (exécution en partie C) ; introduction de module (migration 0008).
- Exemple `docs/examples/demo-course/` compilé en CI et importé sur la stack de test ; skill `course-import` ; `docs/COURSE-AUTHORING.md` à jour (journal des changements de syntaxe). ADR-0020.

## 2026-10-28 — Sprint 2, partie A : blocs, « Ma classe », aide (`claude/lucid-brahmagupta-htwgun`)

- Journée en blocs de 15 minutes : état d'ouverture par classe et par bloc (migration 0007), blocs nouveaux fermés, aucun contenu exposé pour un bloc fermé ; « Ouvrir le bloc suivant », ouvrir/fermer un bloc, audit ; repère horaire réservé à l'enseignant.
- Étudiant : modules et blocs (ouvert, terminé, « Bientôt disponible »), « Continuer » vers la première mission principale non réussie, badge « Bonus », bouton « J'ai besoin d'une explication » (reçue → traitée).
- Enseignant : trois zones « Mon cours », « Ma classe », « Résultats » ; classe et cours uniques créés ou retrouvés automatiquement ; publication donnée directement à la classe ; demandes d'aide et statistiques par mission ; options avancées repliées.
- Ménage des cours de test (simulation par défaut, archivage seulement) : interface et `python -m app.course_cleanup`.
- `APP_SECRET` obligatoire en production (le backend refuse de démarrer sans lui). ADR-0019. `## Bloc :` accepté dans le format du cours.

## 2026-10-28 — P0-10 terminé, décisions du propriétaire (`feat/p0-10-owner-decisions`)

- `https://shopflow.rapidfox.io` en ligne ; `smoke_public.py` se connecte en production avec le compte du propriétaire et vérifie qu'un compte de démo est refusé.
- Studio, import/export, historique et suivi de classe réservés au propriétaire du cours (404 sinon) ; listes et recherche filtrées ; tests générés sur toutes les routes de cours.
- `app.account_policy` : un seul enseignant, étudiants `@ynov.com` seuls actifs, autres comptes désactivés sans suppression, sessions révoquées, audit ; simulation par défaut.
- Stack de test séparée (`scripts/test_stack.py`, projet `shopflow-academy-test`, port 3180, base jetable) ; Playwright, charge et persistance refusent la production ; CI alignée ; ADR-0016.
- Le cours de démonstration refuse de s'installer en production.

## 2026-10-28 — P0-10 exploitation, partiel (`feat/p0-10-operations`)

- Service Compose `backup` : sauvegardes PostgreSQL vérifiées toutes les 6 h, rétention, SHA-256.
- `scripts/restore_check.py` (restauration testée dans un conteneur jetable), `scripts/ops_status.py` (contrôle avant cours), rotation des journaux, `docs/RUNBOOK.md`, ADR-0015.

## 2026-10-28 — P0-09 qualité et démonstration complète (`feat/p0-09-quality`)

- Matrice d'autorisation générée depuis toutes les routes (anonyme, rôles, CSRF) et contrôles inter-comptes.
- Parcours E2E complet : l'enseignant importe et publie la démo, un étudiant la termine, la note persiste, un autre étudiant n'y a pas accès.
- `scripts/load_test.py` (10 étudiants + enseignant) et `scripts/persistence_check.py` (redémarrage et recréation), ajoutés à la CI ; `docs/QUALITY.md`.

## 2026-10-28 — P0-08 administration de contenu (`feat/p0-08-content-admin`)

- Format portable `shopflow-course` v1 ; export du brouillon ou d'une version publiée exacte ; import vérifié (simulation, rapport d'erreurs par chemin, jamais d'écrasement).
- Recherche et tri des cours dans le studio ; historique des modifications ; restauration du brouillon depuis une version publiée avec sauvegarde téléchargeable.

## 2026-10-28 — P0-07 tableau de bord enseignant (`feat/p0-07-teacher-dashboard`)

- Onglet « Suivi de classe » : classes du propriétaire, élèves (missions réussies, score, mission en cours, dernière activité, actif, besoin d'aide), détail par élève, actualisation toutes les 5 s.
- Interventions auditées : pause/reprise de séquence, déblocage individuel d'une mission, export CSV (Excel, anti-injection), journal ; migration 0006.
- Côté étudiant : état « En pause » ; correctif du focus clavier dans l'activité d'ordre ; contraste AA des badges succès/safran.
- Studio aligné sur le thème (palette `brand`).

## 2026-10-28 — P0-06 notation et progression (`feat/p0-06-grading-progress`)

- Points par tentative (barème tout ou rien ou partiel), meilleur score conservé, bonus séparés, progression et totaux recalculés depuis le journal des tentatives (aucun double comptage), rejeu vérifiable ; migration 0005.
- Historique personnel des essais ; score par mission et par cours dans le lecteur et le tableau de bord.
- Studio : champs « Barème » et « Explication ».

## 2026-10-28 — P0-05 lecteur étudiant (`feat/p0-05-student-player`)

- Tableau de bord étudiant : « Bonjour », cours attribués, états des missions (à faire, en cours, réussie, verrouillée), bouton « Continuer », ressources, emplacement score à venir.
- Lecteur de mission : situation, tableau ou graphique avec alternative en tableau, choix simple/multiple, vrai/faux, ordre (boutons monter/descendre), association (listes), feedback serveur, explication, réessai, indices progressifs, navigation, états erreur réseau, session expirée (brouillon conservé), IA désactivée.
- API `student/dashboard`, `student/missions/{id}`, tentatives idempotentes en ajout seul, indices un par un, limitation 20/min ; migration 0004.
- Cours de démonstration idempotent (frais de livraison 70 DH / 100 DH, validation CSV, ordre d'un pipeline) réservé aux comptes `demo.*`.
- Thème Chakra UI v3 unique (`theme.ts`, `docs/DESIGN.md`), écran de connexion et en-tête redessinés.

## 2026-10-28 — Correctifs de revue P0-01 à P0-04 (`fix/revue-p0-01-04`)

- Bloquant B1 : la vue étudiante utilise des identifiants de choix opaques par version de mission et un ordre mélangé déterministe ; les réponses d'ordre et d'association ne sont plus lisibles.
- Test de réversibilité de la chaîne Alembic.

## 2026-10-27 — Publication préparée (`ops/publication-shopflow`)

- Production : OpenAPI masqué, origines autorisées explicites (`APP_EXTRA_ORIGINS`), CSP et `Permissions-Policy` dans le gateway.
- `scripts/smoke_public.py` : contrôle de bout en bout local ou public sans afficher de secret, y compris non-régression n8n.
- ADR-0010, journal de publication et runbook d'exploitation.

## 2026-10-27 — P0-04 ([PR #14](https://github.com/mryoshq/shopflow-academy/pull/14), ouverte)

- Studio enseignant Chakra UI v3 pour créer, modifier, réordonner, prévisualiser, valider, publier, attribuer et archiver des cours et missions de démonstration depuis le navigateur.
- Lecteur étudiant initial des versions attribuées, sans corrigé ni notation ; tests Playwright du parcours enseignant et étudiant.
- Compte enseignant réel créé ou actualisé localement avec mot de passe généré hors Git et sans e-mail.
- Corrections de la revue P0-03 : comparaisons SQL, `display_data` typé, projection étudiante protégée et permissions après archivage.
- Documentation du dépôt public et ordre de fusion manuelle des PR #11 à #14.

## 2026-10-27 — P0-03 ([PR #13](https://github.com/mryoshq/shopflow-academy/pull/13), ouverte)

- Référentiel cours/objectifs/modules/chapitres/missions, brouillons typés, cohortes et assignations.
- Publication de versions figées avec projection étudiante sans clé de correction ; contrôle d'accès à la version assignée.
- API enseignant de création, lecture, édition et suppression des brouillons, prévisualisation et journal d'audit.

## 2026-10-27 — P0-02 ([PR #12](https://github.com/mryoshq/shopflow-academy/pull/12), ouverte)

- Authentification par session, Argon2, CSRF, expiration, révocation et limitation des tentatives.
- Rôles enseignant/étudiant et contrôle des profils par propriétaire.
- Écran de connexion Chakra UI v3 et espaces vides par rôle.
- Migration PostgreSQL, seed fictif local et import séparé de dix comptes étudiants fournis par le responsable, sans notification.

## 2026-10-27 — P0-01

- Socle React/FastAPI/PostgreSQL/Compose, gateway local, migrations, CI et documentation d'exploitation.
