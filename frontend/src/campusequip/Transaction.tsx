import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, Flex, Text } from "@chakra-ui/react";
import type { Scenario } from "./model";
import type { State } from "./content";
import { Icon } from "./icons";
import { Count } from "./ui";
import { EASE, useSize } from "./hooks";

export interface TransactionProps {
  state: State;
  scenario: Scenario;
  /** The model's frame index (5: prepare, 6: commit, 7–8: the crash and the restart). */
  at: number;
  action?: string;
  onAction: () => void;
  reduced: boolean;
}

/** « Le chargement »: the business rows and the batch signature are written in one transaction, or not at all. */
export function Transaction({ state, scenario, at, action, onAction, reduced }: TransactionProps) {
  const area = useRef<HTMLDivElement>(null);
  const { w } = useSize(area);
  const row = w >= 640;
  // The two tables stay side by side down to phone width: the lock between them is the point of the step.
  const pair = w >= 260;
  const s = state.status;
  const structure = s === "REJETE_STRUCTURE";
  const preparing = s === "ATTENTE";
  const committed = s === "CHARGE" || s === "ECHEC_APRES_COMMIT";
  const known = s === "DEJA_CHARGE";
  const rollback = s === "CONFLIT";
  const crash = s === "ECHEC_APRES_COMMIT";
  const tone = rollback || crash || structure ? "bad" : committed || known ? "ok" : "wait";
  const label = structure
    ? "Aucune transaction ouverte"
    : preparing
      ? "Une transaction en préparation"
      : rollback
        ? "ROLLBACK · aucun nouvel ajout"
        : known
          ? "Signature déjà reconnue"
          : "COMMIT · écritures conservées";
  const sig = state.batch.fingerprint.slice(0, 8);
  const pending = state.report.accepted;
  const writes = !structure && (preparing || committed);
  const t = (d: number) => (reduced ? 0 : d);

  return (
    <Flex ref={area} direction="column" gap="3" h="full" minH="0" className="transaction" data-tone={tone}>
      <Flex direction={row ? "row" : "column"} gap={row ? "4" : "2.5"} align="stretch" flex={row ? "1" : "none"} minH={row ? "0" : undefined}>
        {/* The incoming batch */}
        <motion.div
          className={"incoming" + (row ? "" : " flat") + (committed || known ? " spent" : "")}
          initial={reduced ? false : { opacity: 0, x: row ? -16 : 0, y: row ? 0 : -10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <Text textStyle="overline" fontSize="2xs" color="app.muted" letterSpacing="0.12em">
            Lot {state.batch.id}
          </Text>
          <Text fontFamily="heading" fontWeight="semibold" fontSize={row ? "2xl" : "lg"} lineHeight="1.1">
            {structure ? "—" : pending}
            <Text as="span" fontSize="sm" fontWeight="normal" color="app.muted">
              {" "}
              {structure ? "aucune ligne lisible" : "lignes valides"}
            </Text>
          </Text>
          <Flex align="center" gap="1.5" mt="1" fontSize="xs" color="app.muted">
            <Icon name="shield" size={13} />
            Signature <code className="sig">{structure ? "—" : sig + "…"}</code>
          </Flex>
          {row && <Icon name="arrow" size={22} style={{ position: "absolute", right: -26, top: "50%", marginTop: -11, opacity: 0.55 }} />}
        </motion.div>

        {/* The transaction boundary */}
        <motion.div
          className={"boundary " + tone + (preparing ? " open" : "")}
          animate={rollback && !reduced ? { x: [0, -7, 7, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.5, delay: t(0.2) }}
        >
          <Flex className="boundary-label" align="center" gap="1.5">
            <Icon name={committed || known ? "lock" : rollback || crash ? "alert" : "shield"} size={15} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: t(0.2) }}>
                {label}
              </motion.span>
            </AnimatePresence>
          </Flex>
          <Flex direction={pair ? "row" : "column"} gap={row ? "2.5" : "1.5"} align="stretch" flex={row ? "1" : "none"} minH={row ? "0" : undefined}>
            <div className={"db-box" + (s === "CHARGE" ? " flash" : "")}>
              <Flex align="center" gap="1.5" className="db-title">
                <Icon name="database" size={15} /> Données métier
              </Flex>
              <Flex gap="4">
                <div className="db-num">
                  <strong>
                    <Count value={state.contracts} reduced={reduced} delay={0.35} />
                  </strong>
                  <small>contrats</small>
                </div>
                <div className="db-num">
                  <strong>
                    <Count value={state.lines} reduced={reduced} delay={0.35} />
                  </strong>
                  <small>lignes</small>
                </div>
              </Flex>
              {writes && preparing && <span className="ghost-write">+ {pending} lignes à écrire</span>}
              {rollback && <span className="ghost-write bad">Contrat 1 déjà présent</span>}
            </div>

            <div className={"atomic" + (pair ? "" : " v")} aria-hidden="true">
              <motion.span className="atomic-line" initial={false} animate={{ opacity: preparing ? 0.5 : 1 }} />
              <motion.span className="atomic-lock" initial={false} animate={{ rotate: committed || known ? 0 : -18, scale: committed ? [1, 1.25, 1] : 1 }} transition={{ duration: t(0.5), delay: t(0.3) }}>
                <Icon name={committed || known ? "lock" : "layers"} size={16} />
              </motion.span>
              <motion.span className="atomic-line" initial={false} animate={{ opacity: preparing ? 0.5 : 1 }} />
            </div>

            <div className={"db-box ledger" + (s === "CHARGE" ? " flash" : "")}>
              <Flex align="center" gap="1.5" className="db-title">
                <Icon name="book" size={15} /> Journal des lots
              </Flex>
              <div className="db-num">
                <strong>
                  <Count value={state.batches} reduced={reduced} delay={0.35} />
                </strong>
                <small>signature(s) conservée(s)</small>
              </div>
              <Flex gap="1.5" wrap="wrap" minH="24px">
                <AnimatePresence initial={false}>
                  {state.db.ledger.map((f) => (
                    <motion.code
                      key={f}
                      className={"sig chip" + (known && f === state.batch.fingerprint ? " match" : "")}
                      initial={reduced ? false : { opacity: 0, y: -8, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: t(0.45), type: "spring", stiffness: 380, damping: 22 }}
                    >
                      {f.slice(0, 8)}…{known && f === state.batch.fingerprint ? " =" : ""}
                    </motion.code>
                  ))}
                </AnimatePresence>
                {!state.db.ledger.length && <span className="muted-note">Aucune signature</span>}
              </Flex>
            </div>
          </Flex>
          <AnimatePresence>
            {crash && (
              <motion.div className="crash" role="alert" initial={reduced ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 18, delay: t(0.2) }}>
                <Icon name="bolt" size={18} />
                <span>Panne après le commit : les écritures sont déjà conservées.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </Flex>

      <Flex align="center" gap="2.5" wrap="wrap" className="t-result">
        <motion.span key={s} className={"status-tag " + tone} initial={reduced ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
          {preparing ? "EN ATTENTE" : s}
        </motion.span>
        <Text fontSize="sm" color="app.muted" flex="1" minW="12rem">
          {crash
            ? "Le programme a échoué après la validation. Les écritures restent en base."
            : rollback
              ? "Un contrat existe déjà : aucun contrat du nouveau lot n’est ajouté."
              : structure
                ? "Le lot a été refusé à la lecture : la transaction ne démarre pas."
                : preparing
                  ? "Le modèle montre l’état conservé avant toute nouvelle écriture."
                  : `${state.added} ligne(s) ajoutée(s) pendant cette tentative.${scenario === "panne" && at >= 8 ? " La reprise reconnaît le lot." : ""}`}
        </Text>
        {action && (
          <Button size="sm" colorPalette="brand" onClick={onAction}>
            {action} <Icon name="arrow" size={14} />
          </Button>
        )}
      </Flex>
    </Flex>
  );
}
