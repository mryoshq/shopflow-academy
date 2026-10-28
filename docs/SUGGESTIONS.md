# Suggestions d'amélioration — après le sprint 2

**Date :** 28/10/2026 · **Auteur :** session cloud Claude Code (sprint 2, partie E)

Classement par **valeur pour la classe** puis par **effort** (S : moins d'une demi-journée, M : une à deux journées, L : plus). Rien ici n'est engagé : chaque ligne attend la décision du propriétaire, et devient un lot du `docs/BACKLOG.md` si elle est retenue.

## Déjà fait pendant ce sprint (pour mémoire)

| Partie | Livré | PR |
|---|---|---|
| A | Blocs de 15 min ouverts par l'enseignant, « Ma classe », demandes d'aide, interface en trois zones, ménage, `APP_SECRET` obligatoire | #26 (fusionnée) |
| D | Cours écrit en Markdown, compilé avec erreurs localisées, importé sans perdre la progression | #27 (fusionnée) |
| F | Animations, carte mentale, pipeline animé, vidéo | #28 (fusionnée) |
| C | Base de laboratoire, requêtes exécutables, défi SQL bonus, sorties Python à l'import | #29 (fusionnée) |
| B | Mode sombre, lecteur en une colonne, raccourcis, réinitialisation de mot de passe, fiches de connexion | #30 (fusionnée) |

## Suggestions classées

| # | Suggestion | Valeur | Effort | Pourquoi maintenant |
|---|---|---|---|---|
| 1 | **Signal des demandes d'aide hors de l'onglet** : compteur dans le titre de l'onglet (« (2) ShopFlow ») et son discret facultatif | Haute | S | L'enseignant circule dans la salle ou projette autre chose ; aujourd'hui une demande n'est visible que sur « Ma classe ». |
| 2 | **Contrôle d'avant séance** `scripts/preflight.py` : stack prête, cours publié et attribué, bloc 1 fermé, sauvegarde de moins de 24 h, URL publique joignable, n8n inchangé (lecture seule) | Haute | S | Une commande à lancer 15 min avant le cours au lieu de cinq vérifications manuelles du RUNBOOK. |
| 3 | **Analyse des mauvaises réponses** par mission : proposition fausse la plus choisie, nombre d'étudiants concernés | Haute | M | Permet une explication collective ciblée au bon moment ; les tentatives contiennent déjà les choix. |
| 4 | **« Revoir mes erreurs »** côté étudiant : missions réussies après plusieurs essais, avec l'explication | Haute | M | Révision avant l'évaluation sans pénalité, dans l'esprit « meilleur essai retenu ». |
| 5 | **Mode surveillance du compilateur** `course_md.py compile --watch` + aperçu ouvert dans le navigateur | Haute (auteur) | M | Le cours réel s'écrit maintenant ; chaque aller-retour compile/import coûte plusieurs minutes. |
| 6 | **Changement de mot de passe par l'étudiant** (premier accès, ou depuis son espace) | Moyenne | M | Évite de transmettre durablement un mot de passe imprimé ; la réinitialisation par l'enseignant existe déjà. |
| 7 | **Message court à la classe** (bandeau « Pause 10 min », « Regardez le tableau ») envoyé depuis « Ma classe » | Moyenne | S | Remplace l'oral pour l'étudiant à distance ; ce n'est pas un mode projection. |
| 8 | **Export des notes au format de l'école** (colonnes et barème attendus par Ynov) | Moyenne | S | À faire dès que le format est connu ; le CSV actuel est générique. |
| 9 | **Restauration vérifiée chaque semaine** : restaurer automatiquement la dernière sauvegarde dans une base jetable et compter les tentatives | Moyenne | S | La sauvegarde quotidienne existe, mais la restauration n'a été testée qu'une fois (P0-10) ; une sauvegarde jamais relue n'est pas une garantie. |
| 10 | **Bilan de fin de journée** par étudiant (missions, bonus, aides demandées), imprimable ou en PDF | Moyenne | M | Retour individuel utile pour le distanciel et pour l'évaluation continue. |
| 11 | **Résilience réseau des envois** : file d'attente locale des réponses en cas de coupure, renvoi automatique (même clé d'idempotence) | Moyenne | M | Le brouillon est déjà sauvegardé ; il reste à renvoyer seul la tentative quand le Wi-Fi revient. |
| 12 | **Test manuel lecteur d'écran** (NVDA sous Windows) sur une mission de chaque type, consigné dans `docs/QUALITY.md` | Moyenne | S | axe ne couvre pas l'ordre de lecture ni les annonces ; les étudiants sont sous Windows. |
| 13 | **Limitation de débit du laboratoire hors mémoire** (table PostgreSQL) | Basse | S | Correcte aujourd'hui (un seul processus backend) ; à faire seulement si l'on passe à plusieurs workers. |
| 14 | **Défi Python exécuté à la demande** dans un conteneur jetable (comme le défi SQL) | Basse | L | Coût de sécurité élevé (exécution de code étudiant sur le Mac) ; les sorties précalculées couvrent le parcours principal. À ne faire qu'avec un ADR dédié. |

## Recommandation

Faire **1 et 2 avant le prochain cours** (moins d'une journée à deux), puis **5** pendant l'écriture du cours réel, puis **3 et 4** pour la deuxième séance.
