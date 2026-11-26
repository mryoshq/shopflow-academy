# ADR-0052 — Adresse publique `dataflow.mryoshq.com` (compte Cloudflare mryoshq)

Statut : accepté par le propriétaire le 25/11/2026. Remplace, pour l'adresse et le tunnel, ce que fixaient ADR-0005, ADR-0010 et `docs/DEPLOY-RAPIDFOX.md`.

## Contexte
Le propriétaire ferme le compte Cloudflare `yoshq.xd`, qui portait la zone `rapidfox.io` et le tunnel partagé `m316` (ShopFlow, n8n, OXORUS). `rapidfox.io` n'est pas renouvelé (expiration 05/02/2027). Tout passe sur le compte **mryoshq** et le domaine **mryoshq.com**.

## Décision
- Adresse publique : **`https://dataflow.mryoshq.com`**. `shopflow.rapidfox.io` répond 301 vers la même page (règle de redirection de la zone `rapidfox.io`, désormais dans le compte mryoshq) tant que le domaine existe.
- Tunnel **dédié** `dataflow` (compte mryoshq) : route `dataflow.mryoshq.com` → `http://host.docker.internal:3080`. Son connecteur est un conteneur `cloudflared` du projet Compose `mryoshq-tunnels` (`~/Developer/tunnels`, README), hors de ce dépôt. Le gateway reste lié à `127.0.0.1:3080`.
- `.env` de production : `APP_BASE_URL=https://dataflow.mryoshq.com`, `APP_EXTRA_ORIGINS=http://127.0.0.1:3080,https://shopflow.rapidfox.io` pendant la bascule (l'ancienne origine peut être retirée une fois la redirection active), `SMTP_FROM` sur `mail.mryoshq.com` (domaine vérifié chez Resend, même clé API).
- n8n : `n8n.mryoshq.com`, son propre tunnel ; il reste hors de cette stack.
- Le nom de la marque (« Rapidfox Academy », ADR-0037), les noms de fichiers exportés et la clé `rapidfox:intro-shown` ne changent pas : seule l'adresse change.
- Les gardes « production » des scripts et de Playwright refusent les deux adresses (nouvelle et ancienne).

## Conséquences
- Les liens, QR codes et fiches de connexion générés après ce changement pointent vers `dataflow.mryoshq.com` ; les anciens liens continuent de fonctionner grâce à la redirection, jusqu'à l'expiration de `rapidfox.io`.
- `docs/DEPLOY-RAPIDFOX.md` devient historique (procédure de la première publication).
