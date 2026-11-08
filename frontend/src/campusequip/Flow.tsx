import { useRef } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Badge, Box, Button, Flex, IconButton, NativeSelect, Text } from "@chakra-ui/react";
import { money, totals, type DB } from "./model";
import { Icon } from "./icons";
import { Count } from "./ui";
import { EASE, useSize } from "./hooks";

export type FlowEntry = { batch: string; added: number; rejected: number; status: string };
const STATIONS = [
  ["Publier le lot", "file"],
  ["Vérifier et contrôler", "shield"],
  ["Préparer la transaction", "database"],
  ["Conserver les écritures", "check"],
] as const;

export interface FlowProps {
  db: DB;
  n: number;
  station: number;
  playing: boolean;
  profile: string;
  history: FlowEntry[];
  onStart: () => void;
  onReset: (profile?: string) => void;
  reduced: boolean;
}

/** « Le flux continu »: three batches arrive one after the other; the same recipe handles each one. */
export function Flow(p: FlowProps) {
  const area = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(area);
  const row = w >= 560;
  // On short stages the second sentence gives way (the badge and the inspector carry the same idea).
  const short = h > 0 && h < 340;
  const side = w >= 760;
  const done = p.n >= 3;
  const state = totals(p.db);

  return (
    <Flex ref={area} direction="column" gap={row ? "3" : "2"} h="full" minH="0" className="flow">
      {/* Narrow stages: the badge wraps beside the profile picker instead of above it. */}
      <Flex align={row ? "flex-start" : "center"} justify="space-between" gap="2" wrap={row ? "wrap" : "nowrap"}>
        <Box minW="0" flex={row ? "1 1 15rem" : "1"}>
          <Badge variant="outline" colorPalette="brand" mb={row ? "1" : "0"} whiteSpace="normal" h="auto" py="0.5">
            3 lots · débit accéléré pour la démonstration
          </Badge>
          {row && !short && (
            <Text fontSize="sm" color="app.muted" lineClamp={2}>
              Les trois lots sont issus du générateur du kit. Le navigateur simule les contrôles et le chargement.
            </Text>
          )}
        </Box>
        <NativeSelect.Root size="xs" w="auto" flexShrink={0}>
          <NativeSelect.Field aria-label="Profil du flux" value={p.profile} onChange={(e) => p.onReset(e.currentTarget.value)}>
            <option value="mixte">Avec défauts de qualité</option>
            <option value="propre">Sans défaut de qualité</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Flex>

      <LayoutGroup>
        <ol className={"lane" + (row ? "" : " c")} aria-label="Les quatre étapes de chaque lot">
          {STATIONS.map(([label, icon], i) => {
            const here = !done && i === p.station;
            return (
              <li key={label} className={"station" + (here ? " on" : "") + (done || i < p.station ? " past" : "")} aria-current={here ? "step" : undefined}>
                <span className="st-icon">
                  <Icon name={icon} size={20} />
                </span>
                <b>{label}</b>
                <small>{done ? "Séquence terminée" : here ? (p.playing ? "En cours" : "En attente") : `Lot ${p.n + 1}`}</small>
                {here && (
                  <motion.span layoutId="ce-flow-token" className="token" transition={p.reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}>
                    {p.profile}-{p.n + 1}
                  </motion.span>
                )}
              </li>
            );
          })}
        </ol>
      </LayoutGroup>

      <Flex align="center" gap="2" wrap="wrap">
        <Button size="sm" colorPalette="brand" onClick={p.onStart} disabled={done} flex={row ? undefined : "1"}>
          <Icon name={p.playing ? "pause" : "play"} size={15} />
          {p.playing ? "Suspendre le flux" : done ? "Trois lots traités" : p.n > 0 || p.station > 0 ? "Reprendre le flux" : "Démarrer le flux"}
        </Button>
        {row ? (
          <Button size="sm" variant="outline" onClick={() => p.onReset()}>
            Nouvelle démonstration
          </Button>
        ) : (
          <IconButton size="sm" variant="outline" aria-label="Nouvelle démonstration" onClick={() => p.onReset()}>
            <Icon name="reset" size={15} />
          </IconButton>
        )}
        {row && (
          <Text fontSize="sm" color="app.muted" role="status">
            {p.n} / 3 lots traités
          </Text>
        )}
      </Flex>

      {/* Side by side, the journal shares the remaining height; stacked (phones), each block keeps its own height. */}
      <Flex direction={side ? "row" : "column"} gap="3" flex={side ? "1" : "none"} minH={side ? "0" : undefined}>
        <Box flex={side ? "1" : "none"} minW="0" minH={side ? "0" : undefined} display="flex" flexDirection="column" gap="1.5">
          <Flex align="baseline" justify="space-between" gap="2">
            <Text fontWeight="semibold" fontSize="sm">
              Le journal de la démonstration
            </Text>
            {!row && (
              <Text fontSize="xs" color="app.muted" role="status" flexShrink={0}>
                {p.n} / 3 lots traités
              </Text>
            )}
          </Flex>
          {!p.history.length ? (
            <Text className="empty-log" fontSize={row ? "sm" : "xs"}>
              Aucun lot traité. Lancez le flux pour observer les arrivées.
            </Text>
          ) : (
            <Box className="table-scroll" tabIndex={0} role="region" aria-label="Historique des lots" overflow="auto" minH="0">
              <table className="ce-table">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Ajoutées</th>
                    <th>Quarantaine</th>
                    <th>Résultat</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {p.history.map((h) => (
                      <motion.tr key={h.batch} initial={p.reduced ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                        <td className="mono">{h.batch}</td>
                        <td>{h.added}</td>
                        <td>{h.rejected}</td>
                        <td>
                          <span className="decision accepted">{h.status}</span>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </Box>
          )}
          {done && (
            <motion.p className="flow-done" role="status" initial={p.reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              <Icon name="check" size={15} /> Trois lots pris en charge sans relancer le traitement entre les lots.
            </motion.p>
          )}
        </Box>
        {side ? (
          <Box className="flow-summary" w="15rem" flexShrink={0}>
            <Text textStyle="overline" fontSize="2xs" letterSpacing="0.12em" color="brand.fg">
              État conservé
            </Text>
            <Text fontFamily="heading" fontWeight="semibold" fontSize="xl">
              <Count value={state.contracts} reduced={p.reduced} /> contrats
            </Text>
            <Text fontSize="sm" color="app.muted">
              <Count value={state.lines} reduced={p.reduced} /> lignes · {state.batches} lot{state.batches > 1 ? "s" : ""} reconnu{state.batches > 1 ? "s" : ""}
            </Text>
            <Text fontWeight="bold">
              <Count value={state.cents} format={money} reduced={p.reduced} />
            </Text>
          </Box>
        ) : (
          // Narrow stages: the same state on one or two lines.
          <Flex className="flow-summary inline" align="baseline" gap="1.5" wrap="wrap" flexShrink={0}>
            <Text as="span" textStyle="overline" fontSize="2xs" letterSpacing="0.12em" color="brand.fg" mr="1">
              État conservé
            </Text>
            <Text as="span" fontWeight="semibold" fontSize="sm">
              <Count value={state.contracts} reduced={p.reduced} /> contrats
            </Text>
            <Text as="span" fontSize="sm" color="app.muted">
              · <Count value={state.lines} reduced={p.reduced} /> lignes · {state.batches} lot{state.batches > 1 ? "s" : ""} reconnu{state.batches > 1 ? "s" : ""} ·
            </Text>
            <Text as="span" fontWeight="bold" fontSize="sm">
              <Count value={state.cents} format={money} reduced={p.reduced} />
            </Text>
          </Flex>
        )}
      </Flex>
    </Flex>
  );
}
