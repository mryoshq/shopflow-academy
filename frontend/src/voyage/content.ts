import { BASE, BATCH, type snapshot } from "./model";
import type { Scenario, Task, TaskStatus } from "./model";

export const statusLabels: Record<TaskStatus, string> = {
  waiting: "En attente",
  running: "En cours",
  success: "Réussie",
  error: "Échec",
  retry: "Nouvelle tentative",
};

/** Shorter labels for the small DAG cards. */
export const statusShort: Record<TaskStatus, string> = {
  waiting: "En attente",
  running: "En cours",
  success: "Réussie",
  error: "Échec",
  retry: "Retry",
};

export const taskIcons: Record<Task, string> = {
  wait_source: "clock",
  preflight: "shield",
  load_orders: "database",
  load_events: "layers",
  refresh_cache: "stack",
  rebuild_queue: "route",
  verify_result: "check",
};

export const taskTitles: Record<Task, string> = {
  wait_source: "Attendre les sources",
  preflight: "Vérifier le lot",
  load_orders: "Charger les commandes",
  load_events: "Charger les événements",
  refresh_cache: "Rafraîchir le cache",
  rebuild_queue: "Reconstruire la file",
  verify_result: "Vérifier les résultats",
};

export const questions = [
  {
    q: "Pourquoi 7 lignes acceptées donnent-elles 6 commandes ?",
    a: "Le grain du CSV est la ligne de commande. Les 7 lignes se répartissent entre 6 clés order_id : 1001, 1002, 1003, 1004, 1005 et 1012. Une commande possède donc plusieurs lignes.",
  },
  {
    q: "Une tâche échouée signifie-t-elle que rien n’a été enregistré ?",
    a: "Non. Dans la panne après commit, les écritures sont déjà validées. Le retry reconnaît le lot et renvoie SKIPPED_ALREADY_LOADED : les compteurs restent à 16 commandes et 20 lignes.",
  },
  {
    q: "Que perd-on lorsque le cache expire ?",
    a: "La copie temporaire dans Redis disparaît. Les commandes et les agrégats persistants restent dans PostgreSQL ; le CA reste à 5 425,00 MAD. La file des exceptions est un espace distinct.",
  },
];

export const scenarios: { id: Scenario; title: string; short: string; text: string; icon: string }[] = [
  { id: "normal", title: "Parcours nominal", short: "Nominal", text: "Du lot source au contrôle final.", icon: "check" },
  { id: "after-commit", title: "Panne après commit", short: "Panne après commit", text: "Un échec, des données conservées.", icon: "alert" },
  { id: "replay", title: "Rejouer le même lot", short: "Rejeu du lot", text: "Deux exécutions, un seul chargement.", icon: "reset" },
  { id: "redis", title: "Panne Redis", short: "Panne Redis", text: "Deux branches attendent leur reprise.", icon: "stack" },
];

export const TABS = ["Données", "Avant / après", "Définitions", "Journal"] as const;
export type Tab = (typeof TABS)[number];
export type Modal = "glossary" | "architecture" | "about" | "question" | "file" | null;
export type Mode = "guided" | "free";

/** Base duration of one step during autoplay, before the speed multiplier. */
export const STEP_MS = 3800;

/** State of the pipeline at one frame (computed by the owner's model). */
export type Snapshot = ReturnType<typeof snapshot>;

/**
 * What a complete run must reach. Read at render time: VoyagePage applies the course values
 * (applyVoyageData) to BASE and BATCH before the experience mounts.
 */
export function expected() {
  return {
    orders: BASE.orders + BATCH.orderIds.length,
    lines: BASE.lines + BATCH.accepted,
    revenue: BASE.revenue + BATCH.revenue,
    events: BATCH.events.inserted,
    queue: BATCH.queue.join(", "),
  };
}
