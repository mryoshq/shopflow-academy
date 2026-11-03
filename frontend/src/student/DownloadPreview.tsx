import { PdfLoadBoundary } from "./PdfLoadBoundary"
import { lazy, Suspense, useEffect, useState } from "react"
import { Box, Button, CloseButton, Dialog, Flex, Link, Portal, Text } from "@chakra-ui/react"
import type { DownloadFile } from "../studioTypes"
import { t, tn } from "../i18n"
import { Highlighted, MONO } from "./displays"
import { downloadExtension, fetchCodePreview, previewHighlighting } from "./downloadPreviewData"

const PdfPreview = lazy(() => import("./PdfPreview").then((module) => ({ default: module.PdfPreview })))

export function DownloadPreview({ file, onClose }: { file: DownloadFile; onClose: () => void }) {
  const isPdf = downloadExtension(file) === "pdf"
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null)
  useEffect(() => {
    if (isPdf) return
    let alive = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    setCode(null); setError(false); setCopyState(null)
    void fetchCodePreview(file, controller.signal).then((text) => { if (alive) setCode(text) }).catch(() => { if (alive) setError(true) })
      .finally(() => clearTimeout(timeout))
    return () => { alive = false; clearTimeout(timeout); controller.abort() }
  }, [file.id, retry, isPdf])
  const ext = downloadExtension(file)
  const language = ext === "sql" ? "sql" : ext === "py" ? "python" : "text"
  const highlight = code !== null && previewHighlighting(code)
  return <Dialog.Root open onOpenChange={(event) => { if (!event.open) onClose() }} size="cover" scrollBehavior="inside" lazyMount unmountOnExit>
    <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content bg="app.surface" color="app.ink">
      <Dialog.Header pr="14"><Dialog.Title>{t("Aperçu : {{title}}", { title: file.title })}</Dialog.Title></Dialog.Header>
      <Dialog.Body>
        <Text fontSize="sm" color="app.muted" mb="3">{file.name} · {isPdf ? t("Lecture seule, liens et formulaires désactivés.") : t("Lecture seule, aucun code exécuté.")}</Text>
        {isPdf ? <PdfLoadBoundary onReload={() => window.location.reload()}><Suspense fallback={<Text role="status">{t("Chargement de l’aperçu…")}</Text>}><PdfPreview file={file} /></Suspense></PdfLoadBoundary> : error ? <Box role="status"><Text>{t("Aperçu indisponible. Vous pouvez télécharger le fichier.")}</Text><Button mt="2" variant="outline" onClick={() => setRetry((n) => n + 1)}>{t("Réessayer")}</Button></Box>
          : code === null ? <Text role="status">{t("Chargement de l’aperçu…")}</Text>
          : <>
            <Flex justify="space-between" gap="2" align="center" mb="2" wrap="wrap">
              <Text fontSize="sm">{tn("{{count}} ligne", code.split("\n").length)}</Text>
              <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopyState("copied") } catch { setCopyState("failed") } }}>{copyState === "copied" ? t("Copié") : t("Copier le texte")}</Button>
            </Flex>
            {copyState === "failed" && <Text role="status" color="red.fg">{t("Copie impossible. Réessayez ou sélectionnez le texte.")}</Text>}
            <Box as="pre" aria-label={t("Contenu de {{name}}", { name: file.name })} tabIndex={0} m="0" p="3" bg="code.bg" color="code.fg" rounded="lg" overflow="auto" maxH="65vh" fontSize="sm" css={{ fontFamily: MONO, tabSize: 4 }}>
              <code>{code.split("\n").map((line, index) => <Box as="span" display="block" key={index}>
                <Box as="span" aria-hidden="true" display="inline-block" minW="10" pr="3" textAlign="right" color="code.comment" userSelect="none">{index + 1}</Box>{highlight ? <Highlighted code={line || " "} language={language} /> : line || " "}{"\n"}
              </Box>)}</code>
            </Box>
          </>}
      </Dialog.Body>
      <Dialog.Footer><Link href={`/api/v1/downloads/${file.id}`} download={file.name} color="brand.fg">{t("Télécharger")}</Link><Button variant="outline" onClick={onClose}>{t("Fermer")}</Button></Dialog.Footer>
      <Dialog.CloseTrigger asChild position="absolute" top="3" right="3"><CloseButton aria-label={t("Fermer l’aperçu")} /></Dialog.CloseTrigger>
    </Dialog.Content></Dialog.Positioner></Portal>
  </Dialog.Root>
}
