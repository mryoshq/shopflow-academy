import { frames, scenarios, snapshot, type Frame, type Scenario } from "./model";

/** Static files of the experience (CSV of the batches, provenance, subject PDF), served by the Academy. */
export const FILES = "/experiences/campusequip/";

/** Autoplay: time on each step at 1×. */
export const STEP_MS = 3400;
/** The continuous flow: time spent at each station at 1×. */
export const FLOW_MS = 1000;

export type Modal = "glossary" | "sources" | null;
export type Tab = "detail" | "rules" | "question";

/** The seven steps of the journey (owner's titles, headlines and introductions). */
export const chapters = [
  {
    title: "Le territoire",
    sub: "Des campus aux guichets",
    icon: "route",
    headline: "D’un guichet à une donnée fiable.",
    intro: "Suivez une location à travers les campus, les contrôles Python et les résultats SQL. Observez, expérimentez, puis expliquez.",
    stage: "Le réseau CampusEquip",
    detail: "Une location, concrètement.",
    pages: "3–5",
  },
  {
    title: "Les sources",
    sub: "Un lot, quatre fichiers",
    icon: "file",
    headline: "Tout commence par un lot.",
    intro: "Avant les calculs, vous devez savoir ce que vous recevez et à quel moment vous pouvez le lire.",
    stage: "Le dossier du lot",
    detail: "Le contrat des sources.",
    pages: "3–4",
  },
  {
    title: "La qualité",
    sub: "Décider au bon niveau",
    icon: "shield",
    headline: "Chaque ligne a son histoire.",
    intro: "Une copie, une erreur, une anomalie : ces situations ne déclenchent pas la même décision.",
    stage: "Le parcours du lot",
    detail: "Contrat",
    pages: "4–6",
  },
  {
    title: "Le chargement",
    sub: "Une seule transaction",
    icon: "database",
    headline: "Charger une fois. Reprendre sans doubler.",
    intro: "Le journal et les données métier avancent ensemble. C’est la base d’un rejeu sans doublons.",
    stage: "La base PostgreSQL simulée",
    detail: "Avant et après le commit.",
    pages: "8",
  },
  {
    title: "Les indicateurs",
    sub: "Répondre avec les données",
    icon: "layers",
    headline: "Les données prennent du sens.",
    intro: "Choisissez un campus. Comparez les dates, les équipements et les unités de location.",
    stage: "Les résultats SQL",
    detail: "Lire le résultat.",
    pages: "7",
  },
  {
    title: "Le flux continu",
    sub: "Un lot après l’autre",
    icon: "workflow",
    headline: "Le prochain lot arrive déjà.",
    intro: "Le générateur publie. Le surveilleur attend. Votre traitement prend en charge chaque nouveau lot.",
    stage: "La séquence automatique",
    detail: "Et dans le vrai kit ?",
    pages: "9",
  },
  {
    title: "La suite du projet",
    sub: "Des bonus, puis deux axes",
    icon: "book",
    headline: "Un socle simple. Des horizons ouverts.",
    intro: "Le travail actuel concerne SQL et Python. Les bonus sont facultatifs ; les axes suivants viendront plus tard.",
    stage: "La feuille de route",
    detail: "Votre cadre de travail.",
    pages: "11–12",
  },
] as const;

export const decisionLabels = { accepted: "Validée", rejected: "Quarantaine", duplicate: "Doublon" } as const;

/** Short labels of the scenarios for the segmented control (the model's labels in the menus). */
export const scenarioShort: Record<Scenario, string> = {
  normal: "Sans erreur",
  qualite: "Qualité",
  rejeu: "Rejeu",
  conflit: "Conflit",
  panne: "Panne",
  structure: "Structure",
};
/** Two scenarios are pedagogical changes to the generator's output (owner's wording). */
export const modified = (s: Scenario) => s === "conflit" || s === "structure";
export const scenarioOrigin = (s: Scenario, profile: string) =>
  modified(s)
    ? "Cas illustratif modifié à partir du générateur. Les règles sont celles du sujet actuel."
    : `Données produites par le générateur du kit · profil ${profile} · 20 contrats. Les règles sont celles du sujet actuel.`;

/** One question per step (owner's questions). */
export const questions = [
  { q: "Une location à l’heure doit-elle être convertie en jours ?", answers: ["Oui, avant le calcul.", "Non, la durée et le tarif ont déjà la même unité."], correct: 1, why: "Vous multipliez la quantité, la durée et le tarif de la ligne. Aucune conversion hour/day n’est nécessaire." },
  { q: "Le marqueur READY garantit-il que les données sont valides ?", answers: ["Oui, tous les contrôles ont réussi.", "Non, il signale que le lot complet peut être lu."], correct: 1, why: "Le surveilleur vérifie les empreintes. Les contrôles métier doivent encore être exécutés." },
  { q: "Une ligne a une quantité négative. Que faut-il isoler ?", answers: ["Cette ligne uniquement.", "Toutes les lignes reçues de ce contrat."], correct: 1, why: "La quarantaine protège la cohérence du contrat entier. Les autres contrats valides du lot peuvent être chargés." },
  { q: "Une panne après commit signifie-t-elle que rien n’est chargé ?", answers: ["Non, les données et le journal sont déjà conservés.", "Oui, toute panne annule le commit."], correct: 0, why: "Une reprise reconnaît la signature du lot et renvoie DEJA_CHARGE. Elle n’ajoute aucune ligne." },
  { q: "Un contrat draft valide doit-il disparaître de la base ?", answers: ["Oui, car son montant est exclu.", "Non, il est stocké mais ne contribue pas aux montants."], correct: 1, why: "Stockage et calcul d’indicateur sont distincts. Seuls paid et closed contribuent au montant retenu." },
  { q: "Après trois lots, faut-il redémarrer le traitement ?", answers: ["Non, le surveilleur peut attendre les suivants.", "Oui, pour chaque nouveau fichier."], correct: 0, why: "Le script réel tourne jusqu’à son arrêt. Cette séquence visuelle est volontairement limitée à trois lots." },
  { q: "MongoDB et Airflow sont-ils à réaliser maintenant ?", answers: ["Non, le sujet actuel porte sur SQL et Python.", "Oui, pour obtenir les points du socle."], correct: 0, why: "Les axes 3 et 4 sont un aperçu. Le socle actuel vaut 10 points, avec 5 points bonus facultatifs." },
] as const;

/** « Les règles » of each step (owner's rules for steps 1 to 5; steps 6 and 7 restate the owner's texts). */
export const rules: [string, string][][] = [
  [
    ["Le bon grain", "Une ligne représente un équipement loué dans un contrat. La quantité désigne des exemplaires."],
    ["Deux unités", "hour et day. Le tarif et la durée ont la même unité."],
    ["Le montant", "quantity × duration × unit_rate. Un tarif historique, une représentation décimale exacte."],
  ],
  [
    ["Quatre fichiers", "locations.csv, referentiels.json, manifest.json et READY."],
    ["Intégrité puis qualité", "Le marqueur et les empreintes préparent la lecture. Les contrôles métier viennent ensuite."],
    ["Une campagne", "Une nouvelle campagne utilise une autre base de démonstration pour ne pas mélanger les identifiants."],
  ],
  [
    ["Dédoublonner", "Une seule occurrence des lignes exactement identiques après normalisation."],
    ["Isoler le contrat", "Une erreur de ligne ou un conflit interne entraîne la quarantaine de tout le contrat."],
    ["Alerter sans rejeter", "quantity > 20 déclenche une anomalie ; le taux de rejet > 20 % déclenche une alerte. Les contrats valides peuvent être chargés."],
  ],
  [
    ["Tout ou rien", "Les données et la signature du lot sont dans la même transaction."],
    ["Reconnaître le rejeu", "Le journal fait foi, même après un redémarrage."],
    ["Refuser le conflit", "Un contenu nouveau ne peut pas écraser un contrat déjà chargé."],
  ],
  [
    ["Retenir les bons statuts", "paid et closed contribuent. draft et cancelled restent stockés s’ils sont valides."],
    ["Une date de référence", "Tout le montant est affecté à start_date. Il n’est pas réparti sur les journées."],
    ["Monnaie commune", "Les montants sont comparables en MAD. Les durées de deux unités ne s’additionnent pas directement."],
  ],
  [
    ["Le générateur publie", "Chaque lot arrive complet, avec ses empreintes et son marqueur READY."],
    ["Le surveilleur attend", "Le script tourne jusqu’à son arrêt : il prend en charge chaque nouveau lot sans redémarrer."],
    ["Aucun doublon", "La signature du lot, inscrite avec les données, permet de reconnaître un lot déjà chargé."],
  ],
  [
    ["Le socle", "SQL et Python : un modèle cohérent, trois analyses, des contrôles explicables et un chargement automatique sans doublons. 10 points."],
    ["Les bonus", "Facultatifs, jusqu’à 5 points : un index utile, une analyse plus loin, une lecture par morceaux, un signal IoT."],
    ["Plus tard", "Les axes 3 et 4 (MongoDB, Redis, Airflow, TimescaleDB) ne sont pas demandés dans ce sujet."],
  ],
];

/** A step of the player: a frame of the model (steps 1 to 5), or one of the two exploration steps (6 and 7). */
export type Step = Frame & {
  key: string;
  /** Index of the frame in the model's timeline, for snapshot(). */
  at: number;
  /** Steps 6 and 7: explored with their own controls, autoplay stops before them. */
  explore?: boolean;
};

/**
 * The player's steps for a scenario: the model's frames, then the two exploration steps.
 * « Colonne manquante » stops at the quality step in the model: two closing steps (no transaction, no
 * indicator) keep every chapter reachable; they restate what the model computes (REJETE_STRUCTURE, empty base).
 */
export function timeline(s: Scenario): Step[] {
  const own = frames(s);
  const steps: Step[] = own.map((f, i) => ({ ...f, key: `${s}-${i}`, at: i }));
  if (s === "structure") {
    const at = own.length - 1;
    steps.push(
      { scene: 3, node: 4, at, key: "structure-load", title: "Aucune transaction n’est ouverte.", text: "REJETE_STRUCTURE : ni les données ni la signature du lot ne sont écrites. La base garde son état précédent." },
      { scene: 4, node: 5, at, key: "structure-sql", title: "Aucun nouveau montant à analyser.", text: "Aucun contrat n’a été chargé par ce lot. Les indicateurs ne changent pas." },
    );
  }
  const last = own.length - 1;
  steps.push(
    { scene: 5, node: 5, at: last, explore: true, key: "flow", title: chapters[5].headline, text: chapters[5].intro },
    { scene: 6, node: 5, at: last, explore: true, key: "future", title: chapters[6].headline, text: chapters[6].intro },
  );
  return steps;
}

export type State = ReturnType<typeof snapshot>;
export const scenarioOf = (id: Scenario) => scenarios.find((s) => s.id === id)!;
export const pad = (n: number) => String(n).padStart(2, "0");
/** Statuses that end a step in red. */
export const failed = (status: string) => status === "CONFLIT" || status === "ECHEC_APRES_COMMIT" || status === "REJETE_STRUCTURE";
