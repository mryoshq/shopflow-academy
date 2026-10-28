# Changelog

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
