# ADR-0043 — « Vue étudiant » pour l'enseignant, et présence au survol

Date : 31 octobre 2026 · Statut : accepté (demande du propriétaire)

## Contexte
L'enseignant veut voir l'application exactement comme un étudiant de la classe la voit, sans créer de compte de test ni fausser le suivi. Il veut aussi savoir d'un coup d'œil qui est en ligne. La colonne « Clics rapides » encombrait le tableau des missions.

## Décision
- **Vue étudiant** : une entrée « Vue étudiant » dans la barre latérale et dans Ctrl+K, à l'adresse `#/etudiant[/mission/<id> | /projet | /voyage/<scène>]`.
  - Elle remplace toute l'interface enseignant : un bandeau « Vue étudiant, rien n'est enregistré », avec la classe et la version publiée, une case « Afficher aussi les blocs fermés » et un bouton « Revenir à mon interface » (retour à la vue enseignant précédente). En dessous, l'application étudiante elle-même (`StudentHome`) : tableau de bord, missions, projet, récompenses, voyage.
  - Par défaut, seuls les blocs ouverts pour la classe sont visibles, comme pour un étudiant ; la case montre tous les blocs.
- **Lecture seule garantie par le serveur** (`backend/app/student_view.py`, routes `/api/v1/teacher/classes/{id}/student-view/...`, réservées à l'enseignant qui possède la classe) :
  - les pages sont construites par le même code que celles de l'étudiant (`student.course_payload`, `project.project_page`), pour un étudiant virtuel sans travail (identifiant 0, porté par aucune ligne) ;
  - une réponse est notée comme un premier essai, avec 0 point, sans être enregistrée : ni tentative, ni ouverture, ni indice, ni récompense, ni signal « bloqué », ni notification, ni présence, ni journal ;
  - les corrigés privés ne sont jamais envoyés ; l'explication suit la règle des étudiants (après une bonne réponse) ;
  - les indices sont renvoyés sans être enregistrés : le navigateur garde le compte.
- **Côté navigateur** (`frontend/src/studentview/adapter.ts`) : pendant la vue, les requêtes `/student/...` sont redirigées vers ces routes ; toute autre écriture (aide, binôme, tirage, dépôt, défi SQL) est refusée avant de quitter le navigateur, avec « Vue étudiant : rien n'est enregistré. ». Les pages étudiantes reçoivent leur routeur par contexte (`StudentRouterContext`), ce qui garde le bouton Retour du navigateur.
- **« n en ligne »** : au survol, au focus clavier ou au premier toucher, un petit panneau liste les étudiants en ligne, avec leur mission en cours et « depuis » (début de la connexion, `presences.online_since`, désormais renvoyé par `/live`). Les données viennent de la même requête que le compteur, toutes les 15 s. Le clic garde son comportement ; Échap ferme le panneau.
- **Clics rapides** (ADR-0027, règles inchangées) : la colonne quitte le tableau des missions. Un indicateur discret (« N clics rapides », avec les noms) apparaît dans le détail d'une mission (panneau latéral), seulement s'il y en a ; la fiche de l'élève garde sa pastille. Information seulement, jamais de sanction.

## Conséquences
- Pas de migration.
- Le test `test_student_view.py` compte toutes les lignes de toutes les tables avant et après un parcours complet en vue étudiant, et vérifie qu'elles n'ont pas bougé. L'E2E le vérifie aussi à travers l'API (vue de la classe identique avant et après).
- Le défi SQL noté n'est pas disponible en vue étudiant (il enregistre une tentative chez l'étudiant) ; les exécutions du laboratoire le sont.
