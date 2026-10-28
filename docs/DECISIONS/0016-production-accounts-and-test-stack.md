# ADR-0016 — Comptes de production, propriété des cours et stack de test séparée

**Date :** 2026-10-28
**Statut :** accepté (décisions écrites du propriétaire, 28/10/2026)

## Contexte

Après la mise en ligne de `https://shopflow.rapidfox.io`, la base de production contenait 11 comptes fictifs `demo.*` actifs, deux enseignants partageant le studio, et 59 cours dont la plupart avaient été créés par les tests E2E. Ces tests, comme le test de charge et la vérification de persistance, tournaient sur la stack de production.

## Décision

1. **Propriété des cours.** Un seul enseignant actif, celui dont l'adresse est dans `.local/teacher-email.txt` (jamais écrite dans le dépôt). Tous les cours existants lui sont rattachés. Toute route du studio ou du suivi qui vise un objet de cours (cours, objectif, module, chapitre, mission, version, classe, événement d'historique) répond **404** à un autre enseignant ; les listes et la recherche ne montrent que ses propres cours. `demo.enseignant` est désactivé.
2. **Comptes étudiants.** Seuls les identifiants qui se terminent par `@ynov.com` restent actifs. Tous les autres comptes sont désactivés, **jamais supprimés**, et leurs sessions sont révoquées. Outil : `python -m app.account_policy` (simulation par défaut, `--apply` pour écrire, idempotent, audité, n'affiche que des comptages). Sauvegarde manuelle nommée avant application.
3. **Stack de test séparée.** Projet Compose `shopflow-academy-test`, port `127.0.0.1:3180`, configuration `config/test-stack.env` seule (le `.env` de production n'est pas lu), volume de base propre et jetable (`test_stack.py down` le supprime), dossier de sauvegarde `./.backups-test`. Playwright, `load_test.py` et `persistence_check.py` visent cette stack par défaut et **refusent** une adresse de production avant toute requête. La CI suit la même procédure (`scripts/test_stack.py up`).
4. **Sauvegardes inchangées** : sauvegarde automatique toutes les 6 h, pas de copie hors du Mac (risque accepté).
5. **`cloudflared` et son jeton** : non touchés.

## Conséquences

- Les cohortes et l'annuaire des étudiants restent communs aux enseignants (aucun propriétaire en base) ; sans conséquence tant qu'un seul enseignant est actif. Un second enseignant demanderait un propriétaire de cohorte (nouvelle migration).
- Les 59 cours de production, y compris ceux laissés par d'anciens tests E2E, appartiennent maintenant au propriétaire : il peut les archiver depuis le studio. Aucun n'a été supprimé.
- Le cours de démonstration et les comptes fictifs refusent de s'installer en production ; la démonstration se fait sur la stack de test.
- `smoke_public.py` se connecte en production avec le compte du propriétaire et vérifie qu'un compte `demo.*` est refusé.
