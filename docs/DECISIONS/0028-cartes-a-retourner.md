# ADR-0028 — Cartes à retourner (flashcards) et élément « Révision »

- Statut : accepté (28/10/2026)
- Contexte : sprint 2, partie M (avant J)

## Décision

- Nouveau média `data.kind: flashcards` : `title` facultatif, `cards` de 2 à 30 cartes `{front, back}`, `front` ≤ 200 caractères, `back` ≤ 500, texte brut avec la mise en forme légère, `description` comme tous les médias. Accepté **seulement** dans les leçons et les révisions (refusé dans une mission notée).
- Nouveau type non noté `review` (titre Markdown `### Révision :`) : `data` en cartes obligatoire, `body` facultatif ; ni choix, ni corrigé, ni indices, ni explication, ni points. Il se valide par « J'ai compris » et compte **comme une leçon** partout (progression, bloc terminé, « leçons lues », reprise après republication, ouverture automatique, grille en direct), jamais dans la note. Un seul ensemble `UNGRADED_KINDS = {lesson, review}` côté serveur, `isUngraded` côté interface.
- Les cartes sont publiques (projection étudiante) : elles ne doivent jamais contenir le corrigé d'une mission (règle d'auteur rappelée dans `docs/COURSE-AUTHORING.md`).
- Lecteur : une carte à la fois, bouton natif (clic, Espace, Entrée) avec retournement 3D (`prefers-reduced-motion` : bascule sans animation, réglage global du thème) ; flèches gauche/droite ; compteur « 3 / 12 » ; « Mélanger » ; « Je savais / À revoir » facultatif, conservé dans le navigateur (clé dérivée du contenu du paquet), « Reprendre les cartes à revoir », aucun envoi au serveur, aucun effet sur la note. Le verso est annoncé par une zone `aria-live` après retournement (sans les marques de mise en forme). Clair et sombre, lisible à 390 px.
- Studio : une révision s'écrit dans le cours Markdown (comme les leçons structurées) ; le plan et l'aperçu l'affichent comme un élément non noté.

## Conséquences

- Pas de migration (les définitions sont en JSON).
- Exemple : `docs/examples/demo-course/10-module-demo.md` (une leçon avec cartes, une révision). Les tests qui comptent les éléments du cours de démonstration sont mis à jour (6 leçons ou révisions, 14 éléments).
