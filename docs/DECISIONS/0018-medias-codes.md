# ADR-0018 — Médias et animations codés

**Date :** 2026-10-28
**Statut :** accepté (sprint 2, partie F)

## Contexte

Le propriétaire veut des animations, cartes mentales, pipelines animés et vidéos facultatives dans le cours, écrits par l'agent qui rédige le Markdown, sans production vidéo, légers, accessibles, en clair comme en sombre, et sans affaiblir la sécurité (CSP stricte, contenu non fiable).

## Décision

- **Décrits en données, dessinés par la plateforme** : quatre nouveaux `data.kind`, validés côté serveur (texte brut, bornes) et rendus en SVG + CSS par des composants React maison (`frontend/src/student/media.tsx`). Aucune bibliothèque d'animation ajoutée : les besoins (pas à pas, apparition, déplacement d'un jeton) tiennent en quelques transitions CSS.
  - `animation` : 2 à 20 étapes `{caption, scene}` ; une scène = 1 à 3 tables (`highlight` de lignes et de cellules), flèches entre lignes de tables différentes (`from`/`to` = `[table, ligne]`, indices à partir de 0), compteur, badge `ok`/`erreur`/`attention`. Commandes Lecture/Pause, étape précédente/suivante, Recommencer ; légende annoncée (`aria-live`) ; description textuelle complète de toutes les étapes.
  - `mindmap` : `root` et au plus 3 niveaux sous la racine, 40 nœuds ; arbre ARIA (`tree`/`treeitem`, flèches, Entrée pour plier/déplier, Début/Fin), apparition progressive, alternative en liste.
  - `flow` : `input` (lignes en entrée), 2 à 8 étapes `{id, label, rejects, note}` ; un jeton parcourt les étapes, compteurs acceptées/rejetées ; résumé textuel.
  - `video` : soit `url` HTTPS d'intégration `www.youtube-nocookie.com/embed/<id>` ou `player.vimeo.com/video/<id>` (iframe `sandbox`, CSP `frame-src` limitée à ces deux origines), soit `file: media/<nom>.mp4` du dossier du cours (≤ 50 Mo, signature MP4 vérifiée) avec `captions: media/<nom>.vtt` facultatif (WebVTT vérifié). Jamais requis pour la note.
- **Fichiers vidéo** : à la compilation, chaque fichier reçoit une adresse de contenu (`/media/<sha256:16>.mp4|vtt`) écrite dans la définition (une vidéo inchangée garde la même adresse, donc la même version de mission) ; à l'import, il est copié dans le volume `media_data` (écrit par le backend, monté en lecture seule dans le gateway). Le gateway ne sert que les noms `^/media/[0-9a-f]{16}\.(mp4|vtt)$`, avec `nosniff`, `X-Frame-Options`, une CSP propre et un cache long ; tout autre chemin `/media/` répond 404.
- **Mouvement réduit** : la règle globale `prefers-reduced-motion` annule durées et délais d'animation ; les étapes restent disponibles sans mouvement (vérifié en E2E).
- **Thème** : couleurs par jetons sémantiques (`chart.*`, `code.*`, `brand`, `saffron`), prêtes pour le mode sombre (partie B).

## Conséquences

- L'agent qui rédige écrit ces médias en YAML (exemples dans `docs/examples/demo-course/` et `docs/COURSE-AUTHORING.md` § 6).
- Les fichiers vidéo du cours ne passent jamais par Git : ils restent dans le dossier local et dans le volume Docker.
- Les médias sont publics pour qui connaît leur adresse (64 bits aléatoires) : ne pas y mettre de corrigé.
