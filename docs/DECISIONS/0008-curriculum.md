# ADR-0008 — Brouillons et versions pédagogiques P0-03

Status: Accepted, 2026-10-27.

Decision: Un cours contient des objectifs, modules, chapitres et missions ordonnés. Chaque mission garde un brouillon validé par Pydantic. Une publication copie les définitions privées dans des `mission_versions` et construit un `course_release` avec un instantané étudiant expurgé et un hash du contenu publié. Une nouvelle publication crée de nouveaux identifiants et numéros de version ; les anciens enregistrements restent lisibles, sans route de mutation. Les cohortes, inscriptions et assignations sont des enregistrements distincts. Un étudiant ne lit une version que si elle est assignée à l'une de ses cohortes. Les modifications et publications enseignant sont auditées.

Rationale: Le parcours et les futures notes doivent pouvoir pointer vers une version exacte, même après modification du brouillon. La projection étudiante est calculée côté serveur et exclut les clés de correction et le feedback privé. Les missions de démonstration restent distinctes des vrais cours à intégrer en P2.

Consequence: P0-04 peut construire le studio visuel sur ces routes sans demander à l'auteur de modifier React ni du JSON brut. P0-06 attachera les tentatives aux `mission_versions`. La suppression d'une structure déjà publiée est refusée ; les brouillons peuvent continuer à évoluer pour une nouvelle version.
