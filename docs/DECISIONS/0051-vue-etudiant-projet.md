# ADR-0051 — Vue étudiant pendant la période du projet

Statut : accepté. Livré par la PR « Vue étudiant : Projet, Cours, Ressources » (05/11/2026).

## Contexte
Les séances sont terminées ; il reste le projet CampusEquip, à remettre le 23/11. La page d'accueil de l'étudiant empilait le cours, des cartes de navigation (projet, voyage, animation), des messages de l'enseignant et des textes destinés à l'enseignant (version du cours, réglage de l'assistant IA, « Votre enseignant ouvrira ce bloc pendant la séance »). Le projet était une page séparée, avec l'animation affichée avant les jalons.

## Décision
- L'accueil étudiant a trois onglets, dans cet ordre : **Projet** (sélectionné par défaut), **Cours**, **Ressources**. Adresses : `#/` et `#/projet` → Projet, `#/cours`, `#/ressources`. `#/mission/…`, `#/voyage/…` et `#/campusequip/…` sont inchangées : les liens de Rafi et des notifications continuent de fonctionner. La « Vue étudiant » de l'enseignant suit (`#/etudiant/cours`, `#/etudiant/ressources`).
- **Projet** : un titre caché « Projet CampusEquip », puis les jalons (le binôme d'abord s'il n'est pas complet). Une carte par jalon : titre, « Ce qu'il faut rendre », date « À rendre le … », jours restants (« Plus que 5 jours », « Dernier jour », « Échéance passée »), statut (« À rendre », « Déposé (version N) », « Non déposé ») et un bouton « Déposer » qui ouvre le formulaire. Les jalons passés sont repliés dans un `details`. L'animation CampusEquip n'est plus qu'un bouton « Voir l'animation », en fin de page, jamais avant l'action.
- **Cours** : modules dans l'ordre du cours ; un module terminé (tous ses blocs comptés ouverts et terminés) est replié sous « Terminé · à revoir ». Score, note finale, progression et objectif de classe restent dans la colonne de droite. Le retour d'une mission ramène à cet onglet.
- **Ressources** : documents du cours et lien vers « Le voyage d'une donnée ».
- La prochaine échéance s'affiche dans l'en-tête (« Prochaine échéance : « … », dans 3 j 5 h. »). Les textes destinés à l'enseignant sont retirés de la vue étudiant.
- Un cours archivé n'est visible sur aucune route étudiante (test `test_archived_course.py`, qui parcourt toutes les routes `GET /api/v1/student/…`).

## Conséquences
- Aucune migration, aucune nouvelle route serveur. Rafi et l'import de cours ne changent pas.
- Les tests e2e qui ouvraient une mission depuis l'accueil passent d'abord par l'onglet Cours.
