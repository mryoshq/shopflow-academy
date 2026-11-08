import { useEffect, useId, useRef, type RefObject } from "react";
import { animate, motion } from "motion/react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { refs } from "./model";
import { Icon } from "./icons";
import { useSize } from "./hooks";

type Pt = [number, number];
type Kind = "row" | "wide" | "tall";
type Map = { kind: Kind; vb: Pt; campus: Pt[]; lot: Pt; label: { x: number; y: number; anchor: "middle" | "start" } };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Three drawings of the same fictitious network, chosen from the space available:
 * one row of six campuses above the lot (wide and short), two rows of three with the lot
 * on the right, or three rows of two with the lot at the bottom (narrow).
 * The width of the drawing follows the space, so the labels keep a readable size.
 */
function layout(w: number, h: number): Map {
  const aspect = w / Math.max(1, h);
  if (aspect >= 2.4) {
    const vh = 270;
    const vw = clamp(vh * aspect, 820, 1400);
    const step = (vw - 160) / 5;
    return {
      kind: "row",
      vb: [vw, vh],
      campus: Array.from({ length: 6 }, (_, n) => [80 + n * step, 78] as Pt),
      lot: [vw / 2, 222],
      label: { x: vw / 2 + 52, y: 226, anchor: "start" },
    };
  }
  if (aspect >= 1.15) {
    const vh = 420;
    const vw = clamp(vh * aspect, 680, 960);
    const x = (f: number) => f * vw;
    return {
      kind: "wide",
      vb: [vw, vh],
      campus: [
        [x(0.135), 128],
        [x(0.39), 84],
        [x(0.645), 132],
        [x(0.135), 318],
        [x(0.39), 352],
        [x(0.645), 312],
      ],
      lot: [x(0.885), 222],
      label: { x: x(0.885), y: 222 + 56, anchor: "middle" },
    };
  }
  const vw = 400;
  const vh = clamp(vw / Math.max(0.4, aspect), 480, 620);
  const gap = (vh - 150) / 3;
  return {
    kind: "tall",
    vb: [vw, vh],
    campus: [0, 1, 2].flatMap((r) => [[104, 92 + r * gap] as Pt, [296, 92 + r * gap] as Pt]),
    lot: [200, vh - 44],
    label: { x: 200, y: vh - 90, anchor: "middle" },
  };
}

/** The route of one campus to the lot, drawn from below its labels (row, tall) or from its side (wide). */
function curve(map: Map, [x, y]: Pt) {
  const [lx, ly] = map.lot;
  if (map.kind === "row") return `M${x} ${y + 56} C${x} ${y + 96} ${lx} ${ly - 78} ${lx} ${ly - 38}`;
  if (map.kind === "tall") return `M${x} ${y + 56} C${x} ${y + 110} ${lx} ${ly - 100} ${lx} ${ly - 38}`;
  return `M${x + 40} ${y - 4} C${x + 140} ${y} ${lx - 120} ${ly} ${lx - 42} ${ly}`;
}

/** A small isometric campus building (owner's drawing, simplified), coloured by the theme. */
function Building({ x, y, on, delay, reduced }: { x: number; y: number; on: boolean; delay: number; reduced: boolean }) {
  return (
    <motion.g
      className={"bld" + (on ? " on" : "")}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <g transform={`translate(${x - 44} ${y - 62})`}>
        <path className="ground" d="M2 58 44 36 88 58 46 80Z" />
        <path className="left" d="M14 28v31l31 16V44Z" />
        <path className="right" d="M45 44v31l30-16V28Z" />
        <path className="roof" d="M13 27 44 10 77 27 46 44Z" />
        <path className="roof-in" d="M20 26 44 14 69 26 46 38Z" />
        {[0, 1, 2].map((n) => (
          <g key={n} className="win">
            <path d={`M${19 + n * 8} ${40 + n * 4}v8l4 2v-8Z`} />
            <path d={`M${51 + n * 7} ${47 - n * 4}v7l4-2v-7Z`} />
          </g>
        ))}
        <path className="door" d="M29 54v14l9 5V59Z" />
      </g>
    </motion.g>
  );
}

/** Rental lines travelling from the chosen campus to the source batch. */
function Packet({ pathRef, delay, duration }: { pathRef: RefObject<SVGPathElement | null>; delay: number; duration: number }) {
  const dot = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const path = pathRef.current;
    const el = dot.current;
    if (!path || !el) return;
    const len = path.getTotalLength();
    const c = animate(0, 1, {
      duration,
      delay,
      repeat: Infinity,
      repeatDelay: 0.4,
      ease: [0.45, 0, 0.25, 1],
      onUpdate: (v) => {
        const p = path.getPointAtLength(v * len);
        el.setAttribute("cx", String(p.x));
        el.setAttribute("cy", String(p.y));
        el.setAttribute("opacity", String(v < 0.08 ? v / 0.08 : v > 0.92 ? (1 - v) / 0.08 : 1));
      },
    });
    return () => c.stop();
  }, [pathRef, delay, duration]);
  return <circle ref={dot} className="packet" r="4.5" cx="-20" cy="-20" opacity="0" />;
}

export function Territory({ campus, onCampus, reduced, touch, speed }: { campus: number; onCampus: (n: number) => void; reduced: boolean; touch: boolean; speed: number }) {
  const area = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(area);
  const map = layout(w, h);
  const [vw, vh] = map.vb;
  const route = useRef<SVGPathElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, "");
  // Keep the labels readable once the drawing is scaled down (phones): about 11 px on screen at least.
  const scale = w > 0 ? Math.min(w / vw, h / vh) : 1;
  const nameSize = Math.max(14, 11.5 / scale);
  const showSub = scale >= 0.7;
  const subSize = Math.max(11, 10 / scale);

  return (
    <Flex direction="column" h="full" minH="0" gap="2" className="territory">
      <Flex gap="2" wrap="wrap" px="1">
        <span className="map-tag">6 campus · 12 guichets</span>
        <span className="map-tag subtle">Réseau fictif · schéma non géographique</span>
      </Flex>
      <Box ref={area} flex="1" minH="140px" position="relative">
        {w > 0 && (
          <svg className="network" viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Six campus reliés au lot source. Campus choisi : ${refs.campuses[campus - 1].name}.`}>
            <defs>
              <pattern id="ce-dots" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1.5" cy="1.5" r="1.1" className="dot" />
              </pattern>
            </defs>
            <rect width={vw} height={vh} fill="url(#ce-dots)" rx="18" />
            {/* Each route is revealed by a mask drawn with pathLength, so the dashes keep their own length. */}
            {map.campus.map((p, n) => {
              const on = campus === n + 1;
              const d = curve(map, p);
              return (
                <g key={`r${n}-${map.kind}-${vw}`}>
                  <mask id={`${uid}-m${n}`} maskUnits="userSpaceOnUse" x="0" y="0" width={vw} height={vh}>
                    <motion.path
                      d={d}
                      fill="none"
                      stroke="#fff"
                      strokeWidth="10"
                      initial={reduced ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.9, delay: 0.25 + n * 0.06, ease: "easeOut" }}
                    />
                  </mask>
                  <path ref={on ? route : undefined} d={d} className={"route" + (on ? " on" : "")} mask={`url(#${uid}-m${n})`} />
                </g>
              );
            })}
            {!reduced && [0, 1, 2].map((n) => <Packet key={`${campus}-${map.kind}-${vw}-${n}`} pathRef={route} delay={0.9 + n * 0.75} duration={2.2 / speed} />)}
            {map.campus.map(([x, y], n) => {
              const on = campus === n + 1;
              return (
                <g key={`c${n}`} className="campus" onClick={() => onCampus(n + 1)}>
                  <Building x={x} y={y} on={on} delay={0.05 * n} reduced={reduced} />
                  <text x={x} y={y + 16 + nameSize} textAnchor="middle" className={"c-name" + (on ? " on" : "")} style={{ fontSize: nameSize }}>
                    {refs.campuses[n].name.replace("Campus ", "")}
                  </text>
                  {showSub && (
                    <text x={x} y={y + 20 + nameSize + subSize} textAnchor="middle" className="c-sub" style={{ fontSize: subSize }}>
                      Guichets {n * 2 + 1} et {n * 2 + 2}
                    </text>
                  )}
                </g>
              );
            })}
            <g transform={`translate(${map.lot[0] - 40} ${map.lot[1] - 36})`} className="lot">
              <rect width="80" height="72" rx="16" className="lot-card" />
              <path d="M25 16h20l11 11v29H25Z M45 16v12h11 M31 37h18 M31 45h13" className="lot-doc" />
              {!reduced && <circle cx="72" cy="6" r="6" className="signal" />}
            </g>
            <text x={map.label.x} y={map.label.y} textAnchor={map.label.anchor} className="c-sub" style={{ fontSize: subSize }}>
              Le lot source
            </text>
          </svg>
        )}
      </Box>
      <Box role="group" aria-label="Choisir un campus" className="campus-pills" data-touch={touch ? "" : undefined}>
        {refs.campuses.map((c) => {
          const on = campus === c.campus_id;
          return (
            <Button
              key={c.campus_id}
              size="xs"
              variant={on ? "solid" : "outline"}
              colorPalette="brand"
              rounded="full"
              aria-pressed={on}
              onClick={() => onCampus(c.campus_id)}
              minH={touch ? "44px" : undefined}
            >
              {c.name.replace("Campus ", "")}
            </Button>
          );
        })}
      </Box>
      {!touch && (
        <Text fontSize="xs" color="app.muted" display="flex" gap="1.5" alignItems="center" px="1">
          <Icon name="info" size={14} /> Choisissez un campus pour suivre ses locations jusqu’au lot.
        </Text>
      )}
    </Flex>
  );
}
