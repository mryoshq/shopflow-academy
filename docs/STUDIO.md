# Studio enseignant P0-04

Le studio fonctionne dans le navigateur sur la stack Academy locale. Il permet de créer un cours, ses objectifs, modules, chapitres et missions, puis de les réordonner et de modifier leurs contenus sans changer le code React. Les cours du programme définitif seront ajoutés plus tard ; utiliser ici des contenus clairement identifiés comme démonstrations.

## Accès local

Lancer `docker compose up -d --build`, puis ouvrir `http://127.0.0.1:3080/`. Le script `python3 scripts/upsert_teacher.py` lit l'adresse depuis `.local/teacher-email.txt`, génère un mot de passe fort et le conserve uniquement dans `.local/teacher-credentials.json` (mode 0600). Il crée ou actualise le compte `teacher` sans doublon et n'envoie aucun e-mail. Ces fichiers ne doivent jamais entrer dans Git ; la commande est désactivée en production.

Pour un parcours de test sans données personnelles, `python3 scripts/test_stack.py up` démarre la stack de test (`127.0.0.1:3180`, base jetable) avec des comptes fictifs dont les identifiants sont dans `.local/test-stack-credentials.json`. Les comptes fictifs ne sont jamais créés en production.

## Parcours d'édition

1. Créer un cours de démonstration et renseigner au moins un objectif, un module et un chapitre.
2. Créer une mission, choisir son type, compléter la situation, la consigne, les propositions, la correction privée, les points et la durée. Les tableaux ou graphiques sont édités par formulaire. Les indices, ressources HTTPS et prérequis sont facultatifs.
3. Enregistrer la mission. Le serveur valide le schéma et les liens aux objectifs ; une erreur apparaît dans le studio si le contenu est incomplet. Le JSON d'une définition de mission peut aussi être importé ou exporté dans l'éditeur ; l'import reste soumis à la même validation serveur. L'import/export de cours complets est prévu dans P0-08.
4. Ouvrir **Aperçu** pour voir la projection étudiante. La simulation compare une sélection à la correction privée sans enregistrer de tentative ni de point.
5. Ouvrir **Publication**, vérifier le brouillon puis publier. Chaque publication crée une nouvelle version immuable ; les anciennes versions conservent leur contenu.
6. Créer une cohorte, y inscrire les comptes voulus et attribuer une version publiée. Seuls les étudiants inscrits peuvent ouvrir cette version. L'archivage retire toutes les versions de l'accès étudiant et rend le cours non modifiable.

Le lecteur étudiant P0-04 affiche les cours attribués et leur contenu sans corrigé. La soumission, les scores et la progression seront livrés dans P0-05/P0-06. Le dépôt GitHub est public, mais l'application reste uniquement locale tant que sa publication Cloudflare n'est pas autorisée.

## Vérification

`backend: python -m pytest -q` vérifie les règles métier et les permissions. `frontend: npm run test -- --maxWorkers=1` vérifie l'interface. Après `python3 scripts/test_stack.py up`, `frontend: npm run test:e2e` (stack de test uniquement) vérifie le parcours de création, aperçu, publication, attribution et lecture étudiante à 1366 × 768. Les captures de test ne doivent contenir que des comptes et contenus fictifs.
