# ADR-0042 — Espace observateur professionnel

Date : 31 octobre 2026 · Statut : accepté (demande du propriétaire) · Complète l'ADR-0025

## Contexte
L'observateur de l'ADR-0025 (identifiant et mot de passe générés par l'enseignant, options « nominatif » et « corrigés ») ne suffit plus : la direction a besoin des notes, d'un export et d'un rapport ; un invité extérieur ne doit voir que des données anonymes. Le mot de passe ne doit plus transiter par l'enseignant.

## Décision
- **Deux types de compte**, stockés par compte (`observers.kind`) et vérifiés à chaque route :
  - « Administration » (`admin`) : noms réels, tableau de bord, graphiques, notes du cours et du projet, fiche d'un étudiant, cours publié, projet (binômes, jalons, rendus), export CSV et rapport PDF. Les corrigés apparaissent seulement si l'enseignant coche l'option pour ce compte ;
  - « Invité » (`guest`) : anonymisé (« Étudiant N »), tableau de bord, graphiques d'ensemble, cours publié. Pas de note individuelle, pas d'export, jamais de corrigé : l'option est forcée à faux.
- **Anonymisation stable par compte** (`observer_aliases`) : le numéro d'un étudiant est attribué une fois, dans l'ordre de la classe, puis ne change plus, même quand un étudiant arrive. Deux invités ont chacun leur numérotation.
- **Invitation** (Réglages > Observateurs) :
  - l'enseignant saisit un nom, un e-mail, un type et, pour « Administration », l'option corrigés ;
  - le serveur crée un lien à usage unique valable 7 jours (`observer_invitations`) ; seul le SHA-256 du jeton est stocké ;
  - l'observateur ouvre `#/invitation/<jeton>`, choisit son mot de passe, puis se connecte avec son e-mail. Avant activation, le compte n'a aucun mot de passe utilisable ;
  - règle du mot de passe choisi : 12 à 128 caractères, sans reprendre l'adresse, au moins 4 caractères différents (les autres comptes ont des mots de passe générés par le serveur) ;
  - « Renvoyer l'invitation » révoque le lien précédent ; « Révoquer l'invitation » ; « Désactiver » (sessions et liens révoqués) ; changer le type (les sessions sont révoquées : les nouveaux droits s'appliquent à la connexion suivante).
- **Envoi** :
  - par SMTP si `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` et `SMTP_FROM` sont configurés ;
  - `SMTP_SECURITY=ssl` (port 465) ou `starttls` (port 587) ; fournisseur prévu : Resend (`smtp.resend.com`, utilisateur `resend`, mot de passe = clé API) ;
  - sinon « Copier le lien » et « Préparer l'e-mail » (`mailto:` avec l'objet et le texte, au nom de Rapidfox Academy, en français) ;
  - « Envoyer un e-mail de test » ;
  - en cas d'échec, un message clair qui n'affiche jamais la configuration ; le lien reste disponible.
- **Espace de l'observateur** :
  - tableau de bord : étudiants, progression moyenne, réussite des essais, bonus, temps de travail estimé, blocs ouverts, date de mise à jour, version du cours, progression par étudiant ;
  - graphiques : progression dans le temps, réussite par module et par objectif, répartition des notes sans nom, activité par séance (essais, indices, demandes d'aide en nombre seulement) ;
  - notes (Administration) : tableau triable et filtrable, fiche d'un étudiant (progression par module, niveau, badges, projet), export CSV, rapport de classe en PDF daté et imprimable (`app/pdf_report.py`, sans dépendance) ;
  - cours : le cours publié, module par module, sans pouvoir répondre ;
  - jamais : le texte des demandes d'aide, la présence en direct, les notifications, les données de connexion. Les anciennes routes `progress`, `results` et `results/export.csv`, qui contenaient la présence, sont retirées.
- **Temps de travail estimé** : somme des écarts de moins de 15 minutes entre deux essais d'un même étudiant ; un écart plus long compte comme une pause.
- **Journal des consultations** : chaque vue est inscrite (`observer.view`). L'enseignant la lit dans Réglages > Observateurs : date, observateur, type, consultation, classe.
- **Lecture seule** : l'observateur reste refusé (403 ou 404) sur toutes les routes enseignant et étudiant et sur toute écriture, déconnexion exceptée. Les deux routes publiques d'invitation sont les seules sans session.

## Conséquences
- Migration `0017_observer_pro` : `observers.kind`, `full_name`, `email` ; tables `observer_invitations` et `observer_aliases`. Les observateurs existants nominatifs deviennent « Administration », les autres « Invité ».
- La matrice d'autorisation (`test_security_matrix.py`) inclut les routes publiques d'invitation ; `test_observer.py` vérifie les droits de chaque type sur chaque route, l'IDOR, l'invitation unique et expirée, l'anonymisation stable, l'absence d'écriture et le journal.
