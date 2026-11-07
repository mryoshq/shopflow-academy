import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { Icon } from "./icons";
import {
  BATCH,
  TASKS,
  files,
  money,
  type Frame,
  type Scenario,
  type Task,
  type TaskStatus,
} from "./model";
import { statusLabels, statusShort, taskIcons, type Snapshot } from "./content";
import {
  CONTROL_EDGES,
  arc,
  frameFlows,
  geometry,
  labKind,
  type Anchor,
  type Geometry,
  type NodeKey,
  type Pt,
} from "./scene";
import { Lab } from "./Lab";

export interface CanvasProps {
  frame: Frame;
  index: number;
  scenario: Scenario;
  state: Snapshot;
  prevTasks: Record<Task, TaskStatus>;
  selected: Task;
  follow: boolean;
  reduced: boolean;
  /** Phones and touch screens: controls are at least 44 px high (Academy rule). */
  touch: boolean;
  speed: number;
  ttl: number;
  redisDown: boolean;
  blocked: boolean;
  lotReady: boolean;
  onSelect: (t: Task) => void;
  onOpenFile: (i: number) => void;
  onRecover: () => void;
}

type Tone = "idle" | "ready" | "active" | "done" | "error";
const TONES: Tone[] = ["idle", "ready", "active", "done", "error"];

export function PipelineCanvas(p: CanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ W: number; H: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((b) =>
        b && b.W === Math.round(r.width) && b.H === Math.round(r.height)
          ? b
          : { W: Math.round(r.width), H: Math.round(r.height) },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => (box && box.W > 40 && box.H > 40 ? geometry(box.W, box.H, p.touch) : null), [box, p.touch]);

  return (
    <div ref={ref} className="canvas" data-orient={g?.orient}>
      {g && <Scene g={g} {...p} />}
    </div>
  );
}

function Scene({ g, ...p }: CanvasProps & { g: Geometry }) {
  const { tasks } = p.state;
  const status = (a: NodeKey): TaskStatus =>
    a === "lot" ? (p.lotReady ? "success" : "waiting") : tasks[a];
  const prevStatus = (a: NodeKey): TaskStatus => (a === "lot" ? "success" : p.prevTasks[a]);

  const tone = (a: NodeKey, b: Task): Tone => {
    const sa = status(a);
    const sb = tasks[b];
    if (sa !== "success") return "idle";
    if (sb === "error") return "error";
    if (sb === "running" || sb === "retry" || (p.frame.task === b && sb !== "success"))
      return "active";
    return sb === "success" ? "done" : "ready";
  };

  // A dependency that became satisfied on this very step sends one pulse down its wire.
  const pulses = CONTROL_EDGES.filter(
    ([a]) => a !== "lot" && status(a) === "success" && prevStatus(a) !== "success",
  );

  const flows = frameFlows(p.frame, p.scenario);
  const leg = Math.max(0.55, Math.min(1.3, 1.15 / p.speed));
  const timing = (l: number) => ({ delay: 0.25 + l * leg * 1.05, duration: leg });
  const arrivals = new Map<Anchor, number>();
  for (const f of flows) {
    if (f.fail) continue;
    const { delay, duration } = timing(f.leg);
    arrivals.set(f.to, Math.max(arrivals.get(f.to) ?? 0, delay + duration * 0.92));
  }

  const kind = labKind(p.frame);
  const compact = g.orient === "v" || g.lab.width < 300;
  const short = g.orient === "h" && g.lab.height < 200;

  return (
    <>
      <svg
        className="wires"
        width={g.W}
        height={g.H}
        viewBox={`0 0 ${g.W} ${g.H}`}
        aria-hidden="true"
      >
        <defs>
          {TONES.map((t) => (
            <marker
              key={t}
              id={"arrow-" + t}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="10"
              markerHeight="10"
              orient="auto-start-reverse"
            >
              <path d="M1 1.5 L9 5 L1 8.5" className={"arrowhead a-" + t} />
            </marker>
          ))}
        </defs>
        {CONTROL_EDGES.map(([a, b]) => {
          const t = tone(a, b);
          const d = g.edgePath(a, b);
          return (
            <g key={a + b} className={"wire w-" + t + (a === "lot" ? " w-src" : "")}>
              <path d={d} markerEnd={`url(#arrow-${t})`} />
              {t === "active" && <path d={d} className="flow" />}
            </g>
          );
        })}
        {!p.reduced &&
          pulses.map(([a, b]) => (
            <Traveler
              key={`${p.index}-${a}-${b}`}
              d={g.edgePath(a, b)}
              delay={0.05}
              duration={Math.min(0.8, leg * 0.7)}
            >
              <circle r={4} className="pulse-dot" />
            </Traveler>
          ))}
      </svg>

      <LotNode
        g={g}
        ready={p.lotReady}
        follow={p.follow && p.frame.scene >= 1 && p.frame.scene <= 2}
        onClick={() => p.onOpenFile(0)}
      />
      {TASKS.map((task) => (
        <TaskNode
          key={task}
          g={g}
          task={task}
          status={tasks[task]}
          selected={p.selected === task}
          current={p.frame.task === task}
          follow={p.follow && task === "load_orders" && p.frame.scene === 3 && !p.state.committed}
          warn={task === "load_orders" && p.state.committed && p.scenario !== "replay"}
          onClick={() => p.onSelect(task)}
        />
      ))}
      <Stores g={g} arrivals={arrivals} {...p} />

      <div className={"lab" + (short ? " short" : "")} style={g.lab}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={kind}
            className="lab-inner"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            <LabFit>
              <Lab
                kind={kind}
                frame={p.frame}
                scenario={p.scenario}
                state={p.state}
                ttl={p.ttl}
                follow={p.follow}
                compact={compact}
                short={short}
                blocked={p.blocked}
                reduced={p.reduced}
                speed={p.speed}
                onOpenFile={p.onOpenFile}
                onRecover={p.onRecover}
              />
            </LabFit>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Landing rings: the card that receives data glows when the packet arrives. */}
      {!p.reduced &&
        [...arrivals.entries()].map(([a, t]) => {
          const c = g.pos(a);
          const s = g.size(a);
          return (
            <span
              key={`${p.index}-land-${a}`}
              className="landing"
              style={{
                left: c.x - s.w / 2,
                top: c.y - s.h / 2,
                width: s.w,
                height: s.h,
                animationDelay: t + "s",
              }}
            />
          );
        })}

      <svg
        className="flights"
        width={g.W}
        height={g.H}
        viewBox={`0 0 ${g.W} ${g.H}`}
        aria-hidden="true"
      >
        {!p.reduced &&
          flows.map((f) => {
            const d = arc(g.pos(f.from), g.pos(f.to));
            const { delay, duration } = timing(f.leg);
            return (
              <g key={`${p.index}-${f.id}`} className={f.fail ? "flight fail" : "flight"}>
                <motion.path
                  d={d}
                  className="trail"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: f.fail ? 0.8 : 1, opacity: 1 }}
                  transition={{
                    delay,
                    duration: f.fail ? duration * 0.8 : duration,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                />
                <Traveler d={d} delay={delay} duration={duration} fail={f.fail}>
                  <Packet label={f.label} fail={f.fail} />
                </Traveler>
              </g>
            );
          })}
      </svg>
    </>
  );
}

/** Moves its children along an SVG path once, fading in and out. A failed trip stops short and bursts. */
function Traveler({
  d,
  delay,
  duration,
  fail,
  children,
}: {
  d: string;
  delay: number;
  duration: number;
  fail?: boolean;
  children: ReactNode;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const t = useMotionValue(0);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const end = fail ? 0.8 : 1;
  const opacity = useTransform(t, [0, 0.06, end * 0.88, end], [0, 1, 1, 0]);
  const [burst, setBurst] = useState<Pt | null>(null);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    const place = (v: number) => {
      const pt = el.getPointAtLength(v * len);
      x.set(pt.x);
      y.set(pt.y);
    };
    place(0);
    if (fail) {
      const pt = el.getPointAtLength(end * len);
      setBurst({ x: pt.x, y: pt.y });
    }
    const unsub = t.on("change", place);
    const ctl = animate(t, end, { duration: duration * end, delay, ease: [0.4, 0, 0.2, 1] });
    return () => {
      ctl.stop();
      unsub();
    };
  }, [d, delay, duration, end, fail, t, x, y]);

  return (
    <>
      <path ref={pathRef} d={d} fill="none" stroke="none" />
      <motion.g style={{ x, y, opacity }}>{children}</motion.g>
      {burst && (
        <motion.g
          className="burst"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.2, 1, 1] }}
          transition={{ delay: delay + duration * end, duration: 1.6, times: [0, 0.15, 0.7, 1] }}
          style={{ x: burst.x, y: burst.y }}
        >
          <circle r={10} />
          <path d="M-4 -4 L4 4 M4 -4 L-4 4" />
        </motion.g>
      )}
    </>
  );
}

function Packet({ label, fail }: { label: string; fail?: boolean }) {
  const w = label.length * 6 + 16;
  return (
    <g className={fail ? "pkt fail" : "pkt"}>
      <circle r={6} className="pkt-halo" />
      <circle r={4} className="pkt-dot" />
      <g transform="translate(9 -21)">
        <rect width={w} height={17} rx={8.5} />
        <text x={8} y={12}>
          {label}
        </text>
      </g>
    </g>
  );
}

function StatusGlyph({ status }: { status: TaskStatus }) {
  const name =
    status === "success"
      ? "check"
      : status === "error"
        ? "alert"
        : status === "retry"
          ? "reset"
          : "clock";
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={status}
        className={"glyph g-" + status}
        initial={{ scale: 0.3, opacity: 0, rotate: -40 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        exit={{ scale: 0.3, opacity: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
      >
        <Icon name={name} size={12} />
      </motion.span>
    </AnimatePresence>
  );
}

function TaskNode({
  g,
  task,
  status,
  selected,
  current,
  follow,
  warn,
  onClick,
}: {
  g: Geometry;
  task: Task;
  status: TaskStatus;
  selected: boolean;
  current: boolean;
  follow: boolean;
  warn: boolean;
  onClick: () => void;
}) {
  const c = g.pos(task);
  const { w, h } = g.size(task);
  return (
    <motion.button
      type="button"
      className={
        "pnode s-" +
        status +
        (selected ? " sel" : "") +
        (current ? " cur" : "") +
        (g.orient === "h" && h < 52 ? " tight" : "")
      }
      style={{
        left: c.x - w / 2,
        top: c.y - h / 2,
        width: w,
        height: h,
        ["--nw" as string]: w + "px",
      }}
      initial={false}
      animate={
        status === "error"
          ? { x: [0, -6, 6, -4, 4, 0], scale: 1 }
          : status === "success"
            ? { scale: [1, 1.08, 1], x: 0 }
            : { scale: 1, x: 0 }
      }
      transition={{ duration: 0.5, ease: "easeOut" }}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={task + " : " + statusLabels[status]}
    >
      <span className="pnode-icon">
        <Icon name={taskIcons[task]} size={14} />
      </span>
      <span className="pnode-text">
        <strong>{task}</strong>
        <span className="st">{statusShort[status]}</span>
      </span>
      <StatusGlyph status={status} />
      {(status === "running" || status === "retry") && <span className="pnode-bar" />}
      {follow && <span className="tag-1001">#1001</span>}
      {warn && (
        <span className="pnode-warn" title={`HIGH_REJECT_RATE · ${BATCH.rejected} lignes rejetées sur ${BATCH.source}`}>
          !
        </span>
      )}
    </motion.button>
  );
}

function LotNode({
  g,
  ready,
  follow,
  onClick,
}: {
  g: Geometry;
  ready: boolean;
  follow: boolean;
  onClick: () => void;
}) {
  const c = g.pos("lot");
  const { w, h } = g.size("lot");
  return (
    <button
      type="button"
      className={"plot" + (ready ? " ready" : "")}
      style={{ left: c.x - w / 2, top: c.y - h / 2, width: w, height: h }}
      onClick={onClick}
      aria-label={ready ? `Lot source : ${files.length} fichiers` : "Lot source : en attente"}
    >
      <span className="plot-stack" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <b>Lot</b>
      <small>{ready ? `${files.length} fichiers` : "attendu"}</small>
      {follow && <span className="tag-1001">#1001</span>}
    </button>
  );
}

/**
 * Scales the lab content down (never up) so it always fits its panel.
 * The content is widened by the same factor so it keeps the panel width.
 * Shrinking is always allowed; growing back only right after mount or a
 * panel resize, so text re-wrapping cannot make the scale flip back and forth.
 */
function LabFit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    const inner = el?.parentElement;
    const box = inner?.parentElement;
    if (!el || !inner || !box) return;
    let grows = 3;
    const fit = () => {
      const cs = getComputedStyle(inner);
      const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2;
      const h = el.offsetHeight;
      if (!h || avail <= 0) return;
      const target = Math.max(0.7, Math.min(1, avail / h));
      setScale((prev) => {
        if (target < prev - 0.005) return target;
        if (target > prev + 0.005 && grows > 0) {
          grows -= 1;
          return target;
        }
        return prev;
      });
    };
    fit();
    const content = new ResizeObserver(fit);
    content.observe(el);
    let first = true;
    const panel = new ResizeObserver(() => {
      if (!first) grows = 3;
      first = false;
      fit();
    });
    panel.observe(box);
    return () => {
      content.disconnect();
      panel.disconnect();
    };
  }, []);
  const scaled = scale < 0.995;
  return (
    <div
      ref={ref}
      className="lab-fit"
      style={scaled ? { transform: `scale(${scale})`, width: `${100 / scale}%` } : undefined}
    >
      {children}
    </div>
  );
}

/** Animated number that eases from its previous value. */
export function Counter({
  value,
  format,
  reduced,
  delay = 0,
}: {
  value: number;
  format?: (n: number) => string;
  reduced?: boolean;
  delay?: number;
}) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => (format ? format(v) : String(Math.round(v))));
  useEffect(() => {
    // Rising values wait for the packet to land; going back is immediate.
    const wait = reduced || value < mv.get() ? 0 : delay;
    const c = animate(mv, value, {
      duration: reduced ? 0 : 1.1,
      delay: wait,
      ease: [0.2, 0.7, 0.2, 1],
    });
    return () => c.stop();
    // delay only matters when the value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mv, value, reduced]);
  return <motion.span>{text}</motion.span>;
}

function Stores({
  g,
  arrivals,
  ...p
}: CanvasProps & { g: Geometry; arrivals: Map<Anchor, number> }) {
  const land = (a: Anchor) => arrivals.get(a) ?? 0;
  const box = (a: Anchor) => {
    const c = g.pos(a);
    const s = g.size(a);
    return { left: c.x - s.w / 2, top: c.y - s.h / 2, width: s.w, height: s.h };
  };
  const after =
    p.scenario === "after-commit" && ["after-fail", "retry", "idempotent"].includes(p.frame.id);
  const replayed =
    p.scenario === "replay" &&
    p.frame.scene >= 3 &&
    p.frame.id !== "read" &&
    p.frame.id !== "normalize" &&
    p.frame.id !== "validate" &&
    p.frame.id !== "split";
  const cacheOn = p.state.cache && !p.redisDown;
  const C = 2 * Math.PI * 7;
  const ttlFrac = cacheOn ? p.ttl / BATCH.ttl : 0;
  const hot = new Set(frameFlows(p.frame, p.scenario).flatMap((f) => [f.from, f.to]));
  const cls = (a: Anchor, extra = "") => "pstore st-" + a + (hot.has(a) ? " hot" : "") + extra;

  return (
    <>
      <div className={cls("pg")} style={box("pg")} role="group" aria-label="PostgreSQL">
        <div className="pstore-h">
          <Icon name="database" size={13} /> <b>PostgreSQL</b>
          <span className="k">métier</span>
        </div>
        <div className="pstore-v">
          <b>
            <Counter value={p.state.orders} reduced={p.reduced} delay={land("pg")} />
          </b>{" "}
          cmd ·{" "}
          <b>
            <Counter value={p.state.lines} reduced={p.reduced} delay={land("pg")} />
          </b>{" "}
          lignes
        </div>
        <div className="pstore-v">
          <b>
            <Counter
              value={p.state.revenue}
              format={money}
              reduced={p.reduced}
              delay={land("pg")}
            />
          </b>{" "}
          MAD
        </div>
        {after && <span className="badge b-warn">commit conservé</span>}
        {!after && replayed && <span className="badge">lot déjà chargé</span>}
        {p.follow && p.state.committed && !after && !replayed && (
          <span className="badge b-1001">#1001 chargée</span>
        )}
      </div>

      <div className={cls("mongo")} style={box("mongo")} role="group" aria-label="MongoDB">
        <div className="pstore-h">
          <Icon name="layers" size={13} /> <b>MongoDB</b>
          <span className="k">événements</span>
        </div>
        <div className="pstore-v">
          <b>
            <Counter value={p.state.eventCount} reduced={p.reduced} delay={land("mongo")} />
          </b>{" "}
          documents
        </div>
        <div className="pstore-v sub">
          {p.state.events ? "1 livraison → n événements" : "aucun événement"}
        </div>
        {p.follow && p.state.events && <span className="badge b-1001">#1001 · delivered</span>}
      </div>

      <div className={cls("redis", p.redisDown ? " down" : "")} style={box("redis")} role="group" aria-label="Redis">
        <div className="pstore-h">
          <Icon name="stack" size={13} /> <b>Redis</b>
          <span className="k">{p.redisDown ? "indisponible" : "cache + file"}</span>
        </div>
        <div className="slots">
          <div className={"slot" + (cacheOn && p.ttl > 0 ? " on" : "")}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <circle cx="9" cy="9" r="7" className="ring-bg" />
              <circle
                cx="9"
                cy="9"
                r="7"
                className="ring"
                transform="rotate(-90 9 9)"
                style={{ strokeDasharray: `${C} ${C}`, strokeDashoffset: C * (1 - ttlFrac) }}
              />
            </svg>
            <span>
              <b>cache</b>
              <small>
                {p.redisDown ? "—" : cacheOn ? (p.ttl > 0 ? `TTL ${p.ttl} s` : "expiré") : "vide"}
              </small>
            </span>
          </div>
          <div className={"slot" + (p.state.queue && !p.redisDown ? " on" : "")}>
            <Icon name="route" size={14} />
            <span>
              <b>file</b>
              <small>{p.redisDown ? "—" : p.state.queue ? BATCH.queue.join(" → ") : "vide"}</small>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
