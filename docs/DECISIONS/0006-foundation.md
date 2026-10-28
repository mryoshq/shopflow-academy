# ADR-0006 — Socle P0-01 et publication locale

Status: Accepted, 2026-10-27.

Decision: Le premier schéma Alembic crée uniquement `users` (aucun compte réel). FastAPI expose `/health/live` sans dépendance DB et `/health/ready` avec `SELECT 1` sur PostgreSQL. Le frontend React utilise Chakra UI v3 conformément aux instructions du projet. Un gateway Nginx unique écoute sur le loopback du Mac et route `/api/` et `/health/` vers FastAPI, `/` vers React. La configuration Nginx est copiée dans l'image plutôt que montée depuis le Mac, après un échec d'E/S du bind mount observé localement. Le port PostgreSQL reste interne à Compose.

Rationale: Fournir un socle testable sans présumer l'authentification et le modèle de cours des lots suivants. Un seul hostname local évite CORS. La copie dans l'image rend le démarrage reproductible sur le Mac testé.

Consequence: P0-02 ajoute les sessions et permissions. Les routes `status` et `health` ne donnent aucune donnée privée. Aucune route Cloudflare n'est créée par Compose.
