import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Badge, Box, Code, Flex, Link, Stack, Text } from "@chakra-ui/react";
import { columns, number, type Batch } from "./model";
import { FILES } from "./content";
import { Icon } from "./icons";
import { Count } from "./ui";
import { EASE, useSize } from "./hooks";

const sourceFiles = [
  { name: "locations.csv", desc: "Les lignes des contrats", type: "CSV", icon: "table" },
  { name: "referentiels.json", desc: "Les identités autorisées", type: "JSON", icon: "file" },
  { name: "manifest.json", desc: "Les empreintes des fichiers", type: "JSON", icon: "shield" },
  { name: "READY", desc: "Le signal de publication", type: "TÉMOIN", icon: "check" },
] as const;

/** « Les sources »: the generator publishes four files, READY last; the watcher then checks the fingerprints. */
export function Sources({ batch, file, onFile, reduced, touch }: { batch: Batch; file: string; onFile: (f: string) => void; reduced: boolean; touch: boolean }) {
  const area = useRef<HTMLDivElement>(null);
  const { w } = useSize(area);
  const side = w >= 700;
  const missing = columns.filter((c) => !batch.columns.includes(c));
  const at = (n: number) => (reduced ? 0 : 0.12 + n * 0.22);

  return (
    <Flex ref={area} direction={side ? "row" : "column"} gap="3" h="full" minH="0" className="sources">
      <Flex direction="column" gap="2" w={side ? "44%" : "full"} flexShrink={0}>
        <Box className="files-grid" data-side={side ? "" : undefined} role="group" aria-label="Les quatre fichiers du lot">
          {sourceFiles.map((f, n) => {
            const on = file === f.name;
            return (
              <motion.button
                key={f.name}
                type="button"
                className={"file-card" + (on ? " on" : "") + (f.name === "READY" ? " ready" : "") + (touch ? " touch" : "")}
                aria-pressed={on}
                onClick={() => onFile(f.name)}
                initial={reduced ? false : f.name === "READY" ? { opacity: 0, scale: 0.6, rotate: -8 } : { opacity: 0, y: -14 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                transition={f.name === "READY" ? { type: "spring", stiffness: 380, damping: 16, delay: at(n) } : { duration: 0.4, delay: at(n), ease: EASE }}
              >
                <span className="file-icon">
                  <Icon name={f.icon} size={18} />
                </span>
                <span className="file-text">
                  <b>{f.name}</b>
                  {(side || !touch) && <small>{f.desc}</small>}
                </span>
                <span className="file-type">{f.type}</span>
              </motion.button>
            );
          })}
        </Box>
        {/* The watcher: complete folder, then fingerprints, then the business checks may start. */}
        <Box className="watcher" aria-label="Le surveilleur" role="group">
          {["Lot complet : READY présent", "Empreintes vérifiées", "Lecture autorisée, contrôles à venir"].map((t, n) => (
            <motion.div key={t} className="watch-row" initial={reduced ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduced ? 0 : 1.05 + n * 0.32, duration: 0.3 }}>
              <span className={"watch-dot" + (n === 2 ? " soft" : "")}>
                <Icon name={n === 2 ? "arrow" : "check"} size={11} />
              </span>
              {t}
            </motion.div>
          ))}
        </Box>
      </Flex>

      <Flex direction="column" flex="1" minH="0" minW="0" className="file-preview">
        <Flex align="center" justify="space-between" gap="2" px="3" py="2" borderBottomWidth="1px" borderColor="app.border">
          <Text fontFamily="mono" fontSize="sm" fontWeight="bold" truncate>
            {file}
          </Text>
          {file === "locations.csv" ? (
            <Badge variant="outline" colorPalette={missing.length ? "red" : "gray"} flexShrink={0}>
              {missing.length ? `Colonne ${missing.join(", ")} absente` : `${batch.rows.length} lignes sources`}
            </Badge>
          ) : (
            <Badge variant="outline" flexShrink={0}>
              Aperçu explicatif
            </Badge>
          )}
        </Flex>
        <Box flex="1" minH="0" overflow="auto" p="3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={file} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
              {file === "locations.csv" && (
                <Stack gap="2">
                  <Box className="table-scroll" tabIndex={0} role="region" aria-label="Aperçu du fichier">
                    <table className="ce-table mono">
                      <thead>
                        <tr>
                          {batch.columns.map((c) => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {batch.rows.slice(0, 6).map((r, n) => (
                          <tr key={n}>
                            {batch.columns.map((c) => (
                              <td key={c}>{r[c as keyof typeof r]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                  <Text fontSize="xs" color="app.muted">
                    Les 6 premières lignes sont affichées.{" "}
                    <Link href={`${FILES}data/${batch.id}.csv`} download color="brand.fg" fontWeight="semibold" className="dl-link">
                      Télécharger les {batch.rows.length} lignes
                    </Link>
                  </Text>
                </Stack>
              )}
              {file === "referentiels.json" && (
                <Stack gap="3">
                  <Box className="refs-grid">
                    {(
                      [
                        ["Campus", 6],
                        ["Guichets", 12],
                        ["Associations", 2000],
                        ["Types de matériel", 120],
                      ] as const
                    ).map(([n, v]) => (
                      <div key={n}>
                        <b>
                          <Count value={v} format={number} reduced={reduced} />
                        </b>
                        <span>{n}</span>
                      </div>
                    ))}
                  </Box>
                  <Text fontSize="sm" color="app.muted">
                    Un site référence un campus. Un équipement référence une catégorie.
                  </Text>
                </Stack>
              )}
              {file === "manifest.json" && (
                <Stack gap="2" className="manifest">
                  <Text fontSize="sm">Empreintes SHA-256 réelles des sources de cette démonstration.</Text>
                  <Text fontSize="xs" fontWeight="bold">
                    locations.csv
                  </Text>
                  <Code className="hash">{batch.hash}</Code>
                  <Text fontSize="xs" fontWeight="bold">
                    referentiels.json
                  </Text>
                  <Code className="hash">{batch.refsHash}</Code>
                  <Text fontSize="xs" color="app.muted">
                    Le manifeste protège l’intégrité des fichiers. Il ne remplace pas les règles métier.
                  </Text>
                </Stack>
              )}
              {file === "READY" && (
                <Flex direction="column" align="center" textAlign="center" gap="2" py="4" className="ready-view">
                  <motion.span className="ready-check" initial={reduced ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 320, damping: 14 }}>
                    <Icon name="check" size={28} />
                  </motion.span>
                  <Text fontFamily="heading" fontWeight="semibold" fontSize="lg">
                    Le dossier est complet.
                  </Text>
                  <Text fontSize="sm" color="app.muted" maxW="26rem">
                    Le générateur publie le lot en une seule opération. La surveillance peut le découvrir puis vérifier les empreintes.
                  </Text>
                </Flex>
              )}
            </motion.div>
          </AnimatePresence>
        </Box>
      </Flex>
    </Flex>
  );
}
