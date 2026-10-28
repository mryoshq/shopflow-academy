# ADR-0025 — Observateur en lecture seule

- Statut : accepté (28/10/2026)
- Contexte : sprint 2, partie J (après M et N)

## Décision

- Nouveau rôle `observer` (valeur ajoutée à l'énumération `user_role`) et table `observers` : `user_id`, `owner_id` (l'enseignant propriétaire), `show_answers`, `named` (faux par défaut). Migration `0013_observers` (après `0012_live_tracking`, une seule tête).
- **Comptes gérés par l'enseignant** (onglet « Observateurs ») : création avec un identifiant (`[a-z0-9._-]`, 3 à 64), mot de passe lisible généré par le serveur **affiché une seule fois** (jamais stocké en clair, jamais relisté), « Nouveau mot de passe » (sessions révoquées), désactivation (sessions révoquées, connexion refusée), réactivation. Chaque action est inscrite dans `audit_events` (`observer.create`, `observer.update`, `observer.password_reset`). Un autre enseignant ne voit ni ne gère l'observateur (404).
- **Périmètre en lecture seule**, classes publiées du propriétaire uniquement :
  - `GET /api/v1/observer/me`, `/observer/classes` ;
  - `/observer/classes/{id}/course` : cours publié tel que le voient les étudiants (projection sans corrigé) ; corrigés (définitions privées) ajoutés **seulement** si l'enseignant coche « Corrigés visibles dans l'aperçu » ; aucune exécution de code, aucune réponse enregistrée ;
  - `/observer/classes/{id}/progress` : progression (missions réussies, leçons lues, points, essais, mission en cours, besoin d'aide) ;
  - `/observer/classes/{id}/results` et `results/export.csv` : résultats et CSV, calculés par le même code que ceux de l'enseignant.
- **Nominatif ou anonymisé** au choix de l'enseignant (`named`, faux par défaut) : en anonymisé, « Étudiant 1… N » dans l'ordre de la classe, sans identifiant interne, y compris dans le CSV.
- **Chaque consultation est auditée** (`audit_events`, action `observer.view`, vue, classe, options) et listée pour l'enseignant (`GET /teacher/observers/views`, tableau « Consultations »).
- **Refus partout ailleurs** : l'observateur reçoit 403 (ou 404) sur toutes les routes enseignant et étudiant, et sur les routes « self-service » réservées désormais aux étudiants et enseignants (présence, notifications, Web Push, radio). Sa seule écriture possible est la déconnexion. Interface : pas de cloche, de classement, de bouton Confort ni d'action ; bandeau « lecture seule, consultations visibles par l'enseignant ».

## Matrice d'autorisation

Mise à jour dans `docs/QUALITY.md` et vérifiée par `backend/tests/test_security_matrix.py`, générée depuis toutes les routes : anonyme 401 ; étudiant 403 sur enseignant et observateur ; enseignant 403 sur étudiant et observateur ; observateur 403/404 sur toute autre route et toute écriture (sauf déconnexion) ; CSRF sur toute écriture.

## Conséquences

- Migration : sauvegarder la base avant de redéployer. Le retour arrière supprime les comptes observateurs et leurs consultations ; la valeur `observer` reste dans l'énumération PostgreSQL (inutilisée).
- Aucune donnée réelle d'étudiant n'est exposée sans action explicite de l'enseignant (anonymisé par défaut, corrigés masqués par défaut).
