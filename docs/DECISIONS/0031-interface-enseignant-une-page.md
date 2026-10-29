# ADR-0031 — Interface enseignant en application à une page

- Statut : accepté (29/10/2026)
- Contexte : sprint 3, partie O. L'espace enseignant tenait en onglets horizontaux dans une page longue (« Mon cours », « Ma classe », « Résultats », « Observateurs », options avancées repliées). Pendant le cours, l'enseignant cherchait la frise, les demandes d'aide et les étudiants bloqués dans la même page, sans adresse à partager ni retour arrière.

## Décision

- **Coquille unique** (`frontend/src/teacher/TeacherApp.tsx`) :
  - barre latérale fixe, repliable (mémorisée), icônes et libellés : Aujourd'hui, Ma classe, Mon cours, Résultats, Projet, Leaderboard, Réglages (« Le voyage d'une donnée » apparaît quand l'application est intégrée, ADR-0033) ;
  - barre haute : titre de l'écran, étudiants en ligne (lien vers la liste), recherche rapide, cloche, thème, compte et déconnexion.
- **Adresses** dans le fragment (`#/…`, `routes.ts`), sans changement serveur :
  - `#/aujourdhui`, `#/classe/frise|etudiants|aide|difficultes` (`?eleve=<id>` ouvre le panneau d'un étudiant), `#/cours/plan|missions|apercu|import|regles|publication`, `#/resultats`, `#/projet`, `#/classement[/<classe>]`, `#/reglages/notifications|observateurs|classes` ;
  - chaque vue et sous-vue a son adresse, le bouton retour du navigateur fonctionne, un lien direct ouvre la bonne vue ;
  - une session reprise rouvre la dernière vue (`localStorage`) ; une nouvelle connexion ouvre « Aujourd'hui ».
- **Sous-onglets** : Ma classe = Frise, Étudiants, Demandes d'aide, Difficultés ; Mon cours = Plan, Missions, Aperçu, Import, Règles, Publication. Les anciennes « Options avancées » deviennent l'onglet Import (autres cours, import JSON, ménage) et Réglages → Autres classes.
- **Détails dans un panneau latéral droit** (`SidePanel`, tiroir Chakra) : étudiant, demande d'aide, mission ; Échap ferme, le focus revient au déclencheur.
- **« Aujourd'hui »** tient sur un écran : bloc ouvert et temps écoulé, bouton « Ouvrir le bloc suivant », étudiants en ligne, demandes d'aide, étudiants bloqués, progression moyenne, blocs ouverts ; chaque carte mène à sa vue.
- **Recherche rapide** Cmd+K / Ctrl+K : vues, étudiants, blocs ; flèches et Entrée.
- **Visuel** : contrastes AA en clair et en sombre, entrée de vue en 160 ms annulée par `prefers-reduced-motion`, cibles de 44 px, aucun défilement horizontal à 390 px.
- **Rien n'est retiré** : toutes les fonctions précédentes restent atteignables. L'interface étudiante et l'observateur sont inchangés.

## Conséquences
- Aucune migration ni changement d'API.
- Les specs E2E naviguent par la barre latérale (`e2e/teacher-nav.ts`) ; `e2e/teacher-shell.spec.ts` vérifie adresses, retour arrière, liens directs, Ctrl+K et axe dans les deux thèmes.
