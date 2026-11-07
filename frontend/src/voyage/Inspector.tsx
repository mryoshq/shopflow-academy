import type { ReactNode } from "react";
import { Badge, Box, Button, Code, Flex, HStack, Stack, Switch, Tabs, Text } from "@chakra-ui/react";
import { Icon } from "./icons";
import { BASE, BATCH, columns, contexts, glossary, money, type Scenario, type Task } from "./model";
import { TABS, expected, statusLabels, taskIcons, taskTitles, type Snapshot, type Tab } from "./content";

export interface InspectorProps {
  selected: Task;
  state: Snapshot;
  scenario: Scenario;
  ttl: number;
  fastTime: boolean;
  follow: boolean;
  normalized: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  onFastTime: (v: boolean) => void;
  onRefreshCache: () => void;
  onOpenFile: (i: number) => void;
  onGlossary: (concept: string) => void;
}

const muted = "app.muted";

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Flex justify="space-between" gap="2" py="1.5" borderBottomWidth="1px" borderColor="app.border" fontSize="sm">
      <Text as="span" color={muted}>
        {label}
      </Text>
      <Text as="span" fontWeight="semibold" textAlign="right">
        {children}
      </Text>
    </Flex>
  );
}

function Item({ title, text }: { title: string; text: string }) {
  return (
    <Box mb="2.5">
      <Text fontSize="xs" fontWeight="bold" mb="0.5">
        {title}
      </Text>
      <Text fontSize="sm" color={muted} lineHeight="1.5">
        {text}
      </Text>
    </Box>
  );
}

function Panel({ children, tone = "mist" }: { children: ReactNode; tone?: "mist" | "wash" }) {
  return (
    <Box bg={tone === "mist" ? "app.sunken" : "brand.subtle"} rounded="lg" p="2.5" mb="2.5" fontSize="sm" color="app.ink" lineHeight="1.45">
      {children}
    </Box>
  );
}

const Kicker = ({ children, color = "brand.fg" }: { children: ReactNode; color?: string }) => (
  <Text fontSize="2xs" letterSpacing="0.16em" fontWeight="bold" textTransform="uppercase" color={color}>
    {children}
  </Text>
);

function Triage({ items }: { items: [number, string, string][] }) {
  return (
    <HStack gap="1.5" mb="2.5" align="stretch">
      {items.map(([n, label, bg]) => (
        <Box key={label} flex="1" bg={bg} rounded="md" px="2" py="1.5" fontSize="xs" color="brand.fg">
          <Text fontFamily="heading" fontSize="xl" color="app.ink" lineHeight="1.1">
            {n}
          </Text>
          {label}
        </Box>
      ))}
    </HStack>
  );
}

export function Inspector(p: InspectorProps) {
  const ctx = contexts[p.selected];
  const s = p.state;
  const exp = expected();
  const defs = [
    ctx.concept,
    ...(p.selected === "load_orders"
      ? ["Grain", "Clé métier", "Validation", "Commit", "Rollback", "Idempotence", "Retry"]
      : p.selected === "refresh_cache"
        ? ["TTL"]
        : p.selected === "verify_result"
          ? ["Hypertable", "time_bucket"]
          : ["Pipeline", "DAG"]),
  ];

  return (
    <Flex direction="column" h="full" minH="0">
      <Box px="4" pt="3.5" pb="2">
        <Kicker>À la loupe</Kicker>
        <HStack gap="2.5" mt="2">
          <Flex w="8" h="8" rounded="md" bg="brand.solid" color="brand.contrast" align="center" justify="center" flexShrink={0}>
            <Icon name={taskIcons[p.selected]} size={15} />
          </Flex>
          <Box minW="0" flex="1">
            <Text fontFamily="mono" fontSize="sm" truncate>
              {p.selected}
            </Text>
            <Text fontSize="xs" color={muted} truncate>
              {taskTitles[p.selected]}
            </Text>
          </Box>
          <Badge
            size="sm"
            variant="subtle"
            colorPalette={s.tasks[p.selected] === "error" ? "red" : s.tasks[p.selected] === "retry" ? "orange" : "forest"}
          >
            {statusLabels[s.tasks[p.selected]]}
          </Badge>
        </HStack>
      </Box>

      <Tabs.Root
        value={p.tab}
        onValueChange={(e) => p.onTab(e.value as Tab)}
        variant="line"
        size="sm"
        colorPalette="brand"
        display="flex"
        flexDirection="column"
        flex="1"
        minH="0"
        lazyMount
        unmountOnExit
      >
        <Tabs.List px="2" borderColor="app.border">
          {TABS.map((t) => (
            <Tabs.Trigger key={t} value={t} fontSize="xs" px="2" fontWeight="semibold">
              {t}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="Données" flex="1" minH="0" overflowY="auto" px="4" py="3">
          {p.follow && (
            <Panel>
              <Kicker>Passeport #1001</Kicker>
              <Text mt="1">
                CSV : order_id 1001 · line_no 1 · produit 101 · quantité 2 · 100,00 MAD.
                <br />
                PostgreSQL : {s.committed ? "commande et ligne chargées." : "en attente de chargement."}
                <br />
                MongoDB : état attendu <b>delivered</b>
                {s.events ? " · événements chargés." : " · événements en attente."}
              </Text>
            </Panel>
          )}
          <Item title="Objectif" text={ctx.objective} />
          <Item title="Entrée" text={ctx.input} />

          {p.selected === "load_orders" && (
            <>
              <Panel>
                <Text fontFamily="mono" fontWeight="semibold">
                  lot_octobre.csv
                </Text>
                <Row label="order_id">1001</Row>
                <Row label="status">
                  <Code size="sm">{p.normalized ? "paid" : " PAID "}</Code>
                </Row>
                <Row label="quantity">2</Row>
                <Button size="xs" variant="outline" mt="2" onClick={() => p.onOpenFile(0)}>
                  Voir les {columns.length} colonnes
                </Button>
              </Panel>
              <Triage
                items={[
                  [BATCH.accepted, "acceptées", "green.subtle"],
                  [BATCH.rejected, "rejetées", "red.subtle"],
                  [BATCH.duplicates, "doublon", "app.sunken"],
                ]}
              />
              <Text fontSize="xs" color={muted} mb="2.5" lineHeight="1.5">
                Motifs de rejet : références client/produit, dates, quantités et cohérence. Les motifs exacts ne sont pas dans les sources disponibles ; ils ne sont pas inventés.
              </Text>
            </>
          )}

          {p.selected === "load_events" && (
            <>
              <Triage
                items={[
                  [p.scenario === "replay" ? 0 : BATCH.events.inserted, "insertions", "green.subtle"],
                  [p.scenario === "replay" ? BATCH.events.inserted + BATCH.events.duplicates : BATCH.events.duplicates, "doublons", "app.sunken"],
                  [BATCH.events.rejected, "rejets", "red.subtle"],
                ]}
              />
              <Text fontSize="xs" color={muted} mb="1.5">
                {s.eventCount} événements stockés. Documents exacts indisponibles.
              </Text>
              {[
                ["1001", "delivered"],
                ["1002", "exception"],
                ["1003", "in_transit"],
                ["1005", "exception"],
              ].map(([id, st]) => (
                <Row key={id} label={<Code size="sm">#{id}</Code>}>
                  <Text as="span" color={st === "exception" ? "saffron.fg" : "brand.fg"}>
                    {st}
                  </Text>
                </Row>
              ))}
              <Box h="2.5" />
            </>
          )}

          {p.selected === "refresh_cache" && (
            <Box mb="2.5">
              {BATCH.cache.map((c) => (
                <Row key={c.date} label={c.date}>
                  {s.cache && p.ttl > 0 ? money(c.amount) + " MAD" : "Clé absente"}
                </Row>
              ))}
              <Kicker>
                TTL {s.cache ? p.ttl : BATCH.ttl} s {s.cache && p.ttl === 0 ? "· expiré" : ""}
              </Kicker>
              <Box h="1.5" bg="app.sunken" rounded="full" overflow="hidden" my="2">
                <Box h="full" bg="brand.fg" transition="width 0.3s linear" style={{ width: ((s.cache ? p.ttl : BATCH.ttl) / BATCH.ttl) * 100 + "%" }} />
              </Box>
              <Switch.Root size="sm" colorPalette="brand" checked={p.fastTime} onCheckedChange={(e) => p.onFastTime(!!e.checked)}>
                <Switch.HiddenInput />
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Switch.Label fontSize="sm">Accélérer le temps ×10</Switch.Label>
              </Switch.Root>
              <Button size="xs" variant="outline" mt="2" display="block" disabled={!s.cache} onClick={p.onRefreshCache}>
                Rafraîchir le cache
              </Button>
            </Box>
          )}

          {p.selected === "rebuild_queue" && (
            <Panel>
              <Kicker>File des exceptions</Kicker>
              <Text mt="1" fontFamily="mono">
                {s.queue ? `[${BATCH.queue.join(" → ")}]` : "En attente"}
              </Text>
              <Text>Ordre conservé. Espace distinct du cache et du moteur Airflow.</Text>
            </Panel>
          )}

          {p.selected === "verify_result" && (
            <Box mb="2.5">
              {(
                [
                  ["Commandes", s.orders, exp.orders],
                  ["Lignes", s.lines, exp.lines],
                  ["CA", money(s.revenue), money(exp.revenue)],
                  ["Événements", s.eventCount, exp.events],
                  ["File", s.queue ? exp.queue : "En attente", exp.queue],
                ] as [string, string | number, string | number][]
              ).map(([label, cur, exp]) => (
                <Row key={label} label={label}>
                  {cur}{" "}
                  <Text as="span" color={muted} fontWeight="medium">
                    / {exp}
                  </Text>
                </Row>
              ))}
            </Box>
          )}

          <Item title="Transformation" text={ctx.transformation} />
          <Item title="Sortie" text={ctx.output} />
          <Item title="Contrôle" text={ctx.control} />
          <Panel tone="wash">
            <Kicker>{ctx.concept}</Kicker>
            <Text mt="1">{glossary[ctx.concept]}</Text>
            <Button size="xs" variant="outline" mt="2" onClick={() => p.onGlossary(ctx.concept)}>
              Voir dans le glossaire
            </Button>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Avant / après" flex="1" minH="0" overflowY="auto" px="4" py="3">
          <Text fontFamily="heading" fontSize="lg" fontWeight="semibold" mb="2">
            Voir ce qui change.
          </Text>
          {p.selected === "load_orders" ? (
            <>
              <Panel>
                <Kicker>Normalisation</Kicker>
                <Text mt="1">
                  « PAID » → <b>paid</b>
                  <br />« 10,00 » → 10.00 · « 100,00 » → 100.00
                </Text>
              </Panel>
              <Row label="Commandes">{BASE.orders} → {s.orders}</Row>
              <Row label="Lignes">{BASE.lines} → {s.lines}</Row>
              <Row label="CA">
                {money(BASE.revenue)} → {money(s.revenue)}
              </Row>
              <Text fontSize="xs" color={muted} mt="2.5" lineHeight="1.5">
                Le CA exclut les frais de livraison et les commandes pending ou cancelled. Ce n’est pas une preuve d’encaissement.
              </Text>
            </>
          ) : (
            <>
              <Item title="Transformation" text={ctx.transformation} />
              <Row label="Maintenant">
                {p.selected === "load_events"
                  ? s.eventCount + " événements"
                  : p.selected === "refresh_cache"
                    ? s.cache && p.ttl > 0
                      ? p.ttl + " s de TTL"
                      : "Clé absente"
                    : p.selected === "rebuild_queue"
                      ? s.queue
                        ? `[${BATCH.queue.join(", ")}]`
                        : "En attente"
                      : statusLabels[s.tasks[p.selected]]}
              </Row>
            </>
          )}
        </Tabs.Content>

        <Tabs.Content value="Définitions" flex="1" minH="0" overflowY="auto" px="4" py="2">
          {defs.map((k) => (
            <Box key={k} py="2" borderBottomWidth="1px" borderColor="app.border">
              <Text fontSize="sm" fontWeight="bold" color="brand.fg">
                {k}
              </Text>
              <Text fontSize="sm" color={muted} lineHeight="1.5">
                {glossary[k]}
              </Text>
            </Box>
          ))}
        </Tabs.Content>

        <Tabs.Content value="Journal" flex="1" minH="0" overflowY="auto" px="4" py="3">
          <Kicker>monitoring.task_attempts</Kicker>
          <Text fontSize="xs" color={muted} mt="1" mb="2">
            Durées illustratives, sans horodatage réel.
          </Text>
          {s.logs.length === 0 ? (
            <Text fontSize="sm">Lancez la lecture pour voir les tentatives.</Text>
          ) : (
            <Stack gap="0">
              {s.logs.map((l, i) => (
                <Box key={i} py="2" borderBottomWidth="1px" borderColor="app.border">
                  <Text fontFamily="mono" fontSize="xs" color={l.status === "error" ? "red.fg" : "brand.fg"}>
                    {l.task}
                  </Text>
                  <Text fontSize="xs" color={muted} lineHeight="1.5">
                    {statusLabels[l.status]} · tentative {l.attempt} · {l.duration.toFixed(1)} s
                  </Text>
                </Box>
              ))}
            </Stack>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </Flex>
  );
}
