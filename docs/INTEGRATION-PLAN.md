# Intégration des PR empilées

État vérifié le 27/10/2026 : dépôt GitHub public, `main` stable. Les PR [#11](https://github.com/mryoshq/shopflow-academy/pull/11), [#12](https://github.com/mryoshq/shopflow-academy/pull/12) et [#13](https://github.com/mryoshq/shopflow-academy/pull/13) sont ouvertes, fusionnables et leurs contrôles backend, frontend, Compose et kit sont verts. Aucune revue humaine ni commentaire n'est encore enregistré sur ces trois PR ; vérifier la revue avant intégration.

Ordre de fusion **manuel**, sans auto-merge :

1. #11 `feat/p0-01-foundation` → `main`.
2. Après contrôle de `main`, #12 `feat/p0-02-auth-rbac` → `main` ; ajuster sa base depuis la branche #11 et vérifier de nouveau le diff et la CI.
3. Après contrôle de `main`, #13 `feat/p0-03-curriculum-model` → `main` ; ajuster sa base depuis la branche #12 et revérifier le diff et la CI.
4. P0-04 suit #13 ; ajuster sa base une fois #13 intégrée, puis revérifier les tests et la revue.

Ne pas utiliser de force-push, supprimer les branches, fusionner les PR ni publier l'application automatiquement. Le dépôt étant public, contrôler à chaque étape les fichiers suivis : aucune adresse personnelle, aucun mot de passe, jeton, `.env` ou contenu définitif de cours. La publication publique de l'application reste distincte de la visibilité du code et exige l'accord du responsable.
