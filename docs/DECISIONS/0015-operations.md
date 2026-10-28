# ADR-0015 — Exploitation : sauvegarde automatique dans Compose, restauration testée, contrôle avant cours

**Date :** 2026-10-28
**Statut :** accepté pour P0-10 (partiel : la route publique reste à créer par le propriétaire)

## Décision

- **Sauvegarde automatique par un service Compose `backup`** (image `postgres:16-alpine`, script `scripts/ops/backup.sh`) plutôt qu'une tâche `launchd` : elle vit et s'arrête avec la stack ShopFlow, ne modifie aucune configuration système du Mac et reste visible dans `docker compose ps`. Intervalle 6 h, rétention 28 fichiers automatiques, vérification `pg_restore --list`, SHA-256, `last-backup.json`. Chiffrement au repos assuré par FileVault (activé, vérifié en lecture seule) ; copie hors du Mac laissée à la décision du propriétaire.
- **Restauration testée** par `scripts/restore_check.py` : conteneur PostgreSQL jetable sans réseau, données transmises par flux (aucune copie de données réelles sur le disque), comparaison du nombre de lignes de chaque table, conteneur supprimé. Ajoutée à la CI.
- **Journaux** : rotation `json-file` 3 × 10 Mo par service.
- **Contrôle avant cours** : `scripts/ops_status.py` (lecture seule) agrège conteneurs, santé, âge de la sauvegarde, disque, veille, URL publique et non-régression n8n.
- **Runbook** : `docs/RUNBOOK.md`.

## Conséquences

P0-10 reste ouvert tant que la route `shopflow.rapidfox.io` n'est pas créée dans le tableau de bord Cloudflare et que le test distant (téléphone en 4G, `smoke_public.py` sur l'URL publique) n'est pas passé.
