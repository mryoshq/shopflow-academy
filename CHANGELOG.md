# Changelog

## 2026-11-01 — Annonces automatiques et Rafi (`claude/lucid-brahmagupta-htwgun-rafi`, depuis `design/rafi`)

- Rafi, l'image du propriétaire telle quelle (72 px, srcset), en bas à droite de l'interface étudiant.
  - Pupilles qui suivent le curseur et le doigt (2 px au plus), clignement par une paupière superposée.
  - Réactions sobres au toucher : clin d'œil, petit saut, légère bascule, regard.
  - Repliable, état mémorisé.
  - Absent côté enseignant et observateur, sauf dans la vue étudiant.
- Rafi présente les annonces dans une bulle (file d'attente, « J'ai lu », fermeture, lien) :
  - rappels des jalons, désormais aussi le jour même ;
  - « bloc ouvert pas encore terminé », une fois par étudiant et par bloc, le lendemain à 9 h ;
  - messages de l'enseignant.

  Elles sont idempotentes, journalisées et traduites en anglais.
- Compte à rebours vers la prochaine échéance du projet sur le tableau de bord.
- Sons courts et rares (Web Audio), rien avant une interaction ; coupables sur Rafi, dans Paramètres et par l'enseignant pour toute la classe.
- « Réduire les animations » fige tout. ADR-0047, sans migration.
- Compatibilité avec Notes (#78) : `main` fusionnée dans la branche Rafi, imports/routes/types/traductions et documents conservés des deux côtés. Le tableau de bord expose ensemble la note finale (selon son réglage de visibilité), la prochaine échéance et les sons de Rafi ; un test couvre leur coexistence sans changement des points.

## 2026-11-01 — Notes : grille du projet, points des blocs, note finale (`claude/lucid-brahmagupta-htwgun-notes`)

- Aucune note déjà obtenue ne change : tout est un calcul ou un affichage au-dessus des données existantes.
- Projet > Notes : grille des deux sujets CampusEquip.
  - Partie 1 : socle 10, dont 1 point individuel par étudiant.
  - Partie 2 : socle 10, commun au groupe.
  - Bonus : 5 au plus par partie.

  Projet sur 20 + 10. Une note hors barème est refusée. Les saisies de l'ancienne grille restent visibles à part, « à reprendre ». L'export CSV du projet est mis à jour.
- Blocs : « 4 / 10 pts », « 0 / 6 pts bonus » ou « Leçons », au lieu de « n / m missions » (étudiant, Ma classe ; points par module dans la fiche de l'observateur).
- Note finale sur 20 : 30 % cours + 20 % ateliers + 50 % CampusEquip, bonus au plus +1 (projet) et +1 (cours hors ateliers), plafond 20, arrondi à 0,25.
  - Détail de chaque composante ; une partie vide est « en attente » dans un aperçu « provisoire ».
  - Visible dans Résultats (export `final.csv` séparé) et pour les observateurs « Administration » (tableau, fiche, CSV, PDF).
  - Visible des étudiants seulement si l'enseignant l'active.
- Réglages > Notes : poids, plafond, bonus maximaux, modules d'ateliers, visibilité. ADR-0046, migration `0019_final_grade`.

## 2026-10-31 — Rappels automatiques des jalons (`claude/lucid-brahmagupta-htwgun-rappels`)

- Pour chaque jalon daté du projet, une notification brève et encourageante 3 jours puis 1 jour avant, à 9 h heure du Maroc : « Rappel : « <jalon> » est attendu le <date> à <heure>. Il vous reste <n> jours. » (en anglais dans l'interface anglaise).
- Destinataires : les membres des binômes qui n'ont encore rien déposé ; pour « Binôme formé », les étudiants sans binôme et non inscrits au binôme surprise.
- Envoi par la boucle de fond existante du backend, rien à planifier sur le Mac ; rattrapage le même jour après un arrêt ; une seule fois par jalon, rappel et binôme, journalisé (`project_reminders`, journal `academy.reminders`).
- Projet > Jalons : rappels prévus avec leur heure et leur état, interrupteur « Rappels automatiques » par jalon. ADR-0045, migration `0018_project_reminders`, dépendance `tzdata`.

## 2026-10-31 — Espace observateur professionnel (`claude/lucid-brahmagupta-htwgun-observateur`)

- Deux types d'observateur choisis par l'enseignant :
  - « Administration » : noms réels, notes du cours et du projet, fiche d'un étudiant, export CSV et rapport PDF, corrigés sur option ;
  - « Invité » : anonymisé de façon stable, tableau de bord, graphiques d'ensemble et cours publié.

  Les droits sont vérifiés à chaque route.
- Invitation par lien à usage unique valable 7 jours (jeton stocké sous forme de hachage), mot de passe choisi par l'observateur. Envoi par SMTP (Resend, `ssl` ou `starttls`) si configuré, sinon « Copier le lien » et « Préparer l'e-mail ». Renvoyer, révoquer, désactiver, changer le type ; e-mail de test.
- Espace observateur : indicateurs, graphiques (progression, réussite par module et par objectif, répartition des notes, activité par séance), notes triables et filtrables, cours publié. Jamais le texte des demandes d'aide, la présence, les notifications ni les connexions.
- Journal des consultations (qui, quoi, quand) dans Réglages > Observateurs. ADR-0042, migration `0017_observer_pro`.

## 2026-10-31 — Expérience CampusEquip, « Le voyage d'une location » (`claude/lucid-brahmagupta-htwgun-campusequip`)

- L'application livrée par le propriétaire (shopflow-courses@0fb639e) est intégrée dans `frontend/src/campusequip/`, selon le cadre du voyage. Thème unique avec l'Academy (vert en clair, terre cuite en sombre), mode sombre AA, téléphone, chargement différé, « Réduire les animations ».
- Adresse `#/campusequip[/<étape>]`, carte sur le tableau de bord étudiant (à côté du voyage) et entrée dans la barre latérale de l'enseignant.
- `data.kind: experience` accepte `experience: campusequip` pour l'ouvrir depuis une leçon (schéma, compilateur, COURSE-AUTHORING.md).
- Les deux expériences prennent toute la largeur de la page.
- CSV, référentiels et PDF du sujet servis comme ressources statiques, empreintes vérifiées avec `provenance.json`, sans corrigé ; tests du modèle livrés conservés. ADR-0044.

## 2026-10-31 — Interface enseignant : vue étudiant, étudiants en ligne au survol, clics rapides (`claude/lucid-brahmagupta-htwgun-vue-etudiant`)

- « Vue étudiant » (barre latérale et Ctrl+K) : l'application exactement comme un étudiant de la classe la voit, sur la version publiée (tableau de bord, missions, projet, récompenses). Lecture seule garantie par le serveur : réponses testées avec 0 point, aucune tentative, aucun indice, aucune présence, aucune notification enregistrés, jamais de corrigé. Bandeau « Vue étudiant, rien n'est enregistré » et « Revenir à mon interface ».
- « n en ligne » : au survol, au focus ou au toucher, la liste des étudiants en ligne avec leur mission et depuis quand ; le clic ouvre toujours Ma classe.
- « Clics rapides » quitte le tableau des missions : indicateur discret dans le détail d'une mission et dans la fiche de l'élève, règles inchangées (ADR-0027). ADR-0043.

## 2026-10-31 — Binôme surprise : plus de travail individuel dans l'espace projet (`claude/lucid-brahmagupta-htwgun-binome`)

- Sans équipe, l'étudiant choisit « Former mon binôme » ou « Je tente le binôme surprise » ; l'option « travailler seul » disparaît et une équipe d'une seule personne ne peut plus déposer.
- Inscrit, il voit son statut et peut sortir du tirage tant qu'il n'a pas eu lieu.
- Projet > Binômes : « Lancer le tirage » (aperçu, autre tirage, validation). Le tirage, côté serveur, apparie au hasard les étudiants sans équipe, avec un trinôme si le nombre est impair. Il est déterministe pour sa graine, enregistré, audité et idempotent ; un second tirage demande une confirmation.
- Les équipes formées et les dépôts ne bougent pas ; les équipes d'une seule personne ne rejoignent le tirage qu'avec l'accord de l'enseignant.
- Notification aux étudiants tirés au sort et révélation unique par cartes qui se retournent (environ 1,2 s), coupée par « Réduire les animations ». Textes traduits en anglais. ADR-0041, migration `0016_project_draw`.

## 2026-10-31 — Interface en anglais (`claude/lucid-brahmagupta-htwgun-anglais`)

- Toute l'interface existe en anglais (étudiant, enseignant, observateur, connexion, page indisponible, messages d'erreur, notifications automatiques) ; le français reste la langue de référence.
- Choix « Français / English » dans le menu de compte et dans Paramètres > Général, mémorisé dans le navigateur, langue du navigateur par défaut ; `<html lang>` suit le choix.
- Dates et nombres formatés selon la langue ; le contenu des cours reste dans sa langue d'origine.
- Les textes de « Plus de plaisir » (niveaux, badges, séries, objectif de classe, son de réussite et leurs notifications) sont traduits ; un badge nommé d'après un objectif ou un module garde les mots du cours.
- Une clé de traduction manquante fait échouer la CI. Structure prête pour l'arabe (direction de droite à gauche), non livré. ADR-0040.

## 2026-10-31 — Plus de plaisir : séries, badges, niveaux, objectif de classe (`claude/lucid-brahmagupta-htwgun-plaisir`)

- Séries de missions réussies du premier coup (effet discret à 3, 5 et 10 ; un essai raté remet à zéro sans message).
- Badges personnels attribués par le serveur (première mission, premier bloc, séries de 5 et 10, un par objectif atteint, tous les bonus d'un module), avec notification et collection ; recalcul `python -m app.rewards recompute`.
- Niveaux de « Stagiaire Data » à « Lead Data Engineer » avec des points d'expérience distincts de la note, jamais exportés.
- Objectif de classe anonyme, réglable par l'enseignant, avec une notification à 25, 50, 75 et 100 %.
- Confettis à la fin d'un bloc et son court facultatif (coupé par défaut), coupés avec « Réduire les animations ». ADR-0039, migration `0015_rewards`.

## 2026-10-31 — Test de charge : limite propre à la connexion (`claude/lucid-brahmagupta-htwgun-charge`)

- `scripts/load_test.py` : la connexion (hachage Argon2 volontairement coûteux, 11 connexions simultanées, une fois par session de 30 jours) a sa propre limite de p95, 3 s ; toutes les autres requêtes gardent 1,5 s. Le contrôle CI ne dépend plus de la vitesse de la machine.

## 2026-10-30 — Radio simplifiée (`claude/lucid-brahmagupta-htwgun-radio`)

- Radio d'ambiance : lecteur audio de la plateforme (lecture/pause, volume mémorisé dans le navigateur) au lieu du lecteur YouTube ; deux stations, « Nightride FM — Chillsynth » et « Nightwave Plaza ». Rien ne démarre seul ; le navigateur lit le flux directement.
- Flux définis sur le serveur (`RADIO_STREAMS`), limités aux hôtes de la CSP `media-src` ; « Radio indisponible pour le moment » en cas d'erreur réseau.
- Panneau Confort : sur téléphone, il ne sort plus de l'écran.

## 2026-10-30 — Tableaux Markdown dans les leçons (`claude/lucid-brahmagupta-htwgun-tableaux`)

- Texte des leçons : les tableaux Markdown simples (en-tête, séparation `| --- |`, alignement facultatif) s'affichent en vrai tableau, avec gras et code dans les cellules ; cadre qui défile seul sur téléphone, en clair et en sombre. Un tableau mal formé reste du texte. 12 colonnes et 100 lignes au plus.
- Compilateur : avertissement avec fichier et ligne pour un tableau mal formé dans un `body`.
- `docs/COURSE-AUTHORING.md` : syntaxe et exemple. ADR-0022 complété.

## 2026-10-30 — Accueil et suivi (`claude/lucid-brahmagupta-htwgun-accueil`)

- Page de connexion : nouveau texte (Rapidfox Academy, module, classe B3 IA/Data, ShopFlow et CampusEquip), plus de sélecteur de thème (système ou choix mémorisé), ouverture animée du logo une fois par session, jamais avec les animations réduites.
- `remember` retiré de l'API de connexion ; un ancien client qui l'envoie est accepté (champ ignoré).
- Ma classe > Étudiants : message aux étudiants en haut, suivi en direct sur toute la largeur.
- Pastille du nombre de demandes d'aide en attente sur « Ma classe » et sur l'onglet « Demandes d'aide », mise à jour en direct.
- Service worker : `/health/` reste hors du cache (vérifié par un test).

## 2026-10-30 — Résilience aux coupures et sessions de 30 jours (`claude/lucid-brahmagupta-htwgun-resilience`)

- Page et bandeau « La plateforme est momentanément indisponible… » : nouvelles tentatives automatiques (1, 2, 4, 8, 16 s puis 30 s) et retour à la page demandée ; une erreur 502, 503 ou 504 ou une coupure du réseau ne déconnecte jamais, seul un 401 le fait.
- Service worker : en cas d'échec d'une page, dernière version de l'application en cache ou page hors ligne autonome au nouveau style ; l'API n'est jamais mise en cache.
- Plus de case « Rester connecté » : toute connexion dure 30 jours et se prolonge à chaque visite ; les sessions survivent à un redémarrage.
- Runbook : construire les images avant de remplacer les conteneurs, et mesurer la coupure (`scripts/ops/measure_downtime.py`). ADR-0038.

## 2026-10-30 — Style inspiré de Claude, Rapidfox Academy, préférences d'affichage (`feat/theme-claude-style`, PR #62)

- Nom affiché : **Rapidfox Academy** (l'école), avec le module « Python Data Engineering & SQL Avancé » et ses cas d'étude ShopFlow · CampusEquip ; sous-domaine inchangé. ADR-0037.
- Style visuel calme et éditorial (ADR-0035) ; menu de compte, paramètres, taille du texte, réduction des animations (ADR-0036).
- Favicon selon le thème choisi dans l'application : logo vert en clair, terre cuite en sombre.
- Boutons à contour à bordure neutre ; onglets sur une ligne qui défilent sur téléphone ; barre haute enseignante sur une ligne à 390 px ; corrections d'alignement relevées sur captures.

## 2026-10-29 — Sprint 3, partie Q2 : « Le voyage d'une donnée » intégré (`claude/lucid-brahmagupta-htwgun-q2`)

- L'application du propriétaire (7 scènes, lecture, scénarios de panne, glossaire, architecture) est dans l'Academy : `#/voyage/<scène>`, entrée de menu étudiant et enseignant, lien depuis les leçons.
- Thème de l'Academy en clair et en sombre, contrastes AA, téléphone sans défilement horizontal, aucune police téléchargée ; chargée seulement à l'ouverture.
- Valeurs du cours lues depuis `experiences/voyage.json` (`base`, `batch`, `files`). ADR-0033.

## 2026-10-29 — Sprint 3, partie R : espace projet CampusEquip (`claude/lucid-brahmagupta-htwgun-r`)

- Binômes par invitation (ou seul), une personne par binôme ; l'enseignant corrige la composition.
- Jalons (consignes, date limite, livrables) et dépôts versionnés : texte avec tableaux, lien HTTPS, fichiers (pdf, png, jpg, md, zip ; 20 Mo) stockés hors base ; retard signalé.
- Enseignant : dépôts par jalon, commentaires visibles du binôme, grille sur 20 séparée du cours, export CSV, planning des soutenances visible des étudiants. Observateur : rien sans autorisation. Tout est audité. Migration `0014_project`. ADR-0034.

## 2026-10-29 — Sprint 3, partie Q (cadre) : « Le voyage d'une donnée » (`claude/lucid-brahmagupta-htwgun-q`)

- Page `#/voyage[/<scène>]` chargée à la demande, navigation entre 7 scènes (boutons, flèches, retour arrière), valeurs exactes lues depuis le cours (`experiences/voyage.json`) avec valeurs par défaut.
- Nouveau `data.kind: experience` pour l'ouvrir depuis une leçon. L'application du propriétaire sera intégrée à réception de l'archive (ADR-0033).
## 2026-10-29 — Sprint 3, partie S : laboratoire multi-schémas et téléchargements (`claude/lucid-brahmagupta-htwgun-s`)

- La base de laboratoire accueille les schémas déclarés par le cours (`lab_schemas`, par exemple shopflow, support, perf), chargés depuis plusieurs `datasets/*.sql` dans l'ordre des noms ; `lab_reader` ne lit que ces schémas et `lab`.
- `EXPLAIN (ANALYZE, BUFFERS…)` permis ; plans affichés en texte indenté ; index et partitions fournis par le cours seulement.
- Nouveau `data.kind: download` (pdf, docx, zip, csv, sql, py, md ; 20 Mo) : fichiers copiés à l'import, servis aux seuls inscrits et à l'enseignant. ADR-0032.
## 2026-10-28 — Sprint 3, partie P : report des réussites (`claude/lucid-brahmagupta-htwgun-p`)

- Une réussite et ses points restent acquis d'une version à l'autre d'une mission quand seul le texte change (explication, consigne, retours, indices, médias, libellés). Si la notation change, la mission repart de zéro, comme avant. Les leçons ne rapportent toujours aucun point.
- Vérification en lecture seule avant publication : `python -m app.carryover --course <slug>` et `GET /teacher/courses/{id}/carryover-check` listent les réussites qui seraient perdues. ADR-0030.
## 2026-10-29 — Sprint 3, partie O : interface enseignant en application à une page (`claude/lucid-brahmagupta-htwgun-o`)
- Barre latérale (Aujourd'hui, Ma classe, Mon cours, Résultats, Projet, Leaderboard, Réglages) et barre haute (étudiants en ligne, recherche, cloche, thème, compte).
- Une adresse par vue et sous-vue, bouton retour, liens directs, dernière vue rouverte ; détails dans un panneau latéral ; tableau « Aujourd'hui » ; recherche Cmd+K / Ctrl+K.
- Rien n'est retiré ; l'interface étudiante est inchangée. Pas de migration. ADR-0031.

## 2026-10-28 — Sprint 2, partie J : observateur en lecture seule (`claude/lucid-brahmagupta-htwgun-j`)

- Rôle « observateur » créé, réglé et désactivé par l'enseignant (onglet « Observateurs ») ; mot de passe affiché une seule fois.
- Lecture seule des classes de l'enseignant : aperçu du cours (corrigés seulement si autorisés), progression, résultats et CSV, nominatifs ou anonymisés (« Étudiant 1… », par défaut).
- Chaque consultation est enregistrée et listée pour l'enseignant ; 403/404 sur toute autre route et toute écriture (matrice d'autorisation mise à jour). Migration `0013_observers`. ADR-0025.

## 2026-10-28 — Sprint 2, partie N : confort et finitions (`claude/lucid-brahmagupta-htwgun-n`)

- « Rester connecté » : session de 30 jours renouvelée à chaque visite (sinon 8 h comme avant), cookies et CSRF inchangés, aucun jeton dans le navigateur hors cookies ; la déconnexion révoque la session.
- Code coloré en Catppuccin (Latte en clair, Mocha en sombre, contrastes AA vérifiés) pour les blocs `code`, les exécutions et l'éditeur du défi SQL, sans nouvelle dépendance.
- Images de cours : `data.kind: image` (png, jpg, webp, svg contrôlé ; 2 Mo ; `alt` obligatoire), copiées à l'import, agrandies au clic.
- Passe mobile 390/360 px : cibles de 44 px, en-tête compact, tableaux défilant dans leur cadre. ADR-0029.

## 2026-10-28 — Sprint 2, partie M : cartes à retourner (`claude/lucid-brahmagupta-htwgun-m`)

- `data.kind: flashcards` (2 à 30 cartes recto/verso, mise en forme légère) dans les leçons et le nouvel élément non noté « Révision » (`### Révision :`, `kind: review`), compté comme une leçon.
- Lecteur : une carte à la fois, retournement 3D (clic, Espace, Entrée ; instantané en mouvement réduit), flèches, compteur, « Mélanger », « Je savais / À revoir » gardé dans le navigateur sans effet sur la note, verso annoncé aux lecteurs d'écran. Exemple dans le cours de démonstration. ADR-0028.

## 2026-10-28 — Sprint 2, partie I : PWA, confort, couleurs (`claude/lucid-brahmagupta-htwgun-i`)

- Application installable : manifeste, service worker limité aux fichiers statiques (jamais l'API ni les médias), page hors ligne, bandeau « Nouvelle version disponible », invite d'installation ; CSP `worker-src`/`manifest-src 'self'`.
- Bouton « Confort » des étudiants : pomodoro facultatif et radio d'ambiance (flux YouTube nocookie définis sur le serveur, vide par défaut, son coupé au départ ; trois flux proposés dans l'ADR, non activés).
- Couleurs : tableau de contrastes, bouton principal sombre AAA, bordure des champs à 3:1 ; lien « Aller au contenu ». ADR-0024.

## 2026-10-28 — Correctifs de relecture (`claude/lucid-brahmagupta-htwgun-relecture`)

- Une leçon ne rapporte jamais de points, même si une ancienne version était notée ; une réussite notée ne vaut pas lecture.
- Reprise entre versions par mission (même mission, ou même slug à la même place) : un slug réutilisé dans un autre bloc est une autre mission, une tentative ne compte qu'une fois.
- Un bloc ouvert pendant le chargement de la page rafraîchit le tableau de bord ; « Activer les notifications hors de l'onglet » reste proposé si l'autorisation est déjà donnée sans abonnement Web Push.

## 2026-10-28 — Sprint 2, partie H : suivi en direct (`claude/lucid-brahmagupta-htwgun-h`)

- Présence (30 s), grille étudiants × blocs dans « Ma classe », message aux étudiants (280 caractères, accusés de lecture), notifications automatiques, centre de notifications de l'enseignant (aide, blocage, bloc terminé à X %, ouverture automatique, déconnexion ; réglages par type), cloche et historique, notifications système et Web Push facultatif.
- Déblocage d'un bloc pour un seul étudiant (« Ouvert pour vous »), ouverture automatique des blocs selon le temps restant (planning pondéré, rattrapage, pause, décalage, avance, recalcul, jamais de fermeture). Migration 0012. ADR-0023.

## 2026-10-28 — Résultats et accompagnement (`codex/resultats`)

- Résultats : points principaux et bonus séparés, pourcentage principal, missions principales réussies/non réussies et détail par étudiant ; icône et texte « À accompagner » sous un seuil réglable (50 % par défaut), tri et filtre, top 5 des missions les moins réussies sur la classe entière.
- Endpoint de lecture et CSV propres à Résultats, réservés au propriétaire ; points lus dans le moteur existant, dégressivité et meilleur essai compris. Format CSV conservé (BOM, séparateur, nombres et colonnes historiques), colonne `a_accompagner` ajoutée ; le compteur de réussite suit les missions principales affichées. Sans migration ni modification du suivi ou de la notation.

## 2026-10-28 — Sprint 2, partie K : classement facultatif (`codex/k-classement`)

- Page « Classement » et onglet « Progression du jour », actualisation toutes les 5 secondes, points principaux et bonus distincts, ex æquo au même rang, ligne personnelle marquée « Vous ».
- Réglages enseignant : désactivé par défaut, top 3 avec ex æquo et position personnelle, masquage pendant un bloc ouvert. Filtrage serveur, inscription/propriété, CSRF, aucun identifiant de connexion exposé. Pseudonyme choisi (24 caractères), nom neutre en attendant.
- Podium SVG original, Chakra v3, clavier, clair/sombre, mouvement réduit et contrôle axe. Migration `0011_leaderboard` limitée aux préférences et pseudonymes. ADR-0026. Aucun changement de notation ou d’export ; aucun contenu de cours ajouté.
- Retours CI K : propriété vérifiée avant validation des réglages (404 pour une autre classe même avec un corps invalide), navigation sans débordement mobile avec libellés longs ; régressions ciblées ajoutées.

## 2026-10-28 — Correctif : blocs terminés et republication (`claude/lucid-brahmagupta-htwgun-lecons`)

- Un bloc est « terminé » quand toutes ses missions notées sont réussies (hors bonus et hors leçons) ; « leçons lues x/y » s'affiche à part (étudiant, « Ma classe », vue de classe). Le score « missions réussies » ne compte plus les leçons.
- Après une republication, une leçon validée dans n'importe quelle version publiée du même slug reste lue, et une mission inchangée (même définition) reste réussie. Calcul à la lecture : les validations déjà enregistrées comptent tout de suite, sans migration ni copie.

## 2026-10-28 — Sprint 2, partie L : décourager le clic au hasard (`claude/lucid-brahmagupta-htwgun-l`)

- « Mon cours » → « Règles » : points dégressifs (100/70/50 puis 30 %, missions principales seulement), pause après une erreur (10/20/30 s, 429 côté serveur), lecture minimale des leçons (200 mots/min, 10 à 60 s, vérifiée par le serveur), repérage des clics rapides (badge dans « Ma classe », sans sanction), annonce modifiable. Tout désactivé par défaut sauf le repérage ; réglages audités.
- Pourcentage enregistré par essai, meilleur essai retenu, non rétroactif (date d'activation), rejouable. Migration 0010. ADR-0027.

## 2026-10-28 — Logo du propriétaire (`claude/lucid-brahmagupta-htwgun-logo`)

- En-tête et page de connexion : logo complet à côté du nom « ShopFlow Academy » en texte ; variante verte du propriétaire en mode sombre.
- Favicon SVG et PNG 16/32 : tête du renard seule, traits épaissis, couleurs de la variante verte en mode sombre ; icônes 192/512, apple-touch-icon et icône masquable tirées de la variante verte ; image de partage 1200×630 et balises Open Graph. ADR-0022c (remplace le monogramme de l'ADR-0022b).

## 2026-10-28 — Sprint 2, partie G2 : plan du cours, objectifs par catégorie, logo et icônes (`claude/lucid-brahmagupta-htwgun-g2`)

- Studio et aperçu : plan module → bloc → éléments, blocs repliables (le bloc courant ouvert), une ligne par élément (type, points, durée, badges Leçon / Bonus / Exécution, état), en-tête de bloc (numéro, durée, points), compteurs, recherche et filtre par type ; navigation par bloc dans l'aperçu.
- Objectifs groupés par catégorie (`category` facultatif, sinon déduit de `SQL-`, `PY-`, `BLOC-`), couverture cliquable, alerte si aucun élément ne couvre l'objectif. Migration 0009.
- Étudiant : objectif de chaque bloc ouvert en une phrase, aucun code d'objectif dans les réponses de l'API.
- Logo original (monogramme), favicon SVG, PNG 32/192/512, apple-touch-icon, icône masquable, `theme-color` clair et sombre. ADR-0022b.
## 2026-10-28 — Sprint 2, partie G : mise en page des leçons (`claude/lucid-brahmagupta-htwgun-g`)

- Leçon structurée : `objective`, `hook`, `key_terms`, `example`, `practice` (facultatifs) affichés dans un ordre fixe (objectif, accroche, vocabulaire, texte, exemple résolu, média, « À vous ») ; l'ancien format `body` seul reste valable.
- `data.description` pour tous les médias : lue par les lecteurs d'écran (`aria-describedby`), visible seulement via « Description du média ».
- Mise en forme légère sûre (gras, code en ligne, listes, sous-titres dans `body`) dans tous les textes du cours ; rendu React, aucun HTML interprété.
- Compilateur : nouveaux champs, erreurs localisées, avertissements de lisibilité (paragraphe > 80 mots, objectif de plus d'une phrase). `docs/COURSE-AUTHORING.md` (§ 5 bis, 5 ter), cours de démonstration, ADR-0022.

## 2026-10-28 — Sprint 2, partie E : suggestions (`claude/lucid-brahmagupta-htwgun-e`)

- `docs/SUGGESTIONS.md` : 14 améliorations classées par valeur et effort (S/M/L), distinctes de ce que le sprint a livré ; recommandation : signal des demandes d'aide hors de l'onglet et contrôle d'avant séance avant le prochain cours.

## 2026-10-28 — Sprint 2, partie B : expérience simple et mode sombre (`claude/lucid-brahmagupta-htwgun-b`)

- Mode sombre : chaque jeton du thème a sa valeur `_dark` ; sélecteur « Système / Clair / Sombre » mémorisé dans le navigateur, sans flash (`public/theme-init.js`, compatible CSP). axe 0 violation sérieuse dans les deux thèmes.
- Étudiant : lecteur en une colonne, aide repliable (état mémorisé), « Mission suivante » en bouton principal après une réussite, « Presque ! Réessayez » au lieu de « À revoir », raccourcis 1 à 9 et Entrée, libellés longs qui passent à la ligne (aucun défilement horizontal à 390 px).
- Enseignant : « Réinitialiser le mot de passe » d'un étudiant (affiché une seule fois, sessions fermées, audité sans le mot de passe).
- `scripts/login_sheets.py` : fiches de connexion imprimables (adresse, QR code, identifiant ; mot de passe seulement avec `--with-passwords`), écrites hors du dépôt. QR code sans dépendance (`scripts/qrcode_min.py`). ADR-0021.

## 2026-10-28 — Sprint 2, partie C : exécution de code préconfiguré (`claude/lucid-brahmagupta-htwgun-c`)

- Service `labdb` (PostgreSQL 16, réseau interne dédié, volume et identifiants à part) et `lab-init` (rôles `lab_reader` en lecture seule bornée, `lab_owner`) ; jeu fictif de démonstration ; `datasets/shopflow-lab.sql` chargé à l'import.
- « Exécuter » sur les requêtes du cours (seulement celles stockées dans la mission), sortie des extraits Python exécutés une fois sur le Mac dans un conteneur jetable sans réseau ; défi SQL bonus : contrôle `sqlglot`, exécution en lecture seule, correction par comparaison avec le résultat attendu.
- Le compilateur exécute les requêtes et extraits et signale les échecs avec fichier et ligne. 38 contournements testés. ADR-0017. `scripts/init_lab_env.py` (secrets du laboratoire).

## 2026-10-28 — Sprint 2, partie F : médias et animations codés (`claude/lucid-brahmagupta-htwgun-f`)

- `data.kind` `animation` (tables, surlignage, flèches, compteur, badge ; lecture, pause, pas à pas, recommencer ; description textuelle), `mindmap` (arbre au clavier, repliable, apparition progressive, alternative en liste), `flow` (jeton animé, compteurs acceptées/rejetées), `video` (youtube-nocookie.com / player.vimeo.com en iframe isolée, ou fichier du cours avec sous-titres).
- Vidéos du cours : adresse de contenu, volume `media_data` servi en lecture seule par le gateway ; CSP `frame-src` restreinte ; `prefers-reduced-motion` respecté. ADR-0018. Exemples dans `docs/examples/demo-course/`.

## 2026-10-28 — Sprint 2, partie D : chaîne d'import du cours Markdown (`claude/lucid-brahmagupta-htwgun-d`)

- `scripts/course_md.py compile|import [--publish]` et `app.course_md` : erreurs en français avec fichier et ligne, résumé par module et par bloc, couverture des objectifs, rapport `RETOURS-PLATEFORME.md` ; import en brouillon du cours (création ou mise à jour), publication facultative.
- Publication : les missions inchangées gardent leur version, donc la progression et les notes des étudiants ; nouveaux blocs fermés.
- Nouveaux contenus : leçon non notée (« J'ai compris »), graphique en courbes (points absents), code à lire, comparaison côte à côte ; `run` et `sql_challenge` acceptés et stockés (exécution en partie C) ; introduction de module (migration 0008).
- Exemple `docs/examples/demo-course/` compilé en CI et importé sur la stack de test ; skill `course-import` ; `docs/COURSE-AUTHORING.md` à jour (journal des changements de syntaxe). ADR-0020.

## 2026-10-28 — Sprint 2, partie A : blocs, « Ma classe », aide (`claude/lucid-brahmagupta-htwgun`)

- Journée en blocs de 15 minutes : état d'ouverture par classe et par bloc (migration 0007), blocs nouveaux fermés, aucun contenu exposé pour un bloc fermé ; « Ouvrir le bloc suivant », ouvrir/fermer un bloc, audit ; repère horaire réservé à l'enseignant.
- Étudiant : modules et blocs (ouvert, terminé, « Bientôt disponible »), « Continuer » vers la première mission principale non réussie, badge « Bonus », bouton « J'ai besoin d'une explication » (reçue → traitée).
- Enseignant : trois zones « Mon cours », « Ma classe », « Résultats » ; classe et cours uniques créés ou retrouvés automatiquement ; publication donnée directement à la classe ; demandes d'aide et statistiques par mission ; options avancées repliées.
- Ménage des cours de test (simulation par défaut, archivage seulement) : interface et `python -m app.course_cleanup`.
- `APP_SECRET` obligatoire en production (le backend refuse de démarrer sans lui). ADR-0019. `## Bloc :` accepté dans le format du cours.

## 2026-10-28 — P0-10 terminé, décisions du propriétaire (`feat/p0-10-owner-decisions`)

- `https://shopflow.rapidfox.io` en ligne ; `smoke_public.py` se connecte en production avec le compte du propriétaire et vérifie qu'un compte de démo est refusé.
- Studio, import/export, historique et suivi de classe réservés au propriétaire du cours (404 sinon) ; listes et recherche filtrées ; tests générés sur toutes les routes de cours.
- `app.account_policy` : un seul enseignant, étudiants `@ynov.com` seuls actifs, autres comptes désactivés sans suppression, sessions révoquées, audit ; simulation par défaut.
- Stack de test séparée (`scripts/test_stack.py`, projet `shopflow-academy-test`, port 3180, base jetable) ; Playwright, charge et persistance refusent la production ; CI alignée ; ADR-0016.
- Le cours de démonstration refuse de s'installer en production.

## 2026-10-28 — P0-10 exploitation, partiel (`feat/p0-10-operations`)

- Service Compose `backup` : sauvegardes PostgreSQL vérifiées toutes les 6 h, rétention, SHA-256.
- `scripts/restore_check.py` (restauration testée dans un conteneur jetable), `scripts/ops_status.py` (contrôle avant cours), rotation des journaux, `docs/RUNBOOK.md`, ADR-0015.

## 2026-10-28 — P0-09 qualité et démonstration complète (`feat/p0-09-quality`)

- Matrice d'autorisation générée depuis toutes les routes (anonyme, rôles, CSRF) et contrôles inter-comptes.
- Parcours E2E complet : l'enseignant importe et publie la démo, un étudiant la termine, la note persiste, un autre étudiant n'y a pas accès.
- `scripts/load_test.py` (10 étudiants + enseignant) et `scripts/persistence_check.py` (redémarrage et recréation), ajoutés à la CI ; `docs/QUALITY.md`.

## 2026-10-28 — P0-08 administration de contenu (`feat/p0-08-content-admin`)

- Format portable `shopflow-course` v1 ; export du brouillon ou d'une version publiée exacte ; import vérifié (simulation, rapport d'erreurs par chemin, jamais d'écrasement).
- Recherche et tri des cours dans le studio ; historique des modifications ; restauration du brouillon depuis une version publiée avec sauvegarde téléchargeable.

## 2026-10-28 — P0-07 tableau de bord enseignant (`feat/p0-07-teacher-dashboard`)

- Onglet « Suivi de classe » : classes du propriétaire, élèves (missions réussies, score, mission en cours, dernière activité, actif, besoin d'aide), détail par élève, actualisation toutes les 5 s.
- Interventions auditées : pause/reprise de séquence, déblocage individuel d'une mission, export CSV (Excel, anti-injection), journal ; migration 0006.
- Côté étudiant : état « En pause » ; correctif du focus clavier dans l'activité d'ordre ; contraste AA des badges succès/safran.
- Studio aligné sur le thème (palette `brand`).

## 2026-10-28 — P0-06 notation et progression (`feat/p0-06-grading-progress`)

- Points par tentative (barème tout ou rien ou partiel), meilleur score conservé, bonus séparés, progression et totaux recalculés depuis le journal des tentatives (aucun double comptage), rejeu vérifiable ; migration 0005.
- Historique personnel des essais ; score par mission et par cours dans le lecteur et le tableau de bord.
- Studio : champs « Barème » et « Explication ».

## 2026-10-28 — P0-05 lecteur étudiant (`feat/p0-05-student-player`)

- Tableau de bord étudiant : « Bonjour », cours attribués, états des missions (à faire, en cours, réussie, verrouillée), bouton « Continuer », ressources, emplacement score à venir.
- Lecteur de mission : situation, tableau ou graphique avec alternative en tableau, choix simple/multiple, vrai/faux, ordre (boutons monter/descendre), association (listes), feedback serveur, explication, réessai, indices progressifs, navigation, états erreur réseau, session expirée (brouillon conservé), IA désactivée.
- API `student/dashboard`, `student/missions/{id}`, tentatives idempotentes en ajout seul, indices un par un, limitation 20/min ; migration 0004.
- Cours de démonstration idempotent (frais de livraison 70 DH / 100 DH, validation CSV, ordre d'un pipeline) réservé aux comptes `demo.*`.
- Thème Chakra UI v3 unique (`theme.ts`, `docs/DESIGN.md`), écran de connexion et en-tête redessinés.

## 2026-10-28 — Correctifs de revue P0-01 à P0-04 (`fix/revue-p0-01-04`)

- Bloquant B1 : la vue étudiante utilise des identifiants de choix opaques par version de mission et un ordre mélangé déterministe ; les réponses d'ordre et d'association ne sont plus lisibles.
- Test de réversibilité de la chaîne Alembic.

## 2026-10-27 — Publication préparée (`ops/publication-shopflow`)

- Production : OpenAPI masqué, origines autorisées explicites (`APP_EXTRA_ORIGINS`), CSP et `Permissions-Policy` dans le gateway.
- `scripts/smoke_public.py` : contrôle de bout en bout local ou public sans afficher de secret, y compris non-régression n8n.
- ADR-0010, journal de publication et runbook d'exploitation.

## 2026-10-27 — P0-04 ([PR #14](https://github.com/mryoshq/shopflow-academy/pull/14), ouverte)

- Studio enseignant Chakra UI v3 pour créer, modifier, réordonner, prévisualiser, valider, publier, attribuer et archiver des cours et missions de démonstration depuis le navigateur.
- Lecteur étudiant initial des versions attribuées, sans corrigé ni notation ; tests Playwright du parcours enseignant et étudiant.
- Compte enseignant réel créé ou actualisé localement avec mot de passe généré hors Git et sans e-mail.
- Corrections de la revue P0-03 : comparaisons SQL, `display_data` typé, projection étudiante protégée et permissions après archivage.
- Documentation du dépôt public et ordre de fusion manuelle des PR #11 à #14.

## 2026-10-27 — P0-03 ([PR #13](https://github.com/mryoshq/shopflow-academy/pull/13), ouverte)

- Référentiel cours/objectifs/modules/chapitres/missions, brouillons typés, cohortes et assignations.
- Publication de versions figées avec projection étudiante sans clé de correction ; contrôle d'accès à la version assignée.
- API enseignant de création, lecture, édition et suppression des brouillons, prévisualisation et journal d'audit.

## 2026-10-27 — P0-02 ([PR #12](https://github.com/mryoshq/shopflow-academy/pull/12), ouverte)

- Authentification par session, Argon2, CSRF, expiration, révocation et limitation des tentatives.
- Rôles enseignant/étudiant et contrôle des profils par propriétaire.
- Écran de connexion Chakra UI v3 et espaces vides par rôle.
- Migration PostgreSQL, seed fictif local et import séparé de dix comptes étudiants fournis par le responsable, sans notification.

## 2026-10-27 — P0-01

- Socle React/FastAPI/PostgreSQL/Compose, gateway local, migrations, CI et documentation d'exploitation.
