import { useRef, type ReactNode, type RefObject } from "react";
import { Box, Button, CloseButton, Code, Dialog, Flex, Input, InputGroup, Portal, Stack, Text } from "@chakra-ui/react";
import { Icon } from "./icons";
import { BATCH, columns, files, glossary, money, services } from "./model";
import { expected, questions, type Modal } from "./content";

export interface DialogsProps {
  /** The experience root: dialogs render inside it, so they also show in presentation mode. */
  container: RefObject<HTMLDivElement | null>;
  modal: Modal;
  onClose: () => void;
  fileIndex: number;
  query: string;
  onQuery: (q: string) => void;
  question: number;
  onQuestion: (n: number) => void;
  showAnswer: boolean;
  onShowAnswer: () => void;
  onIllustrate: () => void;
}

const titles: Record<Exclude<Modal, null | "file">, string> = {
  glossary: "Le glossaire du voyage.",
  architecture: "Cinq services. Des rôles distincts.",
  question: "Prenez un instant.",
  about: "Une simulation, en toute transparence.",
};

function Def({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box py="2.5" borderBottomWidth="1px" borderColor="app.border">
      <Text fontWeight="bold" fontSize="sm" color="brand.fg">
        {title}
      </Text>
      <Text color="app.muted" fontSize="sm" lineHeight="1.55">
        {children}
      </Text>
    </Box>
  );
}

export function Dialogs(p: DialogsProps) {
  // Keep the last content on screen while the dialog animates out.
  const last = useRef<Exclude<Modal, null>>("about");
  if (p.modal) last.current = p.modal;
  const m = last.current;
  const hits = Object.entries(glossary).filter(([k, v]) => (k + " " + v).toLowerCase().includes(p.query.toLowerCase()));
  const file = files[p.fileIndex];

  return (
    <Dialog.Root open={!!p.modal} onOpenChange={(e) => !e.open && p.onClose()} placement="center" scrollBehavior="inside" size="lg">
      <Portal container={p.container}>
        <Dialog.Backdrop />
        <Dialog.Positioner px="3">
          <Dialog.Content bg="app.surface" color="app.ink" rounded="2xl" maxH="86dvh">
            <Dialog.Header pb="1" flexDirection="column" alignItems="flex-start" gap="1">
              <Text textStyle="overline" fontSize="2xs" color="brand.fg">
                ShopFlow
              </Text>
              <Dialog.Title fontFamily="heading" fontSize="2xl" fontWeight="semibold" letterSpacing="-0.02em">
                {m === "file" ? file.name : titles[m]}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" aria-label="Fermer" />
            </Dialog.CloseTrigger>
            <Dialog.Body pb="6">
              {m === "glossary" && (
                <>
                  <InputGroup startElement={<Icon name="search" size={15} />} mb="2">
                    <Input
                      aria-label="Rechercher dans le glossaire"
                      placeholder="Rechercher un concept…"
                      value={p.query}
                      onChange={(e) => p.onQuery(e.target.value)}
                      size="sm"
                    />
                  </InputGroup>
                  {hits.length === 0 && <Text fontSize="sm">Aucun concept ne correspond.</Text>}
                  {hits.map(([k, v]) => (
                    <Def key={k} title={k}>
                      {v}
                    </Def>
                  ))}
                </>
              )}

              {m === "architecture" && (
                <>
                  <Text color="app.muted" mb="2">
                    Airflow orchestre. Chaque stockage a un rôle. TimescaleDB est une extension du PostgreSQL métier.
                  </Text>
                  {services.map((s, i) => (
                    <Def key={i} title={`${s.name} · ${s.label}`}>
                      {s.role}
                    </Def>
                  ))}
                  <Box bg="brand.subtle" rounded="lg" p="3" mt="3" fontSize="sm" color="app.ink" lineHeight="1.6">
                    <Text fontWeight="bold" color="app.ink">
                      Trois lectures
                    </Text>
                    <b>Contrôle :</b> les flèches du DAG sont les dépendances Airflow.
                    <br />
                    <b>Données :</b> CSV → PostgreSQL ; JSONL → MongoDB ; agrégats et exceptions → Redis. Dans la simulation, ce sont les paquets qui volent.
                    <br />
                    <b>Observabilité :</b> tentatives dans monitoring.task_attempts, avec time_bucket.
                  </Box>
                </>
              )}

              {m === "file" && (
                <>
                  <Text color="app.muted" mb="3">
                    {file.type} · {file.count}. {file.description}
                  </Text>
                  <Box as="pre" whiteSpace="pre-wrap" bg="brand.subtle" rounded="lg" p="3" fontFamily="mono" fontSize="xs" color="app.ink">
                    {file.content}
                  </Box>
                  {p.fileIndex === 0 && (
                    <Flex wrap="wrap" gap="1.5" mt="3">
                      {columns.map((c) => (
                        <Code key={c} size="sm">
                          {c}
                        </Code>
                      ))}
                    </Flex>
                  )}
                </>
              )}

              {m === "question" && (
                <>
                  <Text fontFamily="heading" fontSize="xl" mb="3" lineHeight="1.3">
                    {questions[p.question].q}
                  </Text>
                  {p.showAnswer ? (
                    <Box bg="brand.subtle" rounded="lg" p="3">
                      <Text color="app.ink" fontSize="sm" lineHeight="1.55">
                        {questions[p.question].a}
                      </Text>
                      <Button size="sm" colorPalette="brand" mt="3" onClick={p.onIllustrate}>
                        Voir dans le pipeline
                      </Button>
                    </Box>
                  ) : (
                    <Button size="sm" colorPalette="brand" onClick={p.onShowAnswer}>
                      Découvrir la réponse
                    </Button>
                  )}
                  <Stack gap="0" mt="4">
                    {questions.map((q, i) => (
                      <Button
                        key={i}
                        variant="ghost"
                        justifyContent="flex-start"
                        textAlign="left"
                        whiteSpace="normal"
                        h="auto"
                        py="2.5"
                        px="1"
                        rounded="none"
                        borderBottomWidth="1px"
                        borderColor="app.border"
                        fontWeight={i === p.question ? "bold" : "medium"}
                        color="brand.fg"
                        onClick={() => p.onQuestion(i)}
                      >
                        {q.q}
                      </Button>
                    ))}
                  </Stack>
                </>
              )}

              {m === "about" && (
                <>
                  <Text color="app.muted" mb="2">
                    Une expérience autonome pour comprendre le pipeline Docker ShopFlow, sans connexion aux services.
                  </Text>
                  <Def title="Sources et limites">
                    Les valeurs viennent du cahier des charges. Le kit Docker n’est pas disponible. Documents, empreintes et motifs exacts de rejet ne sont pas inventés.
                  </Def>
                  <Def title="Illustratif, et signalé">
                    Durées du journal et identifiants L01–L{String(BATCH.source).padStart(2, "0")} et E01–E{String(BATCH.events.source).padStart(2, "0")} servent à expliquer. Les dates métier ne sont pas des heures d’exécution.
                  </Def>
                  <Def title="Un seul laboratoire">
                    Lot de {BATCH.source} lignes, CA final de {money(expected().revenue)} MAD. Distinct d’un laboratoire Python de 12 lignes.
                  </Def>
                  <Def title="Raccourcis">Espace : lecture / pause · Flèches : étape précédente / suivante.</Def>
                </>
              )}
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
