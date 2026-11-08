import { useEffect, useRef, useState } from "react";
import { animate, motion } from "motion/react";
import { Badge, Box, Button, Flex, Tabs, Text } from "@chakra-ui/react";
import { Icon } from "./icons";
import { Count } from "./ui";
import { EASE, useSize } from "./hooks";

const ROAD = "M20 120H80V45H155V100H220V35H290";
/** Stops of the fictitious GPS signal along the road (fractions of its length). */
const STOPS = [0, 0.42, 0.68, 1];

/** A fictitious GPS signal moving along a campus road (no sensor, no service). */
function Gps({ event, reduced }: { event: number; reduced: boolean }) {
  const road = useRef<SVGPathElement>(null);
  const dot = useRef<SVGGElement>(null);
  const at = useRef(0);
  useEffect(() => {
    const path = road.current;
    const g = dot.current;
    if (!path || !g) return;
    const len = path.getTotalLength();
    const to = event === 0 ? 0 : STOPS[1 + ((event - 1) % (STOPS.length - 1))];
    const place = (v: number) => {
      const pt = path.getPointAtLength(v * len);
      g.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
    };
    if (reduced || event === 0) {
      place(to);
      at.current = to;
      return;
    }
    const from = to < at.current ? 0 : at.current;
    const c = animate(from, to, { duration: 1.1, ease: EASE, onUpdate: place, onComplete: () => (at.current = to) });
    return () => c.stop();
  }, [event, reduced]);
  return (
    <svg viewBox="0 0 310 150" role="img" aria-label="Trajet GPS fictif sur un schéma de campus" className="gps-board">
      <path d={ROAD} className="road" />
      <path ref={road} d={ROAD} className="road-line" />
      <g ref={dot} transform="translate(20 120)">
        {event > 0 && !reduced && <circle r="14" className="gps-ring" />}
        <circle r={event > 0 ? 9 : 6} className={event > 0 ? "gps-on" : "gps-off"} />
        {event > 0 && <circle r="3.2" className="gps-core" />}
      </g>
    </svg>
  );
}

/** « La suite du projet »: the work asked now, the optional bonuses, then axes 3 and 4. */
export function Future({ reduced, touch }: { reduced: boolean; touch: boolean }) {
  const area = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(area);
  // Everything at once when the two columns fit; otherwise four tabs (short laptops, tablets, phones).
  const full = (w >= 940 && h >= 360) || (w >= 720 && h >= 540);
  const roomy = w >= 560;
  const [tab, setTab] = useState("now");
  const [event, setEvent] = useState(0);
  const card = (n: number) => ({
    initial: reduced ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduced ? 0 : 0.08 * n, duration: 0.35, ease: EASE },
  });

  const nowCard = (
      <motion.div className="now-card" {...card(0)}>
        <Flex justify="space-between" align="flex-start" gap="3" wrap="wrap">
          <Box>
            <Text textStyle="overline" fontSize="2xs" letterSpacing="0.12em">
              À réaliser maintenant
            </Text>
            <Text fontFamily="heading" fontWeight="semibold" fontSize="2xl" lineHeight="1.15">
              SQL + Python
            </Text>
          </Box>
          <Flex gap="4" className="now-points">
            <Box>
              <Text as="strong" fontFamily="heading" fontSize="3xl" lineHeight="1" display="block">
                <Count value={10} reduced={reduced} delay={0.2} />
              </Text>
              <Text as="span" fontSize="xs">
                points de socle
              </Text>
            </Box>
            <Box>
              <Text as="strong" fontFamily="heading" fontSize="3xl" lineHeight="1" display="block">
                +<Count value={5} reduced={reduced} delay={0.35} />
              </Text>
              <Text as="span" fontSize="xs">
                points bonus maximum
              </Text>
            </Box>
          </Flex>
        </Flex>
        <Text fontSize="sm">Un modèle cohérent, trois analyses, des contrôles explicables et un chargement automatique sans doublons.</Text>
        <Text fontSize="xs">
          Remise le 21 novembre 2026 · en binôme · rapport de quatre pages maximum hors annexes
        </Text>
      </motion.div>
  );
  const bonuses = (
      <div className={"bonus-grid" + (roomy ? "" : " rows")}>
        {(
          [
            ["1 pt", "Un index utile", "Comparez les plans et vérifiez des résultats identiques."],
            ["1 pt", "Une analyse plus loin", "Récursion des catégories ou résultat précalculé."],
            ["1 pt", "Lire par morceaux", "Préservez la cohérence des contrats et les décisions."],
          ] as const
        ).map(([pts, title, text], n) => (
          <motion.div key={title} className="bonus" {...card(n + 1)}>
            <Badge variant="outline" colorPalette="brand">
              {pts}
            </Badge>
            <Text fontWeight="semibold" fontSize="sm">
              {title}
            </Text>
            <Text fontSize="xs" color="app.muted">
              {text}
            </Text>
          </motion.div>
        ))}
      </div>
  );
  const iotCard = (
      <motion.div className="iot" {...card(4)}>
        <Box flex="1" minW="12rem">
          <Badge variant="outline" colorPalette="saffron">
            Bonus · jusqu’à 2 points
          </Badge>
          <Text fontWeight="semibold" fontSize="sm" mt="1">
            Et si le matériel envoyait un signal ?
          </Text>
          <Text fontSize="xs" color="app.muted">
            Un GPS simulé ou une API peut alimenter une table distincte. Ces observations ne modifient pas les montants de location.
          </Text>
          <Button size="xs" colorPalette="brand" mt="2" onClick={() => setEvent((v) => v + 1)}>
            <Icon name="pin" size={14} /> Simuler un signal GPS
          </Button>
        </Box>
        <Box w={roomy ? (full ? "12rem" : "15rem") : "full"} flexShrink={0}>
          <Gps event={event} reduced={reduced} />
          <code className="gps-log" role="status">
            {event ? `GPS_DEMO · événement ${event} · coordonnées fictives` : "Aucun signal reçu"}
          </code>
        </Box>
      </motion.div>
  );
  const axes = (
      <div className={"next-axes" + (w >= 480 ? "" : " rows")}>
        {(
          [
            ["Plus tard · axe 3", "Historique et lecture rapide", "MongoDB et Redis. Un aperçu, sans travail demandé dans ce sujet."],
            ["Plus tard · axe 4", "Orchestration et suivi", "Airflow et TimescaleDB. Des consignes séparées préciseront cette suite."],
          ] as const
        ).map(([k, title, text], n) => (
          <motion.div key={title} className="axis" {...card(5 + n)}>
            <Text textStyle="overline" fontSize="2xs" letterSpacing="0.1em" color="app.muted">
              {k}
            </Text>
            <Text fontWeight="semibold" fontSize="sm">
              {title}
            </Text>
            <Text fontSize="xs" color="app.muted">
              {text}
            </Text>
          </motion.div>
        ))}
      </div>
  );

  const overall = (
      <Text className="overall" fontSize="xs" color="app.muted">
        Cadre global des quatre axes : 20 points de socle + 10 points bonus, soit 30/20 au maximum.
      </Text>
  );

  return (
    <Box ref={area} className={"future" + (full ? " wide" : "")} h="full">
      {w === 0 ? null : full ? (
        <>
          <div className="future-cols">
            <div className="future-col">
              {nowCard}
              {axes}
            </div>
            <div className="future-col">
              {bonuses}
              {iotCard}
            </div>
          </div>
          {overall}
        </>
      ) : (
        <Tabs.Root value={tab} onValueChange={(e) => setTab(e.value)} variant="line" size="sm" colorPalette="brand" display="flex" flexDirection="column" h="full" minH="0">
          <Tabs.List flexShrink={0} overflowX="auto" overflowY="hidden">
            {(
              [
                ["now", "À réaliser"],
                ["bonus", "Bonus"],
                ["iot", "Signal IoT"],
                ["later", "Plus tard"],
              ] as const
            ).map(([v, label]) => (
              <Tabs.Trigger key={v} value={v} minH={touch ? "44px" : undefined} whiteSpace="nowrap" flexShrink={0}>
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="now" className="future-panel">
            {nowCard}
            {overall}
          </Tabs.Content>
          <Tabs.Content value="bonus" className="future-panel">
            {bonuses}
            <Text fontSize="xs" color="app.muted">
              Bonus facultatifs : jusqu’à 5 points au total, signal IoT compris.
            </Text>
          </Tabs.Content>
          <Tabs.Content value="iot" className="future-panel">
            {iotCard}
          </Tabs.Content>
          <Tabs.Content value="later" className="future-panel">
            {axes}
            {overall}
          </Tabs.Content>
        </Tabs.Root>
      )}
    </Box>
  );
}
