import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Box, Button, CloseButton, Drawer, Flex, HStack, Heading, IconButton, NativeSelect, Portal, SegmentGroup, Text, Tooltip, VisuallyHidden } from "@chakra-ui/react";
import { Icon } from "./icons";
import { BATCH, makeFrames, scenes, snapshot, type Scenario, type Task } from "./model";
import { STEP_MS, questions, scenarios, type Modal, type Mode, type Tab } from "./content";
import { PipelineCanvas } from "./PipelineCanvas";
import { Inspector } from "./Inspector";
import { Player } from "./Player";
import { Dialogs } from "./Dialogs";
import "./voyage.css";

/** Below this height the host page scrolls instead of squeezing the experience. */
const MIN_HEIGHT = 480;

/**
 * Size of the experience: its own width (the host may add a sidebar) and the height left in the
 * window below the host's header, so the whole experience fits without page scroll.
 */
function useFrameBox(ref: RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState({ w: 1200, h: 720, full: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const full = document.fullscreenElement === el;
      const top = r.top + window.scrollY;
      const h = full ? window.innerHeight : Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - top));
      setBox((b) => (Math.abs(b.w - r.width) < 1 && b.h === h && b.full === full ? b : { w: r.width, h, full }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    document.addEventListener("fullscreenchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("fullscreenchange", measure);
    };
  }, [ref]);
  return box;
}

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** The Academy's « Réduire les animations » setting (html.reduce-motion), on top of the system setting. */
function useAcademyReducedMotion() {
  const system = useMedia("(prefers-reduced-motion: reduce)");
  const [setting, setSetting] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("reduce-motion"));
  useEffect(() => {
    const html = document.documentElement;
    const mo = new MutationObserver(() => setSetting(html.classList.contains("reduce-motion")));
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return system || setting;
}

function Tip({ label, container, children }: { label: string; container: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  return (
    <Tooltip.Root openDelay={250} closeDelay={50} positioning={{ placement: "bottom" }}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Portal container={container}>
        <Tooltip.Positioner>
          <Tooltip.Content fontSize="xs" px="2" py="1">
            {label}
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}

const Kicker = ({ children }: { children: ReactNode }) => (
  <Text textStyle="overline" fontSize="2xs" color="brand.fg" truncate>
    {children}
  </Text>
);

/**
 * « Le voyage d'une donnée », the owner's application integrated in the Academy (ADR-0033).
 * It fills the space its host gives it (below the header, beside the sidebar) without page scroll,
 * follows the Academy theme (light, dark, Catppuccin), keeps its dialogs inside itself (presentation
 * mode) and reports the current scene so the address follows it (#/voyage/<1-7>), both ways.
 */
export default function VoyageApp({ initialScene = 1, onScene }: { initialScene?: number; onScene?: (scene: number) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const box = useFrameBox(rootRef);
  // The Academy enlarges every control to 44 px on phones and touch screens (ADR-0029).
  const touch = useMedia("(max-width: 47.99em), (pointer: coarse)");
  const systemReduced = useAcademyReducedMotion();
  const w = box.w;
  const tier = { sm: w >= 480, md: w >= 768, lg: w >= 1024, xl: w >= 1180, xxl: w >= 1440, wideHeader: w >= 1280, oneRow: w >= 900 };

  const [scenario, setScenario] = useState<Scenario>("normal");
  const [cacheFirst, setCacheFirst] = useState(false);
  const frames = useMemo(() => makeFrames(scenario, cacheFirst), [scenario, cacheFirst]);
  const [index, setIndex] = useState(() => Math.max(0, makeFrames("normal").findIndex((f) => f.scene === initialScene - 1)));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<Mode>("guided");
  const [selected, setSelected] = useState<Task>("load_orders");
  const [tab, setTab] = useState<Tab>("Données");
  const [recovered, setRecovered] = useState(false);
  const [ttl, setTtl] = useState(BATCH.ttl);
  const [fastTime, setFastTime] = useState(false);
  const [reducedChoice, setReducedChoice] = useState<boolean | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [fileIndex, setFileIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [follow, setFollow] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [fullError, setFullError] = useState("");
  const [docked, setDocked] = useState(false);
  const reduced = reducedChoice ?? systemReduced;
  const inlineInspector = tier.xl;
  // Phone browsers leave little height once their bars and the Academy header are drawn: the header then
  // keeps only the scenes, and the title row and the canvas toolbar move into the player menu, so the canvas
  // keeps room for its 44 px controls.
  const compact = touch && !tier.md && box.h < 740;
  // Seven 44 px scene buttons need about 324 px (a teacher page on a small phone has less).
  const stepsFit = !touch || w - (tier.md ? 32 : 16) >= scenes.length * 44;

  const i = Math.min(index, frames.length - 1);
  const frame = frames[i];
  const state = useMemo(() => snapshot(frames, i, scenario), [frames, i, scenario]);
  const prevTasks = useMemo(() => snapshot(frames, Math.max(0, i - 1), scenario).tasks, [frames, i, scenario]);
  const blocked = !!frame.gate && !recovered;
  const cacheToken = frames.slice(0, i + 1).filter((f) => f.effect === "cache").length;
  const normalized = i >= frames.findIndex((f) => f.id === "normalize");
  const seen = frames.slice(0, i + 1).map((f) => f.id);
  const redisDown = scenario === "redis" && seen.includes("cache-fail") && !seen.includes("cache-retry");
  const dwell = STEP_MS / speed;
  const last = i === frames.length - 1;
  const sceneNumber = frame.scene + 1;

  // The address follows the scene, and a new address (back button, lesson link) opens its scene.
  const reported = useRef(initialScene);
  useEffect(() => {
    if (initialScene === reported.current) return;
    reported.current = initialScene;
    go(frames.findIndex((f) => f.scene === initialScene - 1));
    // go() reads the current frames; only a new address should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScene]);
  // The host may pass a new callback on every render (an inline arrow): keep the latest one aside, so
  // only a scene change reports, never a re-render that would race with a new address.
  const onSceneRef = useRef(onScene);
  useEffect(() => {
    onSceneRef.current = onScene;
  });
  useEffect(() => {
    if (sceneNumber === reported.current) return;
    reported.current = sceneNumber;
    onSceneRef.current?.(sceneNumber);
  }, [sceneNumber]);

  // Rafi, the floating assistant of the student pages, sits over the bottom-right corner.
  useEffect(() => {
    setDocked(!!document.querySelector('[data-testid="rafi"]'));
  }, []);

  useEffect(() => {
    setTtl(BATCH.ttl);
  }, [cacheToken, scenario]);
  useEffect(() => {
    if (!state.cache || ttl <= 0) return;
    const t = setTimeout(() => setTtl((v) => Math.max(0, v - 1)), fastTime ? 100 : 1000);
    return () => clearTimeout(t);
  }, [state.cache, ttl, fastTime]);
  useEffect(() => {
    if (!playing) return;
    if (blocked || last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((n) => Math.min(n + 1, frames.length - 1)), dwell);
    return () => clearTimeout(t);
  }, [playing, i, dwell, frames.length, blocked, last]);
  useEffect(() => {
    if (frame.task && mode === "guided") setSelected(frame.task);
  }, [frame, mode]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (modal || drawer || e.metaKey || e.ctrlKey || e.altKey) return;
      // Only when the experience has the focus (or nothing has): the Academy keeps its own keys.
      const inside = !el || el === document.body || el === document.documentElement || !!rootRef.current?.contains(el);
      if (!inside) return;
      // Leave keys to fields and to widgets that use arrows themselves.
      if (el?.closest("input, select, textarea, [contenteditable], [role=tablist], [role=radiogroup], [role=menu]")) return;
      if (e.key === " " && el?.closest("button")) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        if (!blocked) setPlaying((v) => !v);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        if (!blocked) setIndex((n) => Math.min(n + 1, frames.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        setIndex((n) => Math.max(0, n - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocked, frames.length, modal, drawer]);

  function go(n: number) {
    setPlaying(false);
    const gate = frames.findIndex((f) => f.gate);
    const target = Math.max(0, Math.min(n, frames.length - 1));
    setIndex(scenario === "redis" && !recovered && gate >= 0 && target > gate ? gate : target);
  }
  function restart(s: Scenario = scenario, nextCache = cacheFirst) {
    setPlaying(false);
    setScenario(s);
    setCacheFirst(nextCache);
    setIndex(0);
    setRecovered(false);
    setTtl(BATCH.ttl);
  }
  function jump(scene: number) {
    go(frames.findIndex((f) => f.scene === scene));
  }
  function open(m: Modal) {
    setPlaying(false);
    setModal(m);
  }
  function openFile(n: number) {
    setFileIndex(n);
    open("file");
  }
  function ask(n: number) {
    setQuestion(n);
    setShowAnswer(false);
    open("question");
  }
  function select(t: Task) {
    setSelected(t);
    if (mode === "free") setPlaying(false);
    if (!inlineInspector) setDrawer(true);
  }
  function toggleFollow() {
    setFollow((v) => !v);
    setSelected("load_orders");
    setTab("Données");
  }
  function recover() {
    setRecovered(true);
    setIndex((n) => n + 1);
    setPlaying(true);
  }
  function togglePlay() {
    if (last) {
      setIndex(0);
      setRecovered(false);
      setPlaying(true);
      return;
    }
    setPlaying((v) => !v);
  }
  function illustrate() {
    setModal(null);
    if (question === 1) {
      setScenario("after-commit");
      setRecovered(false);
      setPlaying(false);
      setIndex(makeFrames("after-commit", cacheFirst).findIndex((f) => f.id === "after-fail"));
    } else if (question === 0) {
      go(frames.findIndex((f) => f.id === "split"));
    } else {
      const n = frames.findIndex((f) => f.effect === "cache");
      if (scenario === "redis") setRecovered(true);
      setPlaying(false);
      setIndex(n);
      setTimeout(() => setTtl(0), 60);
    }
  }
  // Presentation mode: the experience alone goes full screen (its dialogs render inside it).
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
      setFullError("");
    } catch {
      setFullError("Le plein écran est indisponible dans ce navigateur.");
    }
  }

  const qIndex = frame.scene >= 5 ? 2 : frame.id === "after-fail" || frame.id === "retry" ? 1 : 0;
  const statusText = state.verified ? "Exécution réussie" : blocked ? "En attente de reprise" : playing ? "Exécution en cours" : "Prêt à explorer";
  const pad = (n: number) => String(n).padStart(2, "0");

  const inspector = (
    <Inspector
      selected={selected}
      state={state}
      scenario={scenario}
      ttl={ttl}
      fastTime={fastTime}
      follow={follow}
      normalized={normalized}
      tab={tab}
      onTab={setTab}
      onFastTime={setFastTime}
      onRefreshCache={() => setTtl(BATCH.ttl)}
      onOpenFile={openFile}
      onGlossary={(c) => {
        setQuery(c);
        open("glossary");
      }}
    />
  );

  const brand = (
    <Button variant="plain" px="1" gap="2" onClick={() => restart("normal")} aria-label="ShopFlow, recommencer" flexShrink={0} color="app.ink">
      <Flex w="8" h="8" rounded="lg" bg="brand.solid" color="brand.contrast" align="center" justify="center">
        <Icon name="workflow" size={17} />
      </Flex>
      {tier.md && (
        <Text as="span" fontFamily="heading" fontWeight="semibold" fontSize="lg" letterSpacing="-0.03em">
          ShopFlow
        </Text>
      )}
    </Button>
  );
  const title = (
    <Heading as="h1" fontFamily="heading" fontWeight="medium" fontSize={tier.md ? "md" : "sm"} color="app.muted" whiteSpace="nowrap" truncate minW="0" flexShrink={tier.oneRow ? 0 : 1}>
      Le voyage d’une donnée.
    </Heading>
  );
  const steps = !stepsFit ? (
    <nav className="steps stacked" aria-label="Scènes du parcours">
      <NativeSelect.Root size="sm" flex="1">
        <NativeSelect.Field aria-label="Scène" value={frame.scene} onChange={(e) => jump(Number(e.currentTarget.value))}>
          {scenes.map((s, n) => (
            <option key={s.title} value={n}>
              {pad(n + 1)} · {s.title}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </nav>
  ) : (
    <nav className={"steps" + (tier.oneRow ? "" : " stacked") + (touch ? " touch" : "")} aria-label="Scènes du parcours">
      {scenes.map((s, n) => {
        const now = frame.scene === n;
        const done = frame.scene > n;
        return (
          <Fragment key={s.title}>
            {n > 0 && <span className={"step-link" + (frame.scene >= n ? " on" : "")} />}
            <Tip label={`${pad(n + 1)} · ${s.title}`} container={rootRef}>
              <button type="button" className={"step" + (now ? " now" : done ? " done" : "") + (now && tier.xl ? " with-label" : "")} onClick={() => jump(n)} aria-current={now ? "step" : undefined} aria-label={`${pad(n + 1)} ${s.title}`}>
                <span className="n">{done ? <Icon name="check" size={11} /> : n + 1}</span>
                {now && tier.xl && (
                  <motion.span className="lbl" initial={{ opacity: 0, maxWidth: 0 }} animate={{ opacity: 1, maxWidth: 220 }} transition={{ duration: 0.35 }}>
                    {s.title}
                  </motion.span>
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
          <Button size="sm" variant="outline" rounded="full" onClick={() => open("architecture")}>
            <Icon name="layers" size={15} /> Architecture
          </Button>
          <Button size="sm" variant="outline" rounded="full" onClick={() => open("glossary")}>
            <Icon name="book" size={15} /> Glossaire
          </Button>
        </>
      ) : (
        <>
          <IconButton size="sm" variant="outline" aria-label="Architecture" onClick={() => open("architecture")}>
            <Icon name="layers" size={15} />
          </IconButton>
          <IconButton size="sm" variant="outline" aria-label="Glossaire" onClick={() => open("glossary")}>
            <Icon name="book" size={15} />
          </IconButton>
        </>
      )}
      {tier.sm && (
        <IconButton size="sm" variant="outline" aria-label="À propos de la simulation" onClick={() => open("about")}>
          <Icon name="info" size={15} />
        </IconButton>
      )}
      {tier.md && (
        <IconButton size="sm" variant="outline" aria-label={box.full ? "Quitter le mode présentation" : "Mode présentation"} onClick={fullscreen}>
          <Icon name="expand" size={15} />
        </IconButton>
      )}
    </HStack>
  );

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <div ref={rootRef} className="voyage-root" data-reduced={reduced ? "" : undefined} data-touch={touch ? "" : undefined} style={{ height: box.h }}>
        <Flex direction="column" h="full" minH="0">
          {/* Header: brand, title, the 7 scenes, reference dialogs (one row, or two on narrow widths). */}
          <Box as="header" className="voyage-header" flexShrink={0} px={tier.md ? "4" : "2"} borderBottomWidth="1px" borderColor="app.border" bg="app.surface">
            {compact ? (
              <Flex align="center" py="1">
                <VisuallyHidden asChild>{title}</VisuallyHidden>
                {steps}
              </Flex>
            ) : tier.oneRow ? (
              <Flex align="center" gap="3" h="14">
                {brand}
                {title}
                {steps}
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
                <Flex pb="1.5">{steps}</Flex>
              </>
            )}
          </Box>

          <Flex flex="1" minH="0" gap="3" p={tier.md ? "3" : "2"}>
            <Flex direction="column" flex="1" minW="0" minH="0" gap={tier.md ? "2.5" : "2"}>
              {/* Narration: fixed height so the canvas never jumps between steps */}
              <Flex gap={tier.md ? "4" : "2.5"} align="flex-start" h={tier.md ? "86px" : compact ? "80px" : "96px"} flexShrink={0} px="1">
                <Box textAlign="center" flexShrink={0} pt="0.5" aria-hidden="true">
                  <Text fontFamily="heading" fontSize={tier.md ? "4xl" : "2xl"} color="brand.fg" lineHeight="1" fontWeight="semibold">
                    {pad(sceneNumber)}
                  </Text>
                  <Text fontSize="2xs" color="app.muted" fontWeight="bold" letterSpacing="0.1em">
                    / {pad(scenes.length)}
                  </Text>
                </Box>
                <Box flex="1" minW="0" position="relative" h="full" aria-live="polite">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={scenario + frame.id}
                      initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -8, filter: "blur(2px)" }}
                      transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
                    >
                      {!compact && (
                        <Kicker>
                          {scenes[frame.scene].short} · {scenarios.find((s) => s.id === scenario)?.title}
                        </Kicker>
                      )}
                      <Heading as="h2" fontFamily="heading" fontWeight="semibold" letterSpacing="-0.025em" fontSize={tier.xxl ? "2xl" : tier.md ? "xl" : "md"} lineHeight="1.2" mt="0.5" lineClamp={tier.md ? 1 : 2}>
                        {frame.title}
                      </Heading>
                      <Text color="app.muted" fontSize={tier.md ? "sm" : "xs"} lineHeight="1.45" mt="1" lineClamp={2}>
                        {frame.detail}
                      </Text>
                    </motion.div>
                  </AnimatePresence>
                </Box>
                {tier.lg && (
                  <Button
                    variant="outline"
                    w="260px"
                    h="full"
                    flexShrink={0}
                    whiteSpace="normal"
                    textAlign="left"
                    justifyContent="flex-start"
                    alignItems="flex-start"
                    flexDirection="column"
                    gap="1"
                    px="3"
                    py="2"
                    rounded="xl"
                    bg="app.surface"
                    onClick={() => ask(qIndex)}
                  >
                    <Text textStyle="overline" fontSize="2xs" color="brand.fg">
                      Prenez un instant
                    </Text>
                    <Text fontSize="sm" fontWeight="semibold" color="app.ink" lineHeight="1.3" lineClamp={2}>
                      {questions[qIndex].q}
                    </Text>
                  </Button>
                )}
              </Flex>

              {/* The pipeline */}
              <Flex as="section" aria-label="Simulation du pipeline" direction="column" flex="1" minH="0" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="2xl" overflow="hidden">
                {!compact && (
                <Flex align="center" gap="2" px={tier.md ? "3" : "2"} minH="46px" flexShrink={0} borderBottomWidth="1px" borderColor="app.border">
                  {tier.xxl && (
                    <Text fontFamily="mono" fontSize="xs" whiteSpace="nowrap" color="app.muted">
                      shopflow_pipeline{" "}
                      <Text as="span" color="brand.fg" fontWeight="bold" letterSpacing="0.12em" fontSize="2xs">
                        DAG
                      </Text>
                    </Text>
                  )}
                  {tier.md ? (
                    <SegmentGroup.Root size="xs" value={scenario} onValueChange={(e) => e.value && restart(e.value as Scenario)} aria-label="Scénario">
                      {/* The chosen item carries its own background (not only the sliding indicator), so contrast checks read it. */}
                      {scenarios.map((s) => (
                        <SegmentGroup.Item key={s.id} value={s.id} _checked={{ bg: "brand.solid", color: "brand.contrast" }}>
                          <SegmentGroup.ItemText>{s.short}</SegmentGroup.ItemText>
                          <SegmentGroup.ItemHiddenInput />
                        </SegmentGroup.Item>
                      ))}
                    </SegmentGroup.Root>
                  ) : (
                    <NativeSelect.Root size="xs" flex="1" minW="0">
                      <NativeSelect.Field aria-label="Scénario" value={scenario} onChange={(e) => restart(e.currentTarget.value as Scenario)}>
                        {scenarios.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  )}
                  {tier.md && <Box flex="1" />}
                  {tier.sm && (
                    <HStack gap="1.5" fontSize="xs" fontWeight="bold" color={blocked ? "red.fg" : "brand.fg"} whiteSpace="nowrap" role="status">
                      <span className={"live-dot" + (playing ? " on" : "") + (blocked ? " bad" : "")} />
                      {statusText}
                    </HStack>
                  )}
                  {tier.lg && (
                    <Tip label="Deux branches indépendantes : l’ordre ne change pas le résultat." container={rootRef}>
                      <Button size="xs" variant="ghost" colorPalette="brand" onClick={() => restart(scenario, !cacheFirst)}>
                        <Icon name="route" size={13} /> {cacheFirst ? "Cache d’abord" : "Événements d’abord"}
                      </Button>
                    </Tip>
                  )}
                  {!inlineInspector && (
                    <Button size="xs" variant="outline" onClick={() => setDrawer(true)} aria-label={tier.sm ? undefined : "À la loupe"}>
                      <Icon name="search" size={13} />
                      {tier.sm && " À la loupe"}
                    </Button>
                  )}
                  {!tier.lg && (
                    <IconButton size="xs" variant="outline" aria-label={questions[qIndex].q} onClick={() => ask(qIndex)}>
                      <Icon name="book" size={13} />
                    </IconButton>
                  )}
                </Flex>
                )}

                <PipelineCanvas
                  frame={frame}
                  index={i}
                  scenario={scenario}
                  state={state}
                  prevTasks={prevTasks}
                  selected={selected}
                  follow={follow}
                  reduced={reduced}
                  touch={touch}
                  speed={speed}
                  ttl={ttl}
                  redisDown={redisDown}
                  blocked={blocked}
                  lotReady={frame.scene >= 1}
                  onSelect={select}
                  onOpenFile={openFile}
                  onRecover={recover}
                />
              </Flex>
            </Flex>

            {inlineInspector && (
              <Box as="aside" aria-label="Panneau contextuel" w="340px" flexShrink={0} minH="0" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="2xl" overflow="hidden">
                {inspector}
              </Box>
            )}
          </Flex>

          <Player
            frames={frames}
            index={i}
            playing={playing}
            blocked={blocked}
            speed={speed}
            dwell={dwell}
            reduced={reduced}
            mode={mode}
            follow={follow}
            width={w}
            touch={touch}
            docked={docked && !box.full}
            container={rootRef}
            onRestart={() => restart()}
            onPrev={() => go(i - 1)}
            onNext={() => go(i + 1)}
            onToggle={togglePlay}
            onGo={go}
            onSpeed={setSpeed}
            onMode={(m) => {
              setMode(m);
              if (m === "free") setPlaying(false);
            }}
            onFollow={toggleFollow}
            onReduced={() => setReducedChoice(!reduced)}
            more={
              compact
                ? {
                    scenario,
                    onScenario: (s) => restart(s),
                    onInspect: () => setDrawer(true),
                    onQuestion: () => ask(qIndex),
                    onOpen: open,
                  }
                : undefined
            }
          />
        </Flex>

        {!inlineInspector && (
          <Drawer.Root open={drawer} onOpenChange={(e) => setDrawer(e.open)} placement={tier.md ? "end" : "bottom"} size={tier.md ? "sm" : "full"}>
            <Portal container={rootRef}>
              <Drawer.Backdrop />
              <Drawer.Positioner>
                <Drawer.Content bg="app.surface" color="app.ink" h={tier.md ? "full" : "78dvh"} roundedTop={tier.md ? "none" : "2xl"}>
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

        <Dialogs
          container={rootRef}
          modal={modal}
          onClose={() => setModal(null)}
          fileIndex={fileIndex}
          query={query}
          onQuery={setQuery}
          question={question}
          onQuestion={(n) => {
            setQuestion(n);
            setShowAnswer(false);
          }}
          showAnswer={showAnswer}
          onShowAnswer={() => setShowAnswer(true)}
          onIllustrate={illustrate}
        />

        {fullError && (
          <Flex position="absolute" right="4" bottom="20" zIndex="toast" gap="2" align="center" bg="saffron.subtle" borderWidth="1px" borderColor="saffron.border" color="saffron.fg" rounded="lg" px="3" py="2" fontSize="sm" role="alert">
            {fullError}
            <CloseButton size="2xs" onClick={() => setFullError("")} aria-label="Fermer" />
          </Flex>
        )}
      </div>
    </MotionConfig>
  );
}
