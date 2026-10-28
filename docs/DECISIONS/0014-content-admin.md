# ADR-0014 — Import/export de cours, historique et retour arrière éditorial

**Date :** 2026-10-28
**Statut :** accepté pour P0-08

## Décision

- **Format portable `shopflow-course` v1** (JSON) : cours, objectifs (référencés par `code`), modules, chapitres, missions (`slug`, `objective_codes`, `prerequisite_slugs`, `definition` complète, corrigés compris). Aucun identifiant de base : le document se réimporte dans une autre base.
- **Export** enseignant uniquement (contient les corrigés) : brouillon (`GET /teacher/courses/{id}/export`) ou **version publiée exacte**, reconstruite depuis les définitions privées figées (`GET /teacher/releases/{id}/export`) = sauvegarde de publication.
- **Import** (`POST /teacher/courses/import`, CSRF) : validation stricte (`extra=forbid`, texte brut sans HTML, schéma `MissionDefinition` de chaque mission, codes et slugs cohérents, doublons) avec **rapport chemin + message** ; `?dry_run=true` pour vérifier sans écrire ; **crée toujours un nouveau brouillon**, jamais d'écrasement (slug existant → 409, nouveau titre proposé) ; transaction unique ; aucun script exécuté. Taille limitée par le gateway (1 Mo) et côté navigateur (900 Ko).
- **Recherche/classement** : `GET /teacher/course-search?q=&status=&sort=title|recent` (titre ou slug, état, propriétaire affiché).
- **Historique** : `GET /teacher/courses/{id}/history` agrège les événements d'audit du cours et de ses objectifs, modules, chapitres, missions et versions.
- **Retour arrière éditorial sécurisé** : `POST /teacher/courses/{id}/restore {release_id}` remet le contenu d'une version publiée dans le brouillon ; les versions publiées ne sont jamais modifiées ; le brouillon courant est d'abord sauvegardé dans l'audit et téléchargeable (`GET /teacher/history/{event_id}/backup`), réimportable si besoin.

## Conséquences

Les cours définitifs (P2) pourront être préparés hors ligne puis importés et vérifiés avant publication. Les missions ajoutées après la version restaurée restent dans le brouillon telles quelles.
