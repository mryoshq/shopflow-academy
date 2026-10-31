# ADR-0045 — Rappels automatiques des jalons du projet

Date : 31 octobre 2026 · Statut : accepté (demande du propriétaire)

## Contexte
Dans l'espace projet (ADR-0034), des binômes oublient un jalon jusqu'au dernier moment. L'enseignant ne veut pas relancer chacun à la main, ni envoyer de reproche.

## Décision
- **Quand** : pour chaque jalon qui a une date limite, deux rappels, 3 jours puis 1 jour avant (jours du calendrier marocain), à **9 h, heure du Maroc** (`Africa/Casablanca`, règles de `tzdata`, jamais de décalage écrit en dur : le Maroc change d'heure plusieurs fois par an).
- **À qui** :
  - aux membres actifs des binômes qui n'ont encore rien déposé pour ce jalon ;
  - pour le jalon « Binôme formé » (titre reconnu sans accents ni majuscules) : aux étudiants actifs de la classe sans binôme et non inscrits au binôme surprise (ADR-0041).
- **Texte** : bref, encourageant, sans reproche : « Rappel : « <jalon> » est attendu le <date> à <heure>. Il vous reste <n> jours. ». Traduit en anglais dans le navigateur (`serverText`), comme les autres notifications automatiques (ADR-0023). Type de notification : `project_reminder`.
- **Où ça tourne** : dans la boucle de fond existante du backend (`autoplan.tick`, toutes les `LIVE_TICK_SECONDS`, 15 s par défaut), qui sert déjà aux ouvertures planifiées. Rien à planifier sur le Mac (ni `cron`, ni `launchd`, ni conteneur de plus) : le rappel part dès que le backend tourne. C'est la solution la plus simple et la plus robuste pour Docker Compose sur le Mac.
- **Rattrapage** : un rappel manqué pendant un arrêt part au redémarrage, le même jour seulement (avant minuit au Maroc et avant la date limite). Jamais le lendemain : un rappel J-3 envoyé à J-2 serait faux.
- **Idempotence et journal** : une ligne par jalon, rappel (`j3`, `j1`) et cible (`team:<id>` ou `user:<id>`) dans `project_reminders`, avec contrainte d'unicité. Cette table est aussi le journal (destinataires, heure d'envoi), complété par le journal du logiciel `academy.reminders`. La notification garde aussi une clé de déduplication par destinataire.
- **Enseignant** : Projet > Jalons montre, sous chaque jalon daté, les deux rappels avec leur heure (heure du Maroc, calculée par le serveur) et leur état (Prévu, Envoyé avec le nombre d'envois, Non envoyé, Désactivé), et un interrupteur « Rappels automatiques » par jalon (`PATCH /teacher/project/milestones/{id}` `{reminders}`, audité). L'observateur voit les rappels sans l'interrupteur.

## Conséquences
- Migration `0018_project_reminders` : colonne `project_milestones.reminders` (vrai par défaut) et table `project_reminders`.
- Dépendance `tzdata` ajoutée au backend : l'image slim n'a pas toujours les fuseaux du système.
- L'heure affichée vient du serveur (`local`), car le navigateur peut avoir des règles plus anciennes pour le Maroc.
- Aucune IA, aucun e-mail : la notification arrive dans l'application.
