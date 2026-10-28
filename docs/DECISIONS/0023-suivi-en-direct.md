# ADR-0023 — Suivi en direct

- Statut : accepté (28/10/2026)
- Contexte : sprint 2, partie H (après L et le correctif leçons #39)

## Décision

- **Présence** : battement toutes les 30 s depuis chaque page étudiante (`POST /api/v1/presence`, mission ouverte) ; « en ligne » = vu il y a moins de 75 s ; écritures limitées à une toutes les 10 s par compte.
- **Notifications** (une table `notifications` pour tous, destinataire = soi seul, 404 sinon) :
  - message de l'enseignant à la classe ou à un étudiant : 280 caractères, texte brut, 5 par minute et 60 par heure (429), audité (`message.send`), accusés de lecture ;
  - automatiques vers les étudiants (désactivables) : bloc ouvert, bloc ouvert pour vous, demande d'aide traitée ;
  - centre de notifications de l'enseignant, chaque type désactivable : demande d'aide, étudiant bloqué (3 essais sans réussite, une fois), bloc terminé par X % de la classe (80 % par défaut), ouverture automatique dans 2 min puis faite, déconnexion (vu il y a 90 s à 10 min après au moins 30 s en ligne) ; clé de déduplication par événement ;
  - interface : sondage toutes les 8 s, toast 10 s au plus avec « J'ai lu » (accusé de lecture), cloche avec compteur et historique groupé (même type sur 5 min), notification système si l'onglet est caché et autorisé.
- **Web Push** (facultatif) : push **sans contenu** (le service worker relit les notifications non lues en même origine) ; clés VAPID générées sur le Mac par `scripts/vapid_keys.py` dans `.env`, jamais committées ; points d'envoi limités à FCM, Mozilla, Apple et Windows ; réseau Compose `push` sortant pour le backend seulement. Sans clés, tout le reste fonctionne. `public/sw.js` : push seulement, aucun cache, jamais `/api/`.
- **Déblocage individuel** : `block_unlocks` (classe, bloc, étudiant), idempotent, audité (`block.unlock_student`, `block.relock_student`), notifié ; l'étudiant voit « Ouvert pour vous » en moins de 10 s.
- **Ouverture automatique** (`block_plans`, désactivée par défaut) : heure de fin ; temps restant réparti selon la durée estimée des blocs (le bloc en cours compte d'abord) ; planning montré avant activation ; tâche serveur toutes les 15 s qui rattrape les ouvertures dues après un redémarrage ; ne ferme jamais rien ; pause/reprise (décalage de la durée de la pause), décalage ±N min, « ouvrir le suivant maintenant », arrêt ; proposition de recalcul quand le planning s'écarte de 5 min ou plus ; tout est audité (`auto.*`) et notifié.
- **Grille enseignant** (« Ma classe » → « Suivi en direct », pensée pour 1366×768) : étudiants × blocs (ouverts, ouverts pour un étudiant, puis les deux suivants), état en texte (fait, x/y, —, fermé), leçons lues à part (règle du correctif #39), présence, aide, clics rapides ; une case fermée ouvre le bloc pour cet étudiant.

## Conséquences

- Migration **0012** (après `0011_leaderboard`, tables nouvelles seulement). Dépendance `cryptography` (signature VAPID).
- Charge mesurée : 10 étudiants + enseignant, p95 le plus lent 938 ms, message reçu par 10/10 (`scripts/load_test.py`).
- Autorisation : routes « self-service » (présence, notifications, push) ajoutées au modèle de la matrice ; routes de classe réservées au propriétaire du cours (matrice d'appartenance).
