# Changelog

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
