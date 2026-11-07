import { useEffect, useState, type ReactNode } from "react";
import { LayoutGroup, motion } from "motion/react";
import { Button } from "@chakra-ui/react";
import { Icon } from "./icons";
import { BASE, BATCH, files, money, type Frame, type Scenario } from "./model";
import { expected, type Snapshot } from "./content";
import type { LabKind } from "./scene";

export interface LabProps {
  kind: LabKind;
  frame: Frame;
  scenario: Scenario;
  state: Snapshot;
  ttl: number;
  follow: boolean;
  /** Narrow panel (portrait canvas or small width). */
  compact: boolean;
  /** Low panel (wide canvas on a short screen). */
  short: boolean;
  blocked: boolean;
  reduced: boolean;
  speed: number;
  onOpenFile: (i: number) => void;
  onRecover: () => void;
}

const ease = [0.2, 0.7, 0.2, 1] as const;

export function Lab(p: LabProps) {
  switch (p.kind) {
    case "start":
      return <StartLab compact={p.compact} />;
    case "files":
      return <FilesLab {...p} />;
    case "ready":
      return <ReadyLab ready={p.frame.id === "ready"} />;
    case "hash":
      return <HashLab compact={p.compact} />;
    case "sorter":
      return <OrdersLab {...p} />;
    case "events":
      return <EventsLab {...p} />;
    case "cache":
      return <CacheLab ttl={p.ttl} compact={p.compact} />;
    case "queue":
      return <QueueLab />;
    case "redis-down":
      return <RedisDownLab {...p} />;
    case "verify":
      return <VerifyLab state={p.state} compact={p.compact} />;
    default:
      return <ObserveLab state={p.state} compact={p.compact} short={p.short} />;
  }
}

function Head({ k, title, right }: { k: string; title: ReactNode; right?: ReactNode }) {
  return (
    <div className="lab-h">
      <div>
        <span className="lab-k">{k}</span>
        <b className="lab-t">{title}</b>
      </div>
      {right}
    </div>
  );
}

function StartLab({ compact }: { compact: boolean }) {
  const counts = [
    [String(BASE.customers), "clients"],
    [String(BASE.categories), "catégories"],
    [String(BASE.products), "produits"],
  ];
  return (
    <>
      <Head k="Le point de départ" title={compact ? "Plusieurs grains" : "Plusieurs grains de données"} />
      <div className={"lab-counts" + (compact ? " compact" : "")}>
        {counts.map(([n, l], i) => (
          <motion.span key={l} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}>
            <b>{n}</b> {l}
          </motion.span>
        ))}
      </div>
      <Grain from="commande" to="ligne" n={2} delay={0.35} compact={compact} />
      <Grain from="livraison" to="événement" n={3} delay={0.55} compact={compact} />
    </>
  );
}

function Grain({ from, to, n, delay, compact }: { from: string; to: string; n: number; delay: number; compact?: boolean }) {
  // Narrow lab: one "n items" chip instead of n separate chips.
  const targets = compact ? [`${n} ${to}s`] : Array.from({ length: n }, () => to);
  return (
    <div className={"grain" + (compact ? " compact" : "")}>
      <motion.span className="g-from" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay }}>
        1 {from}
      </motion.span>
      <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: delay + 0.1, duration: 0.3 }} />
      {targets.map((t, i) => (
        <motion.span key={i} className="g-to" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: delay + 0.3 + i * 0.1 }}>
          {t}
        </motion.span>
      ))}
    </div>
  );
}

function FilesLab({ compact, onOpenFile }: LabProps) {
  return (
    <>
      <Head k="Le lot" title="Six fichiers arrivent" right={<span className="lab-hint">Ouvrir une carte</span>} />
      <div className={"lab-files" + (compact ? " compact" : "")}>
        {files.map((f, i) => (
          <motion.button
            type="button"
            key={f.name}
            className="lfile"
            initial={{ opacity: 0, x: -40, rotate: -4 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            transition={{ delay: 0.1 + i * 0.09, duration: 0.45, ease }}
            onClick={() => onOpenFile(i)}
          >
            <Icon name={f.type === "TÉMOIN" ? "check" : f.type === "SHA-256" ? "shield" : "file"} size={13} />
            <span>
              <b>{f.name}</b>
              <small>{f.type}</small>
            </span>
          </motion.button>
        ))}
      </div>
    </>
  );
}

function ReadyLab({ ready }: { ready: boolean }) {
  return (
    <>
      <Head k="wait_source" title={ready ? "Le témoin est là." : "Le pipeline attend le signal."} />
      <div className="ready-row">
        <motion.div className={"ready-tile" + (ready ? " on" : "")} animate={ready ? { scale: [0.9, 1.08, 1] } : { scale: 1 }} transition={{ duration: 0.5 }}>
          <Icon name={ready ? "check" : "clock"} size={16} />
          <b>READY</b>
        </motion.div>
        <p>{ready ? "Le lot est complet : preflight peut démarrer." : "Aucune donnée métier n’est encore écrite."}</p>
      </div>
      {!ready && <span className="scanline" />}
    </>
  );
}

function HashLab({ compact }: { compact: boolean }) {
  const data = files.slice(0, 4);
  return (
    <>
      <Head k="preflight" title="Quatre empreintes SHA-256" />
      <div className="hash-rows">
        {data.map((f, i) => (
          <div className="hash-row" key={f.name}>
            <span className="mono">{compact ? f.name.split(".")[0].slice(0, 12) : f.name}</span>
            <motion.span className="hash-bar" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.15 + i * 0.25, duration: 0.35 }} />
            <motion.span className="okmark" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 + i * 0.25 }}>
              <Icon name="check" size={12} />
            </motion.span>
          </div>
        ))}
      </div>
      <div className="lab-note">Intact ne veut pas dire valide.</div>
    </>
  );
}

/**
 * Where the items of each kind sit in the source: the owner's layout for the default batch,
 * an even spread when the course gives other counts. Positions are 0-based.
 */
function placement(total: number, first: number, second: number, preset: { total: number; first: number[]; second: number[] }) {
  const kinds: (0 | 1 | 2)[] = Array(total).fill(0);
  if (total === preset.total && first === preset.first.length && second === preset.second.length) {
    preset.first.forEach((i) => (kinds[i] = 1));
    preset.second.forEach((i) => (kinds[i] = 2));
    return kinds;
  }
  const a = Math.min(first, total);
  for (let k = 0; k < a; k++) kinds[Math.floor(((k + 0.5) * total) / a)] = 1;
  const free = kinds.flatMap((v, i) => (v === 0 ? [i] : []));
  const b = Math.min(second, free.length);
  for (let k = 0; k < b; k++) kinds[free[Math.floor(((k + 0.5) * free.length) / b)]] = 2;
  return kinds;
}

/* ---- The CSV lines (18 by default): read, normalize, validate, sort, commit ---- */

type LineKind = "ok" | "no" | "dup";
const LINE_KIND: LineKind[] = ["no", "ok", "dup"];
const LINE_PRESET = { total: 18, first: [0, 2, 5, 8, 11, 13, 16], second: [9] };
const sourceLines = () =>
  placement(BATCH.source, BATCH.accepted, BATCH.duplicates, LINE_PRESET).map((k, i) => ({
    id: "L" + String(i + 1).padStart(2, "0"),
    n: i,
    kind: LINE_KIND[k],
  }));
const MARK: Record<LineKind, string> = { ok: "✓", no: "✕", dup: "=" };
const BIN_LABEL: Record<LineKind, string> = { ok: "acceptées", no: "rejetées", dup: "doublon" };

function OrdersLab({ frame, scenario, follow, compact }: LabProps) {
  const LINES = sourceLines();
  const phase =
    frame.id === "read" ? "raw" : frame.id === "normalize" ? "norm" : frame.id === "validate" ? "scan" : frame.id === "split" ? "split" : "post";
  const split = phase === "split" || phase === "post";
  const marked = phase !== "raw" && phase !== "norm";

  const status =
    frame.id === "after-fail" ? (
      <span className="lab-flag warn">
        <Icon name="alert" size={12} /> échec · commit conservé
      </span>
    ) : frame.id === "retry" ? (
      <span className="lab-flag">
        <span className="spin">
          <Icon name="reset" size={12} />
        </span>{" "}
        retry
      </span>
    ) : frame.id === "idempotent" || (frame.id === "commit" && scenario === "replay") ? (
      <span className="lab-flag">SKIPPED_ALREADY_LOADED</span>
    ) : frame.id === "commit" ? (
      <span className="lab-flag ok">
        <Icon name="check" size={12} /> commit
      </span>
    ) : null;

  const title =
    phase === "raw" ? `${BATCH.source} lignes, neuf colonnes` : phase === "norm" ? "Une forme commune" : phase === "scan" ? "Chaque ligne est contrôlée" : `${BATCH.source} = ${BATCH.accepted} + ${BATCH.rejected} + ${BATCH.duplicates}`;

  const chip = (l: ReturnType<typeof sourceLines>[number]) => (
    <motion.span
      key={l.id}
      layoutId={"line-" + l.id}
      layout
      className={"lchip k-" + l.kind + (marked ? " marked" : "") + (phase === "norm" ? " norm" : "") + (follow && l.n === 0 ? " is-1001" : "")}
      transition={{ layout: { duration: 0.65, delay: split ? l.n * 0.03 : 0, ease } }}
      style={{ ["--i" as string]: l.n }}
      title={l.id + (follow && l.n === 0 ? " · commande 1001, ligne 1" : "")}
    >
      {!compact && <span className="lid">{l.id}</span>}
      {marked && (
        <motion.span
          className="mark"
          initial={phase === "scan" ? { opacity: 0, scale: 0.2 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: phase === "scan" ? 0.15 + l.n * 0.07 : 0 }}
        >
          {MARK[l.kind]}
        </motion.span>
      )}
    </motion.span>
  );

  return (
    <>
      <Head k="load_orders · lot_octobre.csv" title={title} right={status} />
      {phase === "raw" && (
        <code className="rawline">
          1001,1,2026-10-07,<mark> PAID </mark>,&quot;10,00&quot;,1,101,2,<mark>&quot;100,00&quot;</mark>
        </code>
      )}
      {phase === "norm" && (
        <div className="norm">
          <span>
            <s>« PAID »</s> <Icon name="arrow" size={11} /> <b>paid</b>
          </span>
          <span>
            <s>« 100,00 »</s> <Icon name="arrow" size={11} /> <b>100.00</b>
          </span>
        </div>
      )}
      <LayoutGroup id="orders">
        {split ? (
          <div className={"bins" + (compact ? " compact" : "")}>
            {(["ok", "no", "dup"] as LineKind[]).map((k) => (
              <div key={k} className={"bin b-" + k}>
                <div className="bin-h">
                  <b>{k === "ok" ? BATCH.accepted : k === "no" ? BATCH.rejected : BATCH.duplicates}</b> {BIN_LABEL[k]}
                </div>
                <div className="bin-chips">{LINES.filter((l) => l.kind === k).map(chip)}</div>
                {k === "no" && phase === "post" && scenario !== "replay" && <span className="bin-tag">HIGH_REJECT_RATE</span>}
                {k === "ok" && phase === "post" && <span className="bin-tag ok">{BATCH.orderIds.length} commandes</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className={"chips" + (compact ? " compact" : "")}>{LINES.map(chip)}</div>
        )}
      </LayoutGroup>
    </>
  );
}

/* ---- The JSONL entries (14 by default) sorted into inserted / duplicate / rejected ---- */

const EVENT_PRESET = { total: 14, first: [2, 6, 9, 12], second: [5] };
function EventsLab({ scenario, compact, reduced, speed }: LabProps) {
  const replay = scenario === "replay";
  const [split, setSplit] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setSplit(true), 1100 / Math.sqrt(speed));
    return () => clearTimeout(t);
  }, [reduced, speed]);
  const ev = BATCH.events;
  const items = placement(ev.source, ev.rejected, ev.duplicates, EVENT_PRESET).map((k, i) => {
    const kind: "ins" | "dup" | "rej" = k === 1 ? "rej" : replay || k === 2 ? "dup" : "ins";
    return { id: "E" + String(i + 1).padStart(2, "0"), n: i, kind };
  });
  const bins = [
    { k: "ins", label: "insertions", n: replay ? 0 : BATCH.events.inserted },
    { k: "dup", label: replay ? "doublons" : "doublon", n: replay ? ev.source - ev.rejected : ev.duplicates },
    { k: "rej", label: "rejets", n: BATCH.events.rejected },
  ] as const;
  const chip = (it: (typeof items)[number]) => (
    <motion.span
      key={it.id}
      layoutId={"ev-" + it.id}
      layout
      className={"lchip marked k-" + (it.kind === "ins" ? "ok" : it.kind === "rej" ? "no" : "dup")}
      transition={{ layout: { duration: 0.6, delay: it.n * 0.03, ease } }}
    >
      {!compact && <span className="lid">{it.id}</span>}
    </motion.span>
  );
  return (
    <>
      <Head k="load_events · JSONL" title={replay ? "Rejeu : rien de nouveau" : `${ev.source} entrées, un état de livraison`} />
      <LayoutGroup id="events">
        {split ? (
          <div className={"bins" + (compact ? " compact" : "")}>
            {bins.map((b) => (
              <div key={b.k} className={"bin b-" + (b.k === "ins" ? "ok" : b.k === "rej" ? "no" : "dup")}>
                <div className="bin-h">
                  <b>{b.n}</b> {b.label}
                </div>
                <div className="bin-chips">{items.filter((i) => i.kind === b.k).map(chip)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className={"chips" + (compact ? " compact" : "")}>{items.map(chip)}</div>
        )}
      </LayoutGroup>
    </>
  );
}

function CacheLab({ ttl, compact }: { ttl: number; compact: boolean }) {
  const alive = ttl > 0;
  return (
    <>
      <Head k="refresh_cache · Redis" title={alive ? "Un raccourci temporaire" : "La clé a expiré"} right={<span className={"lab-flag" + (alive ? " ok" : " warn")}>TTL {ttl} s</span>} />
      {BATCH.cache.map((c, i) => (
        <motion.div key={c.date} className="kv" initial={{ opacity: 0, x: 10 }} animate={{ opacity: alive ? 1 : 0.45, x: 0 }} transition={{ delay: 0.2 + i * 0.12 }}>
          <span>{c.date}</span>
          <b className={alive ? "" : "gone"}>{money(c.amount)} MAD</b>
        </motion.div>
      ))}
      <div className="ttlbar">
        <i style={{ width: (ttl / BATCH.ttl) * 100 + "%" }} />
      </div>
      {!compact && <div className="lab-note">{alive ? "Les agrégats persistants restent dans PostgreSQL." : "Clé absente. PostgreSQL conserve les agrégats."}</div>}
    </>
  );
}

function QueueLab() {
  return (
    <>
      <Head k="rebuild_queue · Redis" title="Les exceptions ont leur file" />
      <div className="queue">
        {BATCH.queue.map((id, i) => (
          <motion.span key={id} className="qchip" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.3, duration: 0.45, ease }}>
            <small>{i + 1}</small> #{id}
          </motion.span>
        ))}
      </div>
      <div className="lab-note">Ordre conservé. Distinct du cache et du moteur Airflow.</div>
    </>
  );
}

function RedisDownLab({ frame, blocked, compact, onRecover }: LabProps) {
  const text =
    frame.id === "cache-fail"
      ? "refresh_cache échoue. PostgreSQL et MongoDB restent chargés."
      : frame.id === "queue-fail"
        ? "rebuild_queue échoue à son tour."
        : "verify_result attend la réussite des deux branches.";
  return (
    <>
      <Head
        k="Panne Redis"
        title={compact ? "Redis indisponible" : "Redis est indisponible"}
        right={!compact && <span className="lab-flag warn">2 branches bloquées</span>}
      />
      <div className={"down-row" + (compact ? " compact" : "")}>
        <motion.span className="down-icon" animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}>
          <Icon name="alert" size={compact ? 14 : 18} />
        </motion.span>
        <p>{text}</p>
      </div>
      {blocked && (
        <Button size="xs" colorPalette="brand" mt={compact ? "0.5" : "2"} onClick={onRecover}>
          <Icon name="reset" size={13} /> {compact ? "Rétablir Redis" : "Rétablir Redis et reprendre"}
        </Button>
      )}
    </>
  );
}

function VerifyLab({ state, compact }: { state: Snapshot; compact: boolean }) {
  const e = expected();
  const rows: [string, string, string][] = [
    ["Commandes", String(state.orders), String(e.orders)],
    ["Lignes", String(state.lines), String(e.lines)],
    [compact ? "CA" : "CA (MAD)", money(state.revenue), money(e.revenue)],
    ["Événements", String(state.eventCount), String(e.events)],
    ["File", state.queue ? e.queue : "—", e.queue],
  ];
  return (
    <>
      <Head k="verify_result" title={compact ? "Tout concorde" : "Les destinations concordent"} />
      <div className={"checks" + (compact ? " compact" : "")}>
        {rows.map(([l, cur, exp], i) => (
          <motion.div key={l} className="check" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 + i * 0.16 }}>
            <span>{l}</span>
            <b>
              {cur} {!compact && <small>/ {exp}</small>}
            </b>
            <motion.span className="okmark" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.05 + i * 0.16, type: "spring", stiffness: 500, damping: 18 }}>
              <Icon name="check" size={11} />
            </motion.span>
          </motion.div>
        ))}
      </div>
    </>
  );
}

function ObserveLab({ state, compact, short }: { state: Snapshot; compact: boolean; short: boolean }) {
  const logs = state.logs.slice(compact || short ? -5 : -7);
  const max = Math.max(1.6, ...logs.map((l) => l.duration));
  return (
    <>
      <Head k="monitoring.task_attempts" title="Chaque tentative laisse une trace" />
      <div className="attempts">
        {logs.map((l, i) => (
          <div key={i} className={"att a-" + l.status}>
            {!compact && <span className="mono">{l.task}</span>}
            <motion.i initial={{ width: 0 }} animate={{ width: (l.duration / max) * 100 + "%" }} transition={{ delay: 0.1 + i * 0.07, duration: 0.5, ease }} />
            <small>{l.duration.toFixed(1)} s</small>
          </div>
        ))}
      </div>
      {!compact && <div className="lab-note mono">time_bucket(&apos;1 minute&apos;, …) · durées illustratives</div>}
    </>
  );
}
