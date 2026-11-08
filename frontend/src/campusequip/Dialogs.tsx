import { useRef, type RefObject } from "react";
import { Box, CloseButton, Code, Dialog, Input, InputGroup, Link, Portal, Stack, Text } from "@chakra-ui/react";
import { glossary, source } from "./model";
import { FILES, type Modal } from "./content";
import { Icon } from "./icons";

export interface DialogsProps {
  /** The experience root: dialogs render inside it, so they also show in presentation mode. */
  container: RefObject<HTMLDivElement | null>;
  modal: Modal;
  onClose: () => void;
  query: string;
  onQuery: (q: string) => void;
}

/** « Glossaire » and « Sources et sujet » (owner's texts). */
export function Dialogs(p: DialogsProps) {
  // Keep the last content on screen while the dialog animates out.
  const last = useRef<Exclude<Modal, null>>("glossary");
  if (p.modal) last.current = p.modal;
  const m = last.current;
  const hits = Object.entries(glossary).filter(([k, v]) => (k + " " + v).toLowerCase().includes(p.query.toLowerCase()));

  return (
    <Dialog.Root open={!!p.modal} onOpenChange={(e) => !e.open && p.onClose()} placement="center" scrollBehavior="inside" size="lg">
      <Portal container={p.container}>
        <Dialog.Backdrop />
        <Dialog.Positioner px="3">
          <Dialog.Content bg="app.surface" color="app.ink" rounded="2xl" maxH="86dvh">
            <Dialog.Header pb="1" flexDirection="column" alignItems="flex-start" gap="1">
              <Text textStyle="overline" fontSize="2xs" color="brand.fg" letterSpacing="0.12em">
                CampusEquip · Les repères
              </Text>
              <Dialog.Title fontFamily="heading" fontSize="2xl" fontWeight="semibold" letterSpacing="-0.02em">
                {m === "sources" ? "Le même sujet. Les mêmes règles." : "Les mots du voyage."}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" aria-label="Fermer la fenêtre" />
            </Dialog.CloseTrigger>
            <Dialog.Body pb="6">
              {m === "glossary" ? (
                <>
                  <InputGroup startElement={<Icon name="search" size={15} />} mb="2">
                    <Input aria-label="Rechercher un concept" placeholder="Rechercher un concept…" value={p.query} onChange={(e) => p.onQuery(e.target.value)} size="sm" />
                  </InputGroup>
                  {hits.length === 0 && <Text fontSize="sm">Aucun concept ne correspond.</Text>}
                  {hits.map(([k, v]) => (
                    <Box key={k} py="2.5" borderBottomWidth="1px" borderColor="app.border">
                      <Text fontWeight="bold" fontSize="sm" color="brand.fg">
                        {k}
                      </Text>
                      <Text color="app.muted" fontSize="sm" lineHeight="1.55">
                        {v}
                      </Text>
                    </Box>
                  ))}
                </>
              ) : (
                <Stack gap="3" fontSize="sm">
                  <Text>Cette expérience suit le sujet corrigé du {source.subjectDate}, vérifié le {source.checked}. Seuls SQL et Python sont à réaliser maintenant.</Text>
                  <Link href={FILES + "documents/Sujet_CampusEquip_axes_1_2.pdf"} target="_blank" rel="noreferrer" className="download-link">
                    <Icon name="file" size={18} /> Ouvrir le sujet étudiant corrigé <Icon name="arrow" size={15} />
                  </Link>
                  <Text fontWeight="bold">Des données traçables</Text>
                  <Text color="app.muted">Les lots sont produits par le générateur étudiant : graine 42, 20 contrats, profils propre et mixte. Les défauts de structure et le conflit inter-lots sont des modifications pédagogiques signalées.</Text>
                  <Link href={FILES + "data/provenance.json"} download color="brand.fg" fontWeight="semibold" className="dl-link">
                    Consulter les empreintes des sources
                  </Link>
                  <Text fontWeight="bold">Une simulation, pas une preuve d’intégration</Text>
                  <Text color="app.muted">Les contrôles et compteurs sont calculés dans le navigateur. Les états PostgreSQL sont simulés. Il n’y a ni connexion à une base, ni exécution Python, ni validation du corrigé complet.</Text>
                  <Text fontWeight="bold">Votre cadre de travail</Text>
                  <Text color="app.muted">Remise le 21 novembre 2026. Travail en binôme. Socle : 10 points ; bonus : jusqu’à 5 points. Cadre global des quatre axes : 20 + 10 bonus.</Text>
                  <Text fontSize="xs" color="app.muted">
                    Les interactions expliquent les règles du sujet à partir des seules sources étudiantes.
                  </Text>
                  <details className="column-guide">
                    <summary>Empreinte du PDF de référence</summary>
                    <Code className="hash" mt="2">
                      {source.subjectSha256}
                    </Code>
                  </details>
                </Stack>
              )}
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
