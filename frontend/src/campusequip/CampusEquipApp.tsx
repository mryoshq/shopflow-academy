import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Badge, Box, Button, CloseButton, Drawer, Flex, HStack, Heading, IconButton, NativeSelect, Portal, SegmentGroup, Text, VisuallyHidden } from "@chakra-ui/react";
import { batches, commit, emptyDB, money, analyze, scenarios, snapshot, totals, type DB, type Scenario } from "./model";
import { FLOW_MS, STEP_MS, chapters, failed, modified, pad, scenarioOf, scenarioOrigin, scenarioShort, timeline, type Modal, type Tab } from "./content";
import { Icon } from "./icons";
import { Count, Kicker, Tip } from "./ui";
import { EASE, useAcademyReducedMotion, useFrameBox, useMedia } from "./hooks";
import { Territory } from "./Territory";
import { Sources } from "./Sources";
import { Quality } from "./Quality";
import { Transaction } from "./Transaction";
import { Indicators } from "./Indicators";
import { Flow, type FlowEntry } from "./Flow";
import { Future } from "./Future";
import { Inspector } from "./Inspector";
import { Player } from "./Player";
import { Dialogs } from "./Dialogs";

const clampStep = (n: number) => Math.min(7, Math.max(1, Math.round(n) || 1));

/**
 * « Le voyage d'une location », the CampusEquip experience of the final project (ADR-0044).
 * It fills the space its host leaves (below the header, beside the sidebar) without page scroll, follows the
 * Academy theme with its own green accent (light, dark, Catppuccin), keeps its dialogs inside itself
 * (presentation mode), and reports the current step so the address follows it (#/campusequip/<1-7>), both ways.
 */
export default function CampusEquipApp({ initialStep = 1, onStep }: { initialStep?: number; onStep?: (step: number) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const box = useFrameBox(rootRef);
  const touch = useMedia("(max-width: 47.99em), (pointer: coarse)");
  const systemReduced = useAcademyReducedMotion();
  const [reducedChoice, setReducedChoice] = useState<boolean | null>(null);
  const reduced = reducedChoice ?? systemReduced;
  const w = box.w;
  const tier = { sm: w >= 480, md: w >= 768, lg: w >= 1024, xl: w >= 1180, xxl: w >= 1440, wideHeader: w >= 1280, oneRow: w >= 980 };
  // Phone browsers leave little height once their bars and the Academy header are drawn: the header keeps
  // only the steps, and the stage toolbar and the figures move into the player menu.
  const compact = touch && !tier.md && box.h < 700;
  // Seven 44 px step buttons need about 324 px (a teacher page on a small phone has less).
  const stepsFit = !touch || w - (tier.md ? 32 : 16) >= chapters.length * 44;
  const inlineInspector = tier.xl;

  const [scenario, setScenario] = useState<Scenario>("normal");
  const steps = useMemo(() => timeline(scenario), [scenario]);
  const [index, setIndex] = useState(() => Math.max(0, timeline("normal").findIndex((s) => s.scene === clampStep(initialStep) - 1)));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [campus, setCampus] = useState(1);
  const [row, setRow] = useState(2);
  const [filter, setFilter] = useState("all");
  const [file, setFile] = useState("locations.csv");
  const [tab, setTab] = useState<Tab>("detail");
  const [answer, setAnswer] = useState<number | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  // Rafi, the floating assistant of the student pages, sits over the bottom-right corner.
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    setDocked(!!document.querySelector('[data-testid="rafi"]'));
  }, []);
  const [fullError, setFullError] = useState("");
  // The continuous flow (step 6): three batches of one profile, one station at a time.
  const [flowDB, setFlowDB] = useState<DB>(emptyDB);
  const [flowN, setFlowN] = useState(0);
  const [station, setStation] = useState(0);
  const [flowPlaying, setFlowPlaying] = useState(false);
  const [profile, setProfile] = useState("mixte");
  const [history, setHistory] = useState<FlowEntry[]>([]);

  const i = Math.min(index, steps.length - 1);
  const step = steps[i];
  const scene = step.scene;
  const state = useMemo(() => snapshot(scenario, step.at), [scenario, step.at]);
  const blocked = !!step.action;
  const endOfPlay = !steps[i + 1] || !!steps[i + 1].explore;
  const firstOfScene = steps.findIndex((s) => s.scene === scene);
  const inScene = steps.filter((s) => s.scene === scene).length;
  const phase = scene === 2 ? i - firstOfScene : 2;
  const line = state.report.lines.find((l) => l.sourceRow === row) ?? state.report.lines[0];
  const bad = failed(state.status) && scene >= 2 && scene <= 3;
  const dwell = STEP_MS / speed;

  // Autoplay: one step after the other, stopping before the exploration steps and at an action.
  useEffect(() => {
    if (!playing) return;
    if (blocked || endOfPlay) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((n) => n + 1), dwell);
    return () => clearTimeout(t);
  }, [playing, i, dwell, blocked, endOfPlay]);

  useEffect(() => setAnswer(null), [scene]);

  useEffect(() => {
    if (!flowPlaying || scene !== 5) return;
    if (flowN >= 3) {
      setFlowPlaying(false);
      return;
    }
    const t = setTimeout(() => {
      if (station < 3) setStation((s) => s + 1);
      else {
        const batch = batches[`${profile}-${flowN + 1}`];
        const result = commit(flowDB, batch);
        setFlowDB(result.db);
        setHistory((h) => [...h, { batch: batch.id, added: result.added, rejected: analyze(batch).rejected, status: result.status }]);
        setFlowN((n) => n + 1);
        setStation(0);
      }
    }, FLOW_MS / speed);
    return () => clearTimeout(t);
  }, [flowPlaying, flowN, station, flowDB, profile, scene, speed]);

  function go(n: number) {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(n, steps.length - 1)));
  }
  function jump(chapter: number) {
    setFlowPlaying(false);
    go(steps.findIndex((s) => s.scene === chapter));
  }
  /** Another scenario keeps the current step; each scenario starts from its own initial state. */
  function choose(s: Scenario) {
    setScenario(s);
    setPlaying(false);
    setFilter("all");
    setRow(2);
    setIndex(Math.max(0, timeline(s).findIndex((x) => x.scene === scene)));
  }
  function restart() {
    setPlaying(false);
    setFlowPlaying(false);
    setFilter("all");
    setRow(2);
    setIndex(0);
  }
  function togglePlay() {
    if (step.explore) return;
    if (!playing && endOfPlay) {
      setIndex(0);
      setPlaying(true);
      return;
    }
    setPlaying((v) => !v);
  }
  function flowReset(p = profile) {
    setFlowPlaying(false);
    setFlowDB(emptyDB());
    setFlowN(0);
    setStation(0);
    setHistory([]);
    setProfile(p);
  }
  function open(m: Exclude<Modal, null>) {
    setPlaying(false);
    setFlowPlaying(false);
    setDrawer(false);
    setModal(m);
  }
  // Presentation mode: the experience alone goes full screen (its dialogs render inside it).
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
      setFullError("");
    } catch {
      setFullError("Utilisez le mode plein écran de votre navigateur.");
    }
  }

  // The address follows the step, and a new address (back button, lesson link) opens its step.
  const reported = useRef(clampStep(initialStep));
  useEffect(() => {
    const wanted = clampStep(initialStep);
    if (wanted === reported.current) return;
    reported.current = wanted;
    jump(wanted - 1);
    // only a new address should move the step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStep]);
  // The host may pass a new callback on every render (an inline arrow): only a step change reports.
  const onStepRef = useRef(onStep);
  useEffect(() => {
    onStepRef.current = onStep;
  });
  useEffect(() => {
    const n = scene + 1;
    if (n === reported.current) return;
    reported.current = n;
    onStepRef.current?.(n);
  }, [scene]);

  // Keyboard: arrows move, Space plays, when the focus is not on a control.
  const keys = useRef({ next: () => {}, prev: () => {}, play: () => {} });
  keys.current = { next: () => !blocked && go(i + 1), prev: () => go(i - 1), play: togglePlay };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      const root = rootRef.current;
      if (!root || !el || (el !== document.body && !root.contains(el))) return;
      if (el.closest("input, select, textarea, button, a, summary, [role=tab], [role=dialog], [role=menu], [contenteditable=true], .table-scroll")) return;
      if (e.key === "ArrowRight") keys.current.next();
      else if (e.key === "ArrowLeft") keys.current.prev();
      else if (e.key === " ") keys.current.play();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const c = chapters[scene];
  const displayDB = scene === 5 ? flowDB : state.db;
  const stats = totals(displayDB);
  const added = scene === 5 ? (history.at(-1)?.added ?? 0) : state.added;
  const scenarioLabel = scenarioOf(scenario).label;

  const inspector = (
    <Inspector
      scene={scene}
      state={state}
      campus={campus}
      line={line}
      ready={phase >= 2}
      tab={tab}
      onTab={setTab}
      answer={answer}
      onAnswer={setAnswer}
      onSources={() => open("sources")}
    />
  );

  const brand = (
    <Button variant="plain" px="1" gap="2" onClick={restart} aria-label="CampusEquip, revenir au début du scénario" flexShrink={0} color="app.ink">
      <Flex w="8" h="8" rounded="lg" bg="brand.solid" color="brand.contrast" align="center" justify="center">
        <Icon name="layers" size={17} />
      </Flex>
      {tier.md && (
        <Text as="span" fontFamily="heading" fontWeight="semibold" fontSize="lg" letterSpacing="-0.03em">
          Campus
          <Text as="span" color="brand.fg">
            Equip
          </Text>
          .
        </Text>
      )}
    </Button>
  );
  const title = (
    <Heading as="h1" fontFamily="heading" fontWeight="medium" fontSize={tier.md ? "md" : "sm"} color="app.muted" whiteSpace="nowrap" truncate minW="0" flexShrink={tier.oneRow ? 0 : 1}>
      Le voyage d’une location.
    </Heading>
  );
  const stepsNav = !stepsFit ? (
    <nav className="steps stacked" aria-label="Étapes du voyage">
      <NativeSelect.Root size="sm" flex="1">
        <NativeSelect.Field aria-label="Étape" value={scene} onChange={(e) => jump(Number(e.currentTarget.value))}>
          {chapters.map((s, n) => (
            <option key={s.title} value={n}>
              {pad(n + 1)} · {s.title}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </nav>
  ) : (
    <nav className={"steps" + (tier.oneRow ? "" : " stacked") + (touch ? " touch" : "")} aria-label="Étapes du voyage">
      {chapters.map((s, n) => {
        const now = scene === n;
        const done = scene > n;
        const label = now && tier.xl;
        return (
          <Fragment key={s.title}>
            {n > 0 && <span className={"step-link" + (scene >= n ? " on" : "")} />}
            <Tip label={`${pad(n + 1)} · ${s.title} — ${s.sub}`} container={rootRef}>
              <button type="button" className={"step" + (now ? " now" : done ? " done" : "") + (label ? " with-label" : "") + (n >= 5 ? " explore" : "")} onClick={() => jump(n)} aria-current={now ? "step" : undefined}>
                <span className="n" aria-hidden="true">
                  {done ? <Icon name="check" size={11} /> : n + 1}
                </span>
                {label ? (
                  <motion.span className="lbl" initial={{ opacity: 0, maxWidth: 0 }} animate={{ opacity: 1, maxWidth: 220 }} transition={{ duration: 0.35 }}>
                    <VisuallyHidden>{pad(n + 1)} </VisuallyHidden>
                    {s.title}
                  </motion.span>
                ) : (
                  <VisuallyHidden>
                    {pad(n + 1)} {s.title}
                  </VisuallyHidden>
                )}
              </button>
            </Tip>
          </Fragment>
        );
      })}
    </nav>
  );
  const actions = (
    <HStack gap="1.5" flexShrink={0}>
      {tier.wideHeader ? (
        <>
          <Button size="sm" variant="outline" rounded="full" onClick={() => open("glossary")}>
            <Icon name="book" size={15} /> Glossaire
          </Button>
          <Button size="sm" variant="outline" rounded="full" onClick={() => open("sources")}>
            <Icon name="file" size={15} /> Sources et sujet
          </Button>
        </>
      ) : (
        <>
          <IconButton size="sm" variant="outline" aria-label="Glossaire" onClick={() => open("glossary")}>
            <Icon name="book" size={15} />
          </IconButton>
          <IconButton size="sm" variant="outline" aria-label="Sources et sujet" onClick={() => open("sources")}>
            <Icon name="file" size={15} />
          </IconButton>
        </>
      )}
    </HStack>
  );

  const scenarioControl =
    scene > 4 ? null : tier.xxl ? (
      <SegmentGroup.Root size="xs" value={scenario} onValueChange={(e) => e.value && choose(e.value as Scenario)} aria-label="Scénario">
        {scenarios.map((s) => (
          <SegmentGroup.Item key={s.id} value={s.id} _checked={{ bg: "brand.solid", color: "brand.contrast" }}>
            <SegmentGroup.ItemText>{scenarioShort[s.id]}</SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        ))}
      </SegmentGroup.Root>
    ) : (
      <NativeSelect.Root size="xs" w={tier.sm ? "13rem" : "auto"} flex={tier.sm ? "none" : "1"} minW="0">
        <NativeSelect.Field aria-label="Scénario" value={scenario} onChange={(e) => choose(e.currentTarget.value as Scenario)}>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    );

  const stage =
    scene === 0 ? (
      <Territory campus={campus} onCampus={setCampus} reduced={reduced} touch={touch} speed={speed} />
    ) : scene === 1 ? (
      <Sources batch={state.batch} file={file} onFile={setFile} reduced={reduced} touch={touch} />
    ) : scene === 2 ? (
      <Quality report={state.report} phase={phase} node={step.node} failed={state.report.structure} filter={filter} onFilter={setFilter} row={row} onRow={setRow} reduced={reduced} touch={touch} />
    ) : scene === 3 ? (
      <Transaction state={state} scenario={scenario} at={step.at} action={step.action} onAction={() => go(i + 1)} reduced={reduced} />
    ) : scene === 4 ? (
      <Indicators db={state.db} campus={campus} onCampus={setCampus} reduced={reduced} touch={touch} />
    ) : scene === 5 ? (
      <Flow db={flowDB} n={flowN} station={station} playing={flowPlaying} profile={profile} history={history} onStart={() => setFlowPlaying((v) => !v)} onReset={flowReset} reduced={reduced} />
    ) : (
      <Future reduced={reduced} touch={touch} />
    );

  const metrics = [
    { label: "Campus connectés", short: "Campus", value: 6, detail: "12 guichets de location", format: (n: number) => pad(n) },
    { label: "Contrats en base", short: "Contrats", value: stats.contracts, detail: `${stats.lines} lignes conservées`, id: "contracts" },
    { label: "Lignes ajoutées", short: "Ajoutées", value: added, detail: "Pendant cette tentative", id: "added" },
    { label: "Montant retenu", short: "Montant", value: stats.cents, detail: "paid + closed · date de début", format: money, id: "money" },
  ];
  const shown = tier.sm ? metrics : metrics.slice(1);

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <div ref={rootRef} className="campusequip-frame" style={{ height: box.h }} data-reduced={reduced ? "" : undefined} data-touch={touch ? "" : undefined}>
        <Box className={"app" + (reduced ? " reduced" : "")} h="full">
          <a
            href="#ce-stage"
            className="skip-link"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("ce-stage")?.focus();
            }}
          >
            Aller à l’expérience
          </a>
          <Flex direction="column" h="full" minH="0">
            {/* Header: brand, title, the 7 steps, reference dialogs (one row, or two on narrow widths). */}
            <Box as="header" className="ce-header" flexShrink={0} px={tier.md ? "4" : "2"} borderBottomWidth="1px" borderColor="app.border" bg="app.surface">
              {compact ? (
                <Flex align="center" py="1">
                  <VisuallyHidden asChild>{title}</VisuallyHidden>
                  {stepsNav}
                </Flex>
              ) : tier.oneRow ? (
                <Flex align="center" gap="3" h="14">
                  {brand}
                  {title}
                  {stepsNav}
                  {actions}
                </Flex>
              ) : (
                <>
                  <Flex align="center" gap="2" minH="12" py="1">
                    {brand}
                    {title}
                    <Box flex="1" />
                    {actions}
                  </Flex>
                  <Flex pb="1.5">{stepsNav}</Flex>
                </>
              )}
            </Box>

            <Flex flex="1" minH="0" gap="3" p={tier.md ? "3" : "2"}>
              <Flex direction="column" flex="1" minW="0" minH="0" gap={tier.md ? "2.5" : "2"}>
                {/* Narration: fixed height, so the stage never jumps between steps. */}
                <Flex gap={tier.md ? "4" : "2.5"} align="flex-start" h={compact ? "62px" : tier.md ? "84px" : "92px"} flexShrink={0} px="1">
                  <Box textAlign="center" flexShrink={0} pt="0.5" aria-hidden="true">
                    <Text fontFamily="heading" fontSize={compact ? "xl" : tier.md ? "4xl" : "2xl"} color={bad ? "red.fg" : "brand.fg"} lineHeight="1" fontWeight="semibold">
                      {pad(scene + 1)}
                    </Text>
                    <Text fontSize="2xs" color="app.muted" fontWeight="bold" letterSpacing="0.1em">
                      / 07
                    </Text>
                  </Box>
                  <Box flex="1" minW="0" position="relative" h="full" aria-live="polite">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div key={step.key} initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8, filter: "blur(2px)" }} transition={{ duration: 0.28, ease: EASE }}>
                        {!compact && <Kicker color={bad ? "red.fg" : "brand.fg"}>{scene <= 4 ? `${c.title} · ${scenarioLabel}` : `${c.title} · ${c.sub}`}</Kicker>}
                        <Heading as="h2" fontFamily="heading" fontWeight="semibold" letterSpacing="-0.025em" fontSize={tier.xxl ? "2xl" : tier.md ? "xl" : "md"} lineHeight="1.2" mt="0.5" lineClamp={tier.md || compact ? 1 : 2}>
                          {step.title}
                        </Heading>
                        <Text color="app.muted" fontSize={tier.md ? "sm" : "xs"} lineHeight="1.45" mt="1" lineClamp={compact ? 1 : 2}>
                          {step.text}
                        </Text>
                      </motion.div>
                    </AnimatePresence>
                  </Box>
                </Flex>

                {/* The stage */}
                <Flex as="section" id="ce-stage" tabIndex={-1} aria-label="Expérience CampusEquip" direction="column" flex="1" minH="0" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="2xl" overflow="hidden" className="stage" outline="none">
                  {/* On the explore steps the bar only repeats the title: hidden when the inspector sits beside the stage. */}
                  {!compact && !(scene > 4 && inlineInspector) && (
                    <Flex align="center" gap="2" px={tier.md ? "3" : "2"} minH="46px" flexShrink={0} borderBottomWidth="1px" borderColor="app.border" className="stage-bar">
                      {tier.lg ? (
                        <Text fontFamily="heading" fontWeight="semibold" fontSize="sm" letterSpacing="-0.01em" truncate minW="0" flex="1">
                          <span className={"live-dot" + (playing || flowPlaying ? " on" : "") + (bad ? " bad" : "")} /> {c.headline}
                        </Text>
                      ) : scene > 4 ? (
                        <Box flex="1" minW="0">
                          <Kicker>{c.stage}</Kicker>
                        </Box>
                      ) : null}
                      {scenarioControl}
                      {scene <= 4 && !tier.lg && tier.sm && <Box flex="1" />}
                      {scene <= 4 && tier.lg && (
                        <Tip label={scenarioOrigin(scenario, state.batch.profile)} container={rootRef}>
                          <Badge variant="outline" colorPalette={modified(scenario) ? "saffron" : "gray"} tabIndex={0} cursor="help" flexShrink={0}>
                            {modified(scenario) ? "Cas modifié" : "Générateur du kit"}
                          </Badge>
                        </Tip>
                      )}
                      {tier.sm && (
                        <Text fontSize="xs" color="app.muted" whiteSpace="nowrap" flexShrink={0}>
                          {scene <= 4 ? `${i - firstOfScene + 1} / ${inScene} séquence${inScene > 1 ? "s" : ""}` : "À explorer"}
                        </Text>
                      )}
                      {!inlineInspector && (
                        <Button size="xs" variant="outline" onClick={() => setDrawer(true)} aria-label={tier.sm ? undefined : "Comprendre le détail"} flexShrink={0}>
                          <Icon name="search" size={13} />
                          {tier.sm && " Comprendre"}
                        </Button>
                      )}
                    </Flex>
                  )}
                  <Box flex="1" minH="0" position="relative" className="stage-body" p={tier.md ? "3" : "2"} overflowY="auto" overflowX="hidden">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div key={scene} style={{ height: "100%" }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: EASE }}>
                        {stage}
                      </motion.div>
                    </AnimatePresence>
                  </Box>
                  {!compact && (
                    <Box className="ledger-strip" data-count={shown.length} aria-label="La base simulée" role="group">
                      {shown.map((m) => (
                        <div key={m.label} className="metric">
                          <span className="m-label">{tier.md ? m.label : m.short}</span>
                          <strong data-testid={m.id}>
                            <Count value={m.value} format={m.format} reduced={reduced} delay={scene === 3 ? 0.35 : 0} />
                          </strong>
                          {tier.lg && (
                            <small>
                              {m.id && <span className="metric-dot" />}
                              {m.detail}
                            </small>
                          )}
                        </div>
                      ))}
                    </Box>
                  )}
                </Flex>
              </Flex>

              {inlineInspector && (
                <Box as="aside" aria-label="Comprendre le détail" w="340px" flexShrink={0} minH="0" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="2xl" overflow="hidden">
                  {inspector}
                </Box>
              )}
            </Flex>

            <Player
              steps={steps}
              index={i}
              playing={playing}
              blocked={blocked}
              speed={speed}
              dwell={dwell}
              reduced={reduced}
              width={w}
              touch={touch}
              full={box.full}
              docked={docked && !box.full}
              container={rootRef}
              onRestart={restart}
              onPrev={() => go(i - 1)}
              onNext={() => go(i + 1)}
              onToggle={togglePlay}
              onGo={go}
              onSpeed={setSpeed}
              onReduced={() => setReducedChoice(!reduced)}
              onFullscreen={fullscreen}
              more={compact || !tier.lg ? { scenario: compact && scene <= 4 ? scenario : null, onScenario: choose, onInspect: () => setDrawer(true), onOpen: open } : undefined}
            />
          </Flex>

          {!inlineInspector && (
            <Drawer.Root open={drawer} onOpenChange={(e) => setDrawer(e.open)} placement={tier.md ? "end" : "bottom"} size={tier.md ? "sm" : "full"}>
              <Portal container={rootRef}>
                <Drawer.Backdrop />
                <Drawer.Positioner>
                  <Drawer.Content bg="app.surface" color="app.ink" h={tier.md ? "full" : "82dvh"} roundedTop={tier.md ? "none" : "2xl"}>
                    <Drawer.CloseTrigger asChild>
                      <CloseButton size="sm" aria-label="Fermer le panneau" />
                    </Drawer.CloseTrigger>
                    <Drawer.Body p="0" display="flex" flexDirection="column" minH="0">
                      {inspector}
                    </Drawer.Body>
                  </Drawer.Content>
                </Drawer.Positioner>
              </Portal>
            </Drawer.Root>
          )}

          <Dialogs container={rootRef} modal={modal} onClose={() => setModal(null)} query={query} onQuery={setQuery} />

          {fullError && (
            <Flex position="absolute" right="4" bottom="20" zIndex="toast" gap="2" align="center" bg="saffron.subtle" borderWidth="1px" borderColor="saffron.border" color="saffron.fg" rounded="lg" px="3" py="2" fontSize="sm" role="alert">
              {fullError}
              <CloseButton size="2xs" aria-label="Fermer le message" onClick={() => setFullError("")} />
            </Flex>
          )}
        </Box>
      </div>
    </MotionConfig>
  );
}
