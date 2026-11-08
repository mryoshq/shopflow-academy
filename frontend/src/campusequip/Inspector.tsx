import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Box, Button, Code, Flex, Input, NativeSelect, SegmentGroup, Stack, Tabs, Text } from "@chakra-ui/react";
import { columnInfo, columns, money, refs, type Line } from "./model";
import { chapters, decisionLabels, questions, rules, type State, type Tab } from "./content";
import { Icon } from "./icons";
import { EASE } from "./hooks";

function Note({ title, children, tone }: { title: string; children: ReactNode; tone?: "bad" | "warn" }) {
  return (
    <Box className={"rule-note" + (tone ? " " + tone : "")}>
      <Text fontWeight="bold" fontSize="sm">
        {title}
      </Text>
      <Text fontSize="sm">{children}</Text>
    </Box>
  );
}

/** The owner's calculator: one line of a contract, quantity × duration × rate, in cents. */
function Calculator({ campus }: { campus: number }) {
  const [unit, setUnit] = useState("hour");
  const [qty, setQty] = useState(2);
  const [duration, setDuration] = useState(3);
  const [rate, setRate] = useState(25);
  const [second, setSecond] = useState(false);
  const [desk, setDesk] = useState(0);
  const valid =
    Number.isInteger(qty) && qty >= 1 && qty <= 100 && Number.isInteger(duration) && duration >= 1 && duration <= (unit === "hour" ? 720 : 365) && rate >= 0 && Number.isFinite(rate) && Math.abs(rate * 100 - Math.round(rate * 100)) < 1e-7 && Number.isSafeInteger(qty * duration * Math.round(rate * 100) + 40000);
  const result = valid ? qty * duration * Math.round(rate * 100) : 0;
  function change(u: string) {
    setUnit(u);
    setQty(u === "hour" ? 2 : 1);
    setDuration(u === "hour" ? 3 : 2);
    setRate(u === "hour" ? 25 : 200);
    setSecond(false);
  }
  const name = refs.campuses[campus - 1].name.replace("Campus ", "");
  const field = (label: string, aria: string, value: number, set: (n: number) => void, max?: number, step = "1") => (
    <label className="calc-field">
      <span>{label}</span>
      <Input size="sm" aria-label={aria} type="number" min={aria === "Tarif par unité" ? 0 : 1} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
    </label>
  );
  return (
    <Stack gap="3">
      <label className="calc-field">
        <span>Point de départ</span>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field aria-label="Guichet de départ" value={desk} onChange={(e) => setDesk(Number(e.currentTarget.value))}>
            {[0, 1].map((n) => (
              <option key={n} value={n}>
                {name} · guichet {(campus - 1) * 2 + n + 1}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </label>
      <SegmentGroup.Root size="sm" value={unit} onValueChange={(e) => e.value && change(e.value)} aria-label="Unité de location">
        {[
          ["hour", "À l’heure"],
          ["day", "À la journée"],
        ].map(([v, l]) => (
          <SegmentGroup.Item key={v} value={v} flex="1" justifyContent="center" _checked={{ bg: "brand.solid", color: "brand.contrast" }}>
            <SegmentGroup.ItemText>{l}</SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        ))}
      </SegmentGroup.Root>
      <Flex gap="1.5" align="flex-end" className="calc-row">
        {field("Quantité", "Quantité", qty, setQty, 100)}
        <span className="times">×</span>
        {field(unit === "hour" ? "Heures" : "Jours", "Durée", duration, setDuration, unit === "hour" ? 720 : 365)}
        <span className="times">×</span>
        {field("MAD / unité", "Tarif par unité", rate, setRate, undefined, "0.01")}
      </Flex>
      <Box className="calc-total">
        <Text textStyle="overline" fontSize="2xs" letterSpacing="0.12em">
          Montant de la ligne
        </Text>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.strong key={valid ? result : "x"} data-testid="calculation" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {valid ? money(result) : "Valeur invalide"}
          </motion.strong>
        </AnimatePresence>
        <Text fontSize="xs">Rattaché au 2 novembre · statut payé</Text>
      </Box>
      {!valid && (
        <Text className="form-error" role="alert" fontSize="sm">
          Respectez les bornes de quantité et de durée, et un tarif à deux décimales maximum.
        </Text>
      )}
      {qty > 20 && valid && <Note title="Quantité inhabituelle" tone="warn">Signalement, sans rejet.</Note>}
      <Text fontSize="sm" color="app.muted">
        Le tarif est déjà exprimé par {unit === "hour" ? "heure" : "jour"}. Aucune conversion n’est nécessaire.
      </Text>
      {unit === "hour" && (
        <>
          <Button size="xs" variant="ghost" colorPalette="brand" alignSelf="flex-start" onClick={() => setSecond((v) => !v)} aria-expanded={second}>
            {second ? "Masquer" : "Ajouter"} la deuxième ligne du sujet <Icon name="arrow" size={13} />
          </Button>
          {second && (
            <Flex className="second-line" justify="space-between" gap="2" wrap="wrap">
              <span>1 exemplaire × 2 jours × 200 MAD</span>
              <b>{valid ? money(result + 40000) : "—"} pour le contrat</b>
            </Flex>
          )}
        </>
      )}
      <Text fontSize="xs" color="app.muted">
        Exemple pédagogique du PDF, page 5. Les réglages sont exploratoires ; ils ne modifient pas les lots.
      </Text>
    </Stack>
  );
}

function LineDetail({ line, structure, ready }: { line: Line | undefined; structure: boolean; ready: boolean }) {
  if (structure || !line) return <Text fontSize="sm">La structure du lot est invalide. Aucune décision métier par ligne n’est calculée.</Text>;
  return (
    <Stack gap="3">
      <span className={"decision " + (ready ? line.decision : "pending")}>
        {ready ? decisionLabels[line.decision] : "À contrôler"} · ligne CSV {line.sourceRow}
      </span>
      <dl className="line-fields">
        {columns.map((c) => (
          <div key={c}>
            <dt>{c}</dt>
            <dd>{line.raw[c]}</dd>
          </div>
        ))}
      </dl>
      {ready && (
        <Note title={line.anomaly ? "Anomalie conservée" : line.decision === "accepted" ? "La ligne est valide" : "Pourquoi cette décision ?"} tone={line.decision === "rejected" ? "bad" : line.anomaly ? "warn" : undefined}>
          {line.reasons.join(" ") || (line.anomaly ? "quantity dépasse 20, mais reste dans [1,100]. Le contrat est valide." : "Les contrôles de ligne et la cohérence du contrat sont satisfaits.")}
        </Note>
      )}
    </Stack>
  );
}

export interface InspectorProps {
  scene: number;
  state: State;
  campus: number;
  line: Line | undefined;
  ready: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  answer: number | null;
  onAnswer: (n: number) => void;
  onSources: () => void;
}

/** « Comprendre le détail »: the detail of the current step, its rules, and a question. */
export function Inspector(p: InspectorProps) {
  const c = chapters[p.scene];
  const q = questions[p.scene];
  const s = p.state;
  const detail =
    p.scene === 0 ? (
      <Calculator campus={p.campus} />
    ) : p.scene === 1 ? (
      <Stack gap="3">
        <Text fontWeight="semibold">Une ligne n’est pas un contrat.</Text>
        <Text fontSize="sm" color="app.muted">
          Le CSV contient {s.batch.rows.length} lignes pour {new Set(s.batch.rows.map((r) => r.contract_id)).size} contrats sources. Plusieurs lignes peuvent partager contract_id.
        </Text>
        <Flex className="key-visual" align="center" justify="center" gap="2">
          <Code>contract_id</Code>
          <span>+</span>
          <Code>line_no</Code>
        </Flex>
        <Text fontSize="sm" color="app.muted">
          Ensemble, ces deux colonnes identifient une ligne.
        </Text>
        <Note title="READY ne valide pas les données.">Il signale que les fichiers peuvent être lus. Les contrôles de qualité viennent ensuite.</Note>
        <details className="column-guide">
          <summary>Comprendre les 11 colonnes</summary>
          {columns.map((col) => (
            <div key={col}>
              <code>{col}</code>
              <p>{columnInfo[col]}</p>
            </div>
          ))}
        </details>
      </Stack>
    ) : p.scene === 2 ? (
      <LineDetail line={p.line} structure={s.report.structure} ready={p.ready} />
    ) : p.scene === 3 ? (
      <Stack gap="3">
        <Text fontWeight="semibold">Ce que la base conserve</Text>
        <dl className="definition-list">
          <dt>Contrats</dt>
          <dd>{s.contracts}</dd>
          <dt>Lignes</dt>
          <dd>{s.lines}</dd>
          <dt>Lots reconnus</dt>
          <dd>{s.batches}</dd>
          <dt>Ajout de cette tentative</dt>
          <dd>{s.added}</dd>
        </dl>
        <Text fontSize="sm" color="app.muted">
          Un rapport de validation peut compter des lignes valides alors que la tentative n’ajoute rien en base.
        </Text>
        <Note title="Deux fichiers + une version de règles">La signature du lot ne dépend pas seulement du nom du dossier.</Note>
      </Stack>
    ) : p.scene === 4 ? (
      <Stack gap="3">
        <Text fontWeight="semibold">Trois questions, trois lectures</Text>
        <Text fontSize="sm" color="app.muted">
          Quel montant est retenu chaque jour ? Quels équipements contribuent le plus ? Quelle part revient à chaque unité ?
        </Text>
        <Note title="Un jour sans montant vaut zéro.">Le calendrier va du 1er au 21 novembre. Le cumul conserve le montant des jours précédents.</Note>
        <Text fontSize="sm" color="app.muted">
          Un équipement est un type de matériel. La quantité représente le nombre d’exemplaires loués.
        </Text>
      </Stack>
    ) : p.scene === 5 ? (
      <Stack gap="3">
        <Text fontSize="sm">Le script tourne jusqu’à Ctrl+C. Cette animation s’arrête après trois lots pour faciliter l’observation.</Text>
        <Code display="block" whiteSpace="pre-wrap" p="2" fontSize="xs">
          python generer.py --sortie flux --contrats 1000 --intervalle 10
        </Code>
        <Code display="block" whiteSpace="pre-wrap" p="2" fontSize="xs">
          python surveiller.py --entree flux
        </Code>
        <Text fontSize="sm" color="app.muted">
          Le traitement étudiant doit d’abord être complété et connecté à une base dédiée. Un volume plus faible est autorisé. Les fichiers sont conservés : arrêtez le générateur après la démonstration.
        </Text>
      </Stack>
    ) : (
      <Stack gap="3">
        <dl className="definition-list">
          <dt>Remise</dt>
          <dd>21 novembre 2026</dd>
          <dt>Travail</dt>
          <dd>En binôme</dd>
          <dt>Socle</dt>
          <dd>10 points</dd>
          <dt>Bonus</dt>
          <dd>jusqu’à 5 points</dd>
        </dl>
        <Text fontSize="sm" color="app.muted">
          Cadre global des quatre axes : 20 + 10 bonus.
        </Text>
        <Button size="sm" variant="outline" alignSelf="flex-start" onClick={p.onSources}>
          <Icon name="file" size={14} /> Sources et sujet
        </Button>
      </Stack>
    );

  return (
    <Flex direction="column" h="full" minH="0" className="inspector">
      <Box px="4" pt="3.5" pb="2" flexShrink={0}>
        <Text textStyle="overline" fontSize="2xs" letterSpacing="0.12em" color="brand.fg">
          Comprendre le détail
        </Text>
        <Text as="h2" fontFamily="heading" fontWeight="semibold" fontSize="lg" lineHeight="1.25" letterSpacing="-0.01em">
          {p.scene === 2 ? `Contrat ${p.line?.row.contract_id ?? "—"}` : c.detail}
        </Text>
      </Box>
      <Tabs.Root value={p.tab} onValueChange={(e) => p.onTab(e.value as Tab)} variant="line" size="sm" colorPalette="brand" display="flex" flexDirection="column" flex="1" minH="0">
        <Tabs.List px="2" flexShrink={0}>
          <Tabs.Trigger value="detail">{p.scene === 0 ? "Calcul" : "Détail"}</Tabs.Trigger>
          <Tabs.Trigger value="rules">Les règles</Tabs.Trigger>
          <Tabs.Trigger value="question">À vous</Tabs.Trigger>
        </Tabs.List>
        <Box flex="1" minH="0" overflowY="auto" px="4" py="3" className="inspector-body">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={p.tab + p.scene} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: EASE }}>
              <Tabs.Content value="detail" p="0">
                {detail}
              </Tabs.Content>
              <Tabs.Content value="rules" p="0">
                <Stack gap="3">
                  {rules[p.scene].map(([a, b]) => (
                    <Box key={a} className="rule-entry">
                      <Text fontWeight="bold" fontSize="sm">
                        {a}
                      </Text>
                      <Text fontSize="sm" color="app.muted">
                        {b}
                      </Text>
                    </Box>
                  ))}
                </Stack>
              </Tabs.Content>
              <Tabs.Content value="question" p="0">
                <Stack gap="3">
                  <Text textStyle="overline" fontSize="2xs" letterSpacing="0.12em" color="brand.fg">
                    À vous de jouer
                  </Text>
                  <Text fontWeight="semibold">{q.q}</Text>
                  <Stack gap="2">
                    {q.answers.map((a, n) => {
                      const picked = p.answer === n;
                      return (
                        <button key={a} type="button" className={"answer" + (picked ? (n === q.correct ? " correct" : " incorrect") : "")} aria-pressed={picked} onClick={() => p.onAnswer(n)}>
                          <span className="letter">{String.fromCharCode(65 + n)}</span>
                          <span>{a}</span>
                          {picked && <Icon name={n === q.correct ? "check" : "reset"} size={15} />}
                        </button>
                      );
                    })}
                  </Stack>
                  {p.answer !== null && (
                    <motion.p className="answer-why" role="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                      <b>{p.answer === q.correct ? "Exact." : "Essayez de suivre la règle."}</b> {q.why}
                    </motion.p>
                  )}
                </Stack>
              </Tabs.Content>
            </motion.div>
          </AnimatePresence>
        </Box>
      </Tabs.Root>
      <Flex align="center" gap="1.5" px="4" py="2.5" borderTopWidth="1px" borderColor="app.border" fontSize="xs" color="app.muted" flexShrink={0}>
        <Icon name="book" size={13} /> Sujet corrigé · pages {c.pages}
      </Flex>
    </Flex>
  );
}
