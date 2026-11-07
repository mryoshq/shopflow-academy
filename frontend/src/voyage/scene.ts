import { BASE, BATCH, EDGES, type Frame, type Scenario, type Task } from "./model";

/** Everything the canvas places: the source lot, the 7 Airflow tasks and the 3 stores. */
export type NodeKey = Task | "lot";
export type StoreKey = "pg" | "mongo" | "redis";
export type Anchor = NodeKey | StoreKey;
type Side = "top" | "bottom" | "left" | "right";
export interface Pt {
  x: number;
  y: number;
}
interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface EdgeSpec {
  from: Side;
  to: Side;
  first: "h" | "v";
  /** Offset of the start point along its side, as a fraction of the node size. */
  fo?: number;
}
interface Layout {
  orient: "h" | "v";
  /** Portrait only: node `y` is a row number, rows are spread between the top edge and the stores. */
  rows?: number;
  nodes: Record<NodeKey, Pt>;
  stores: Record<StoreKey, Pt>;
  lab: Rect;
  edges: Record<string, EdgeSpec>;
}

/** Control edges: Airflow dependencies, plus the lot feeding wait_source. */
export const CONTROL_EDGES: [NodeKey, Task][] = [["lot", "wait_source"], ...EDGES];

/*
 * Coordinates are fractions of the canvas. Wide canvas: the DAG reads left to
 * right, MongoDB sits above the events branch, PostgreSQL and Redis below.
 * The free top-left area hosts the "lab" that zooms into the current step.
 */
const WIDE: Layout = {
  orient: "h",
  nodes: {
    lot: { x: 0.045, y: 0.5 },
    wait_source: { x: 0.165, y: 0.5 },
    preflight: { x: 0.3, y: 0.5 },
    load_orders: { x: 0.435, y: 0.5 },
    load_events: { x: 0.585, y: 0.27 },
    rebuild_queue: { x: 0.735, y: 0.27 },
    refresh_cache: { x: 0.585, y: 0.73 },
    verify_result: { x: 0.895, y: 0.5 },
  },
  stores: {
    mongo: { x: 0.66, y: 0.075 },
    pg: { x: 0.415, y: 0.925 },
    redis: { x: 0.77, y: 0.925 },
  },
  lab: { x0: 0.012, y0: 0.03, x1: 0.452, y1: 0.385 },
  edges: {
    "lot>wait_source": { from: "right", to: "left", first: "h" },
    "wait_source>preflight": { from: "right", to: "left", first: "h" },
    "preflight>load_orders": { from: "right", to: "left", first: "h" },
    "load_orders>load_events": { from: "top", to: "left", first: "v", fo: 0.3 },
    "load_orders>refresh_cache": { from: "bottom", to: "left", first: "v", fo: 0.3 },
    "load_events>rebuild_queue": { from: "right", to: "left", first: "h" },
    "rebuild_queue>verify_result": { from: "right", to: "top", first: "h" },
    "refresh_cache>verify_result": { from: "right", to: "bottom", first: "h" },
  },
};

/*
 * Narrow / portrait canvas: the DAG reads top to bottom in six rows, stores along the bottom.
 * The left column carries the batch (lot to verify_result), the right column the lab, then the
 * events branch, which joins verify_result from the side.
 */
const TALL: Layout = {
  orient: "v",
  rows: 6,
  nodes: {
    lot: { x: 0.25, y: 0 },
    wait_source: { x: 0.25, y: 1 },
    preflight: { x: 0.25, y: 2 },
    load_orders: { x: 0.25, y: 3 },
    refresh_cache: { x: 0.25, y: 4 },
    load_events: { x: 0.75, y: 4 },
    rebuild_queue: { x: 0.75, y: 5 },
    verify_result: { x: 0.25, y: 5 },
  },
  stores: {
    pg: { x: 0.17, y: 0.9 },
    mongo: { x: 0.5, y: 0.9 },
    redis: { x: 0.83, y: 0.9 },
  },
  lab: { x0: 0.515, y0: 0.012, x1: 0.988, y1: 0.325 },
  edges: {
    "lot>wait_source": { from: "bottom", to: "top", first: "v" },
    "wait_source>preflight": { from: "bottom", to: "top", first: "v" },
    "preflight>load_orders": { from: "bottom", to: "top", first: "v" },
    "load_orders>load_events": { from: "right", to: "top", first: "h" },
    "load_orders>refresh_cache": { from: "bottom", to: "top", first: "v" },
    "load_events>rebuild_queue": { from: "bottom", to: "top", first: "v" },
    "rebuild_queue>verify_result": { from: "left", to: "right", first: "h" },
    "refresh_cache>verify_result": { from: "bottom", to: "top", first: "v" },
  },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface Geometry {
  W: number;
  H: number;
  orient: "h" | "v";
  pos: (a: Anchor) => Pt;
  size: (a: Anchor) => { w: number; h: number };
  lab: { left: number; top: number; width: number; height: number };
  edgePath: (a: NodeKey, b: Task) => string;
}

/** `touch`: the Academy gives every button at least 44 px on phones and touch screens (ADR-0029). */
export function geometry(W: number, H: number, touch = false): Geometry {
  const layout = W < 620 || W / H < 1.05 ? TALL : WIDE;
  const wide = layout.orient === "h";
  const node = wide
    ? { w: clamp(W * 0.118, 84, 150), h: clamp(H * 0.135, 46, 62) }
    : { w: clamp(W * 0.42, 118, 190), h: touch ? 44 : clamp(H * 0.074, 32, 44) };
  const lot = wide ? { w: clamp(W * 0.07, 52, 78), h: clamp(H * 0.2, 60, 88) } : node;
  const store = wide
    ? { w: clamp(W * 0.2, 150, 232), h: clamp(H * 0.14, 66, 74) }
    : { w: clamp(W * 0.31, 96, 150), h: clamp(H * 0.175, 64, 84) };
  // Portrait rows: from the top edge down to the stores, with a gap above them.
  const rowTop = 6 + node.h / 2;
  const rowPitch = layout.rows ? (H - 6 - store.h - 12 - node.h / 2 - rowTop) / (layout.rows - 1) : 0;
  const rowY = (r: number) => rowTop + r * rowPitch;

  const size = (a: Anchor) => (a === "lot" ? lot : a === "pg" || a === "mongo" || a === "redis" ? store : node);
  const pos = (a: Anchor): Pt => {
    if (a === "pg" || a === "mongo" || a === "redis") {
      // Stores sit on the canvas edges: keep the whole card inside.
      const p = layout.stores[a];
      const m = 6 + store.h / 2;
      return { x: p.x * W, y: clamp(p.y * H, m, H - m) };
    }
    const p = layout.nodes[a];
    return { x: p.x * W, y: layout.rows ? rowY(p.y) : p.y * H };
  };
  const side = (a: Anchor, s: Side, off = 0): Pt => {
    const c = pos(a);
    const { w, h } = size(a);
    if (s === "top") return { x: c.x + off * w, y: c.y - h / 2 };
    if (s === "bottom") return { x: c.x + off * w, y: c.y + h / 2 };
    if (s === "left") return { x: c.x - w / 2, y: c.y + off * h };
    return { x: c.x + w / 2, y: c.y + off * h };
  };
  const { x0, y0, x1, y1 } = layout.lab;
  return {
    W,
    H,
    orient: layout.orient,
    pos,
    size,
    // Portrait: the lab fills the right column down to the wire that leaves load_orders.
    lab: layout.rows
      ? { left: x0 * W, top: 6, width: (x1 - x0) * W, height: rowY(3) - 8 - 6 }
      : { left: x0 * W, top: y0 * H, width: (x1 - x0) * W, height: (y1 - y0) * H },
    edgePath: (a, b) => {
      const spec = layout.edges[a + ">" + b];
      return elbow(side(a, spec.from, spec.fo), side(b, spec.to), spec.first);
    },
  };
}

/** Orthogonal connector with one rounded corner (or a straight line when aligned). */
export function elbow(p: Pt, q: Pt, first: "h" | "v", r = 12): string {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return `M${p.x} ${p.y} L${q.x} ${q.y}`;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const rr = Math.min(r, Math.abs(dx) / 2, Math.abs(dy) / 2);
  if (first === "v") return `M${p.x} ${p.y} V${q.y - sy * rr} Q${p.x} ${q.y} ${p.x + sx * rr} ${q.y} H${q.x}`;
  return `M${p.x} ${p.y} H${q.x - sx * rr} Q${q.x} ${p.y} ${q.x} ${p.y + sy * rr} V${q.y}`;
}

/** A gentle flight arc between two points, bowed upward, for data in transit. */
export function arc(p: Pt, q: Pt): string {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  const bow = Math.min(90, len * 0.2);
  const cx = (p.x + q.x) / 2 + nx * bow;
  const cy = (p.y + q.y) / 2 + ny * bow;
  return `M${p.x} ${p.y} Q${cx} ${cy} ${q.x} ${q.y}`;
}

/** Data that physically moves during a frame. `leg` orders chained hops. */
export interface Flow {
  id: string;
  from: Anchor;
  to: Anchor;
  label: string;
  leg: number;
  fail?: boolean;
}

export function frameFlows(frame: Frame, scenario: Scenario): Flow[] {
  switch (frame.id) {
    case "ready":
      return [{ id: "ready", from: "lot", to: "wait_source", label: "READY", leg: 0 }];
    case "preflight":
      return [{ id: "manifest", from: "lot", to: "preflight", label: "manifest · SHA-256", leg: 0 }];
    case "read":
      return [{ id: "csv", from: "lot", to: "load_orders", label: `CSV · ${BATCH.source} lignes`, leg: 0 }];
    case "commit":
      return scenario === "replay"
        ? []
        : [{ id: "commit", from: "load_orders", to: "pg", label: `${BATCH.orderIds.length} cmd · ${BATCH.accepted} lignes`, leg: 0.3 }];
    case "events":
      return [
        { id: "jsonl", from: "lot", to: "load_events", label: `JSONL · ${BATCH.events.source}`, leg: 0 },
        ...(scenario === "replay"
          ? []
          : [{ id: "docs", from: "load_events", to: "mongo", label: `${BATCH.events.inserted} documents`, leg: 1 } as Flow]),
      ];
    case "cache":
    case "cache-retry":
      return [
        { id: "agg", from: "pg", to: "refresh_cache", label: "agrégats", leg: 0 },
        { id: "ttl", from: "refresh_cache", to: "redis", label: `TTL ${BATCH.ttl} s`, leg: 1 },
      ];
    case "cache-fail":
      return [
        { id: "agg", from: "pg", to: "refresh_cache", label: "agrégats", leg: 0 },
        { id: "ttl", from: "refresh_cache", to: "redis", label: "Redis ?", leg: 1, fail: true },
      ];
    case "queue":
      return [
        { id: "states", from: "mongo", to: "rebuild_queue", label: "états", leg: 0 },
        { id: "q", from: "rebuild_queue", to: "redis", label: `[${BATCH.queue.join(", ")}]`, leg: 1 },
      ];
    case "queue-fail":
      return [
        { id: "states", from: "mongo", to: "rebuild_queue", label: "états", leg: 0 },
        { id: "q", from: "rebuild_queue", to: "redis", label: "file ?", leg: 1, fail: true },
      ];
    case "verify":
      return [
        { id: "v-pg", from: "pg", to: "verify_result", label: `${BASE.orders + BATCH.orderIds.length} · ${BASE.lines + BATCH.accepted} · CA`, leg: 0 },
        { id: "v-mongo", from: "mongo", to: "verify_result", label: `${BATCH.events.inserted} év.`, leg: 0.4 },
        { id: "v-redis", from: "redis", to: "verify_result", label: "file", leg: 0.8 },
      ];
    default:
      return [];
  }
}

export type LabKind =
  | "start"
  | "files"
  | "ready"
  | "hash"
  | "sorter"
  | "events"
  | "cache"
  | "queue"
  | "redis-down"
  | "verify"
  | "observe";

export function labKind(frame: Frame): LabKind {
  switch (frame.id) {
    case "initial":
      return "start";
    case "sources":
      return "files";
    case "wait":
    case "ready":
      return "ready";
    case "preflight":
      return "hash";
    case "read":
    case "normalize":
    case "validate":
    case "split":
    case "commit":
    case "after-fail":
    case "retry":
    case "idempotent":
      return "sorter";
    case "events":
      return "events";
    case "cache":
    case "cache-retry":
      return "cache";
    case "queue":
      return "queue";
    case "cache-fail":
    case "queue-fail":
    case "redis-block":
      return "redis-down";
    case "verify":
      return "verify";
    default:
      return "observe";
  }
}
