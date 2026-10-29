---
name: course-import
description: Compiler le cours Markdown du dossier local, écrire RETOURS-PLATEFORME.md, importer en brouillon, sauvegarder le dossier ; jamais de publication ni d'ouverture de bloc sans accord écrit.
---

# course-import

Chaîne du cours écrit en Markdown (`docs/COURSE-AUTHORING.md`, format `shopflow-course-md` v1). Le dossier du cours est **local au Mac** et contient les corrigés : il ne va **jamais** dans ce dépôt public (seul `docs/examples/demo-course/`, fictif, y figure).

## Étapes (dans le clone `~/Developer/shopflow-academy`, stack de production lancée)

1. **Compiler** : `python3 scripts/course_md.py compile "<dossier du cours>/cours"`.
   - Erreurs en français avec fichier et ligne ; résumé par module et par bloc (missions, leçons, bonus, points, durée) et couverture des objectifs.
   - Le rapport `RETOURS-PLATEFORME.md` est écrit à côté du dossier `cours/` : c'est la réponse destinée à l'agent qui rédige. Le relire, ne pas l'éditer.
   - Au plus 3 cycles « l'auteur corrige → recompiler » sur une même erreur, puis signaler le blocage au propriétaire.
2. **Importer en brouillon** (0 erreur seulement) : `python3 scripts/course_md.py import "<dossier du cours>/cours" < .local/teacher-email.txt`.
   - Crée ou met à jour le brouillon du cours (slug de `00-cours.md`). Ne publie rien, n'ouvre aucun bloc.
   - L'enseignant vérifie dans « Mon cours » → Aperçu.
3. **Sauvegarder le dossier** après chaque étape validée :
   - copie datée : `cp -R "<dossier du cours>" ~/Developer/shopflow-backups/cours/cours-$(date +%Y%m%d-%H%M%S)` ;
   - dépôt privé `mryoshq/shopflow-courses` : **vérifier d'abord qu'il est privé** (`gh repo view mryoshq/shopflow-courses --json visibility` → `PRIVATE`), puis y copier `cours/` et les `.md` du dossier, commit et push. Personne d'autre n'y pousse ; le dossier local reste la source.
4. **Avant de publier**, vérifier en lecture seule les réussites qui seraient perdues : `docker compose exec -T backend python -m app.carryover --course <slug>` (code 1 si des réussites seraient perdues ; les signaler au propriétaire).
5. **Publier** (`--publish`) : **uniquement sur accord écrit du propriétaire dans la conversation**. `python3 scripts/course_md.py import "<dossier>/cours" --publish < .local/teacher-email.txt`. Les missions inchangées gardent leur version (progression et notes conservées) ; les nouveaux blocs arrivent fermés.
6. Les blocs s’ouvrent **seulement par l'enseignant**, dans « Ma classe ».

## Interdits
- Publier ou ouvrir un bloc sans accord écrit du propriétaire.
- Copier le cours, un export JSON ou un rapport contenant des corrigés dans ce dépôt public, une issue, une PR, un gist.
- Afficher ou committer `.local/teacher-email.txt`.
- Retirer du source une mission déjà publiée (l'import le refuse : ses tentatives doivent rester valides).

## Test sans le Mac
`python3 scripts/course_md.py compile docs/examples/demo-course --local` (depuis un environnement où le backend est installé) ; stack de test : `--test-stack`.
