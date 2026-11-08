import { useRef } from "react";
import { motion } from "motion/react";
import { Box, Code, Flex, NativeSelect, Text } from "@chakra-ui/react";
import { columns, number, type Report } from "./model";
import { decisionLabels } from "./content";
import { Icon } from "./icons";
import { Count } from "./ui";
import { EASE, useSize } from "./hooks";

const NODES = [
  ["Les guichets", "route"],
  ["Le lot complet", "file"],
  ["Normaliser", "settings"],
  ["Contrôler", "shield"],
  ["Transaction", "database"],
  ["Analyser", "layers"],
] as const;

/** The six stages of a batch; the current one pulses, the past ones are checked. */
export function Pipeline({ active, failed, reduced, labels }: { active: number; failed: boolean; reduced: boolean; labels: boolean }) {
  return (
    <ol className={"pipeline" + (labels ? "" : " icons-only")} aria-label="Le parcours du lot">
      {NODES.map(([name, icon], n) => {
        const state = n < active ? "done" : n === active ? (failed ? "failed" : "now") : "todo";
        return (
          <li key={name} className={"p-node " + state} aria-current={n === active ? "step" : undefined}>
            {n > 0 && (
              <span className="p-link" aria-hidden="true">
                <motion.i initial={false} animate={{ scaleX: n <= active ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.5, ease: EASE, delay: reduced ? 0 : 0.1 }} />
              </span>
            )}
            <motion.span className="p-dot" initial={false} animate={{ scale: n === active ? 1.08 : 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}>
              <Icon name={state === "done" ? "check" : state === "failed" ? "alert" : icon} size={labels ? 17 : 15} />
            </motion.span>
            <b className={labels || n === active ? "" : "sr"}>{name}</b>
          </li>
        );
      })}
    </ol>
  );
}

export interface QualityProps {
  report: Report;
  /** 0: lines read, 1: duplicates found, 2: every decision taken. */
  phase: number;
  node: number;
  failed: boolean;
  filter: string;
  onFilter: (f: string) => void;
  row: number;
  onRow: (n: number) => void;
  reduced: boolean;
  touch: boolean;
}

/** « La qualité »: read, deduplicate, then decide contract by contract. */
export function Quality(p: QualityProps) {
  const area = useRef<HTMLDivElement>(null);
  const { w } = useSize(area);
  const wide = w >= 620;
  const ready = p.phase >= 2;
  const dupes = p.phase >= 1;

  if (p.report.structure) {
    return (
      <Flex ref={area} direction="column" gap="3" h="full" minH="0">
        <Pipeline active={2} failed reduced={p.reduced} labels={w >= 520} />
        <motion.div className="structure-error" role="alert" initial={p.reduced ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}>
          <Icon name="alert" size={30} />
          <Text fontFamily="heading" fontWeight="semibold" fontSize="lg">
            La colonne unit est absente.
          </Text>
          <Text fontSize="sm">Le lot entier est refusé avant les contrôles métier et les écritures.</Text>
          <Box className="header-strip" aria-label="Colonnes attendues">
            {columns.map((c, n) => (
              <motion.code key={c} className={c === "unit" ? "gap" : ""} initial={p.reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: p.reduced ? 0 : 0.3 + n * 0.04 }}>
                {c}
              </motion.code>
            ))}
          </Box>
          <Code colorPalette="red" variant="solid" fontSize="sm">
            REJETE_STRUCTURE
          </Code>
        </motion.div>
      </Flex>
    );
  }

  const r = p.report;
  const lines = r.lines.filter((l) => p.filter === "all" || l.decision === p.filter);
  const stat = (label: string, value: number, show: boolean, tone = "") => (
    <div className={"q-stat " + tone}>
      <b>{show ? <Count value={value} reduced={p.reduced} /> : "—"}</b>
      <span>{label}</span>
    </div>
  );

  return (
    <Flex ref={area} direction="column" gap="2.5" h="full" minH="0" className="quality">
      <Pipeline active={p.node} failed={p.failed} reduced={p.reduced} labels={w >= 520} />
      <Flex gap="2" align="stretch" wrap="wrap">
        <Box className="q-stats">
          {stat("reçues", r.received, true)}
          {stat("validées", r.accepted, ready, "ok")}
          {stat("en quarantaine", r.rejected, ready, "bad")}
          {stat(r.duplicates > 1 ? "doublons" : "doublon", r.duplicates, dupes, "dup")}
        </Box>
        {ready && (
          <motion.div className={"q-alert" + (r.alert ? " on" : "")} role="status" initial={p.reduced ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: p.reduced ? 0 : 0.5 }}>
            <Icon name={r.alert ? "alert" : "info"} size={15} />
            <span>
              Taux de rejet <b>{number(r.rate)} %</b> · {r.rejected} ÷ {r.received - r.duplicates} après dédoublonnage.{" "}
              {r.alert ? "Alerte > 20 % : les contrats valides peuvent être chargés." : `${r.anomalies} anomalie(s) signalée(s).`}
            </span>
          </motion.div>
        )}
      </Flex>
      <Flex align="center" justify="space-between" gap="2">
        <Text fontWeight="semibold" fontSize="sm">
          {ready ? "Une ligne, une décision." : dupes ? "Une copie exacte compte une fois." : "Des lignes à contrôler."}
        </Text>
        <NativeSelect.Root size="xs" w="auto" disabled={!ready}>
          <NativeSelect.Field aria-label="Filtrer les décisions" value={p.filter} onChange={(e) => p.onFilter(e.currentTarget.value)}>
            <option value="all">Toutes les lignes</option>
            <option value="accepted">Validées</option>
            <option value="rejected">Quarantaine</option>
            <option value="duplicate">Doublons</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Flex>
      <Box flex="1" minH="96px" overflow="auto" className="table-scroll quality-table" tabIndex={-1}>
        <table className={"ce-table" + (p.touch ? " touch" : "")}>
          <thead>
            <tr>
              <th>Ligne CSV</th>
              <th>Contrat</th>
              {wide && <th>Ligne</th>}
              <th>Qté</th>
              {wide && <th>Unité</th>}
              {wide && <th>Durée</th>}
              <th>Décision</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, n) => {
              const shown = ready || (dupes && l.decision === "duplicate");
              return (
                <tr key={l.sourceRow} className={(p.row === l.sourceRow ? "on " : "") + (shown ? "d-" + l.decision : "")} onClick={() => p.onRow(l.sourceRow)}>
                  <td>
                    <button type="button" className="row-link" aria-label={`Inspecter la ligne CSV ${l.sourceRow}`} aria-pressed={p.row === l.sourceRow} onClick={(e) => (e.stopPropagation(), p.onRow(l.sourceRow))}>
                      #{l.sourceRow}
                    </button>
                  </td>
                  <td>{l.row.contract_id}</td>
                  {wide && <td>{l.row.line_no}</td>}
                  <td className={l.anomaly && ready ? "warn" : ""}>{l.row.quantity}</td>
                  {wide && <td>{l.row.unit}</td>}
                  {wide && <td>{l.row.duration}</td>}
                  <td>
                    {shown ? (
                      <motion.span
                        key={"d" + p.phase}
                        className={"decision " + l.decision}
                        initial={p.reduced ? false : { opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", stiffness: 420, damping: 22, delay: p.reduced ? 0 : Math.min(n, 18) * 0.035 }}
                      >
                        {decisionLabels[l.decision]}
                        {l.anomaly ? " · anomalie" : ""}
                      </motion.span>
                    ) : (
                      <span className="decision pending">À contrôler</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Box>
    </Flex>
  );
}
