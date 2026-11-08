import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Box, Button, Flex, IconButton, NativeSelect, Switch, Tabs, Text } from "@chakra-ui/react";
import { daily, money, ranking, refs, units, type DB } from "./model";
import { Icon } from "./icons";
import { Count } from "./ui";
import { EASE, useSize } from "./hooks";

/** « Les indicateurs »: the three SQL questions of the subject, for one campus. */
export function Indicators({ db, campus, onCampus, reduced, touch }: { db: DB; campus: number; onCampus: (n: number) => void; reduced: boolean; touch: boolean }) {
  const area = useRef<HTMLDivElement>(null);
  const { w } = useSize(area);
  const narrow = w > 0 && w < 360;
  const [view, setView] = useState("daily");
  const [cumulative, setCumulative] = useState(false);
  const [table, setTable] = useState(false);
  // Open on the busiest day of the campus, so the first reading is not an empty day.
  const [day, setDay] = useState(() => {
    const first = daily(db, campus);
    const top = first.reduce((best, v) => (v.cents > best.cents ? v : best), first[0]);
    return top && top.cents > 0 ? top.day : 1;
  });
  const values = daily(db, campus);
  const pick = (v: { cents: number; cumulative: number }) => (cumulative ? v.cumulative : v.cents);
  const max = Math.max(1, ...values.map(pick));
  const selected = values[day - 1];
  const ranks = ranking(db, campus);
  const byUnit = units(db, campus);
  const unitMax = Math.max(1, ...byUnit.map((u) => u.cents));
  const rankMax = Math.max(1, ...ranks.map((r) => r.cents));
  const empty = db.rows.length === 0;
  const t = (d: number) => (reduced ? 0 : d);

  return (
    <Flex ref={area} direction="column" gap="2" h="full" minH="0" className="indicators">
      <Flex align="center" gap="2" wrap="wrap">
        <NativeSelect.Root size="xs" w="auto" minW={narrow ? "0" : "10rem"} flex={narrow ? "1" : undefined}>
          <NativeSelect.Field aria-label="Campus des indicateurs" value={campus} onChange={(e) => onCampus(Number(e.currentTarget.value))}>
            {refs.campuses.map((c) => (
              <option key={c.campus_id} value={c.campus_id}>
                {c.name}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        {!narrow && <Box flex="1" />}
        {view === "daily" &&
          (narrow ? (
            <IconButton size="xs" variant="ghost" colorPalette="brand" aria-label={table ? "Voir le graphique" : "Voir le tableau"} onClick={() => setTable((v) => !v)}>
              <Icon name={table ? "chart" : "table"} size={16} />
            </IconButton>
          ) : (
            <Button size="xs" variant="ghost" colorPalette="brand" onClick={() => setTable((v) => !v)}>
              <Icon name={table ? "chart" : "table"} size={14} />
              {table ? "Voir le graphique" : "Voir le tableau"}
            </Button>
          ))}
      </Flex>

      <Tabs.Root value={view} onValueChange={(e) => setView(e.value)} variant="line" size="sm" display="flex" flexDirection="column" flex="1" minH="0" colorPalette="brand">
        <Tabs.List overflowX="auto" overflowY="hidden" flexShrink={0}>
          <Tabs.Trigger value="daily" flexShrink={0} whiteSpace="nowrap">
            Par jour
          </Tabs.Trigger>
          <Tabs.Trigger value="ranking" flexShrink={0} whiteSpace="nowrap">
            Équipements
          </Tabs.Trigger>
          <Tabs.Trigger value="unit" flexShrink={0} whiteSpace="nowrap">
            Heure / journée
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="daily" flex="1" minH="0" display="flex" flexDirection="column" gap="2" pt="2" pb="0">
          <Flex align="flex-end" justify="space-between" gap="3" wrap="wrap">
            <Box>
              <Text textStyle="overline" fontSize="2xs" color="app.muted" letterSpacing="0.1em">
                {cumulative ? "Cumul" : "Montant du jour"} · {day} novembre
              </Text>
              <Text fontFamily="heading" fontWeight="semibold" fontSize="xl" lineHeight="1.2" color="brand.fg">
                <Count value={pick(selected)} format={money} reduced={reduced} />
              </Text>
            </Box>
            <Switch.Root size="sm" colorPalette="brand" minH={touch ? "44px" : undefined} checked={cumulative} onCheckedChange={(e) => setCumulative(!!e.checked)}>
              <Switch.HiddenInput />
              <Switch.Control />
              <Switch.Label fontSize="xs">Afficher le cumul</Switch.Label>
            </Switch.Root>
          </Flex>
          {table ? (
            <Box flex="1" minH="0" overflow="auto" className="table-scroll" tabIndex={0} role="region" aria-label="Montants par jour">
              <table className="ce-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Montant</th>
                    <th>Cumul</th>
                  </tr>
                </thead>
                <tbody>
                  {values.map((v) => (
                    <tr key={v.day} className={v.day === day ? "on" : ""}>
                      <td>{v.date}</td>
                      <td>{money(v.cents)}</td>
                      <td>{money(v.cumulative)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          ) : (
            <>
              <div className="bars" role={touch ? "img" : "group"} aria-label="Montants du 1er au 21 novembre">
                {values.map((v, n) => {
                  const pct = Math.max(1.5, (pick(v) / max) * 100);
                  const bar = (
                    <span className="bar-space">
                      <motion.i initial={reduced ? false : { height: "0%" }} animate={{ height: `${pct}%` }} transition={{ duration: t(0.6), delay: t(0.15 + n * 0.025), ease: EASE }} />
                    </span>
                  );
                  return touch ? (
                    <span key={v.day} className={"bar" + (v.day === day ? " on" : "")} onClick={() => setDay(v.day)}>
                      {bar}
                      <small>{v.day}</small>
                    </span>
                  ) : (
                    <button key={v.day} type="button" className={"bar" + (v.day === day ? " on" : "")} aria-pressed={day === v.day} aria-label={`${v.day} novembre : ${money(pick(v))}`} onClick={() => setDay(v.day)}>
                      {bar}
                      <small>{v.day}</small>
                    </button>
                  );
                })}
              </div>
              {touch && (
                <input className="day-range" type="range" min={1} max={21} step={1} value={day} aria-label="Jour de novembre" aria-valuetext={`${day} novembre`} onChange={(e) => setDay(Number(e.currentTarget.value))} />
              )}
            </>
          )}
          <Text fontSize="xs" color="app.muted">
            {empty ? "Aucune ligne conservée : chaque jour vaut zéro." : "Un jour sans montant apparaît à zéro. Les montants sont rattachés à start_date."}
          </Text>
        </Tabs.Content>

        <Tabs.Content value="ranking" flex="1" minH="0" overflow="auto" pt="2">
          <Text fontWeight="semibold" fontSize="sm" mb="2">
            Équipements les plus contributeurs
          </Text>
          {!ranks.length ? (
            <Text fontSize="sm" color="app.muted">
              Aucun montant retenu pour ce campus.
            </Text>
          ) : (
            <ol className="ranking" aria-label="Classement des équipements">
              {ranks.map((r, n) => (
                <motion.li key={`${campus}-${r.id}`} initial={reduced ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: t(n * 0.05), duration: t(0.3) }}>
                  <span className="rank">{r.rank}</span>
                  <span className="r-name">Équipement {r.id.padStart(3, "0")}</span>
                  <span className="r-bar">
                    <motion.i initial={reduced ? false : { width: 0 }} animate={{ width: `${Math.max(3, (r.cents / rankMax) * 100)}%` }} transition={{ delay: t(0.1 + n * 0.05), duration: t(0.5), ease: EASE }} />
                  </span>
                  <b>{money(r.cents)}</b>
                </motion.li>
              ))}
            </ol>
          )}
          <Text fontSize="xs" color="app.muted" mt="2">
            Un même montant reçoit le même rang. Le classement porte sur ce campus uniquement.
          </Text>
        </Tabs.Content>

        <Tabs.Content value="unit" flex="1" minH="0" overflow="auto" pt="2">
          <Text fontWeight="semibold" fontSize="sm" mb="2">
            Deux unités, une monnaie commune.
          </Text>
          <div className="units">
            {byUnit.map((u, n) => (
              <div key={u.unit} className="unit-card">
                <Flex align="center" gap="2" color="brand.fg">
                  <Icon name={u.unit === "hour" ? "clock" : "file"} size={20} />
                  <Text fontSize="sm" fontWeight="semibold" color="app.ink">
                    {u.unit === "hour" ? "À l’heure" : "À la journée"}
                  </Text>
                </Flex>
                <Text fontFamily="heading" fontSize="xl" fontWeight="semibold">
                  <Count value={u.cents} format={money} reduced={reduced} />
                </Text>
                <Text fontSize="xs" color="app.muted">
                  {u.lines} lignes retenues
                </Text>
                <span className="r-bar">
                  <motion.i initial={reduced ? false : { width: 0 }} animate={{ width: `${Math.max(2, (u.cents / unitMax) * 100)}%` }} transition={{ delay: t(0.15 + n * 0.1), duration: t(0.6), ease: EASE }} />
                </span>
              </div>
            ))}
          </div>
          <Text fontSize="xs" color="app.muted" mt="2">
            Comparez les montants en MAD. N’additionnez pas les heures et les jours.
          </Text>
        </Tabs.Content>
      </Tabs.Root>
    </Flex>
  );
}
