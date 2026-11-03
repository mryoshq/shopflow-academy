import { useEffect, useRef, useState } from "react"
import { Box, Button, Flex, NativeSelect, Text } from "@chakra-ui/react"
import { AnnotationMode, getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import type { DownloadFile } from "../studioTypes"
import { t } from "../i18n"
import { fetchDownloadBytes, MAX_PDF_PREVIEW_BYTES, pdfPreviewable } from "./downloadPreviewData"

// Vite emits this worker next to the bundle, same version and origin. No third-party viewer or CDN.
GlobalWorkerOptions.workerSrc = workerUrl
export const MAX_PDF_PREVIEW_PAGES = 200
const MAX_CANVAS_PIXELS = 12_000_000

/** Canvas + inert extracted text only. No scripting manager, annotation layer, embedded links or XFA. */
export function PdfPreview({ file }: { file: DownloadFile }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [text, setText] = useState("")
  const [error, setError] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    let task: PDFDocumentLoadingTask | undefined
    const controller = new AbortController()
    const timeout = window.setTimeout(() => { controller.abort(); void task?.destroy(); if (alive) setError(true) }, 20_000)
    setDocument(null); setError(false); setPage(1); setText("")
    async function load() {
      try {
        if (!pdfPreviewable(file)) throw new Error("unsupported")
        const bytes = await fetchDownloadBytes(file, MAX_PDF_PREVIEW_BYTES, new Set(["application/pdf"]), controller.signal)
        if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("not-pdf")
        if (!alive || controller.signal.aborted) return
        task = getDocument({ data: bytes, enableXfa: false, useWasm: false, useWorkerFetch: false,
          disableFontFace: true, useSystemFonts: true, maxImageSize: MAX_CANVAS_PIXELS, stopAtErrors: true })
        const pdf = await task.promise
        if (!alive || controller.signal.aborted) { await task.destroy(); return }
        if (pdf.numPages < 1 || pdf.numPages > MAX_PDF_PREVIEW_PAGES) { await task.destroy(); throw new Error("too-many-pages") }
        setDocument(pdf)
      } catch { if (alive) setError(true) }
      finally { clearTimeout(timeout) }
    }
    void load()
    return () => { alive = false; clearTimeout(timeout); controller.abort(); void task?.destroy() }
  }, [file.id, retry])
  useEffect(() => {
    if (!document || error) return
    let alive = true
    let renderingTask: RenderTask | undefined
    let timeout: number | undefined
    setRendering(true); setText("")
    timeout = window.setTimeout(() => { renderingTask?.cancel(); void document.loadingTask.destroy(); if (alive) { setError(true); setRendering(false) } }, 15_000)
    async function render() {
      try {
        const pdfPage = await document!.getPage(page)
        if (!alive || !canvas.current) return
        const viewport = pdfPage.getViewport({ scale: zoom })
        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        const width = Math.ceil(viewport.width * outputScale), height = Math.ceil(viewport.height * outputScale)
        if (!Number.isFinite(width * height) || width < 1 || height < 1 || width * height > MAX_CANVAS_PIXELS) throw new Error("page-too-large")
        canvas.current.width = width; canvas.current.height = height
        canvas.current.style.width = `${Math.ceil(viewport.width)}px`; canvas.current.style.height = `${Math.ceil(viewport.height)}px`
        renderingTask = pdfPage.render({ canvas: canvas.current, viewport, annotationMode: AnnotationMode.DISABLE,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] })
        const [, extracted] = await Promise.all([renderingTask.promise, pdfPage.getTextContent()])
        if (alive) setText(extracted.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").slice(0, 100_000))
      } catch { if (alive) setError(true) }
      finally { clearTimeout(timeout); if (alive) setRendering(false) }
    }
    void render()
    return () => { alive = false; clearTimeout(timeout); renderingTask?.cancel() }
  }, [document, page, zoom, error])
  if (error) return <Box role="status"><Text>{t("Aperçu indisponible. Vous pouvez télécharger le fichier.")}</Text><Button mt="2" variant="outline" onClick={() => setRetry((n) => n + 1)}>{t("Réessayer")}</Button></Box>
  if (!document) return <Text role="status">{t("Chargement de l’aperçu…")}</Text>
  return <Box>
    <Flex gap="2" wrap="wrap" align="center" mb="3" role="group" aria-label={t("Navigation du PDF")}>
      <Button size="sm" variant="outline" disabled={page <= 1 || rendering} onClick={() => setPage((n) => n - 1)}>{t("Page précédente")}</Button>
      <Text role="status" fontSize="sm">{t("Page {{page}} sur {{total}}", { page, total: document.numPages })}</Text>
      <Button size="sm" variant="outline" disabled={page >= document.numPages || rendering} onClick={() => setPage((n) => n + 1)}>{t("Page suivante")}</Button>
      <NativeSelect.Root w="auto" disabled={rendering}><NativeSelect.Field aria-label={t("Zoom du PDF")} value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value * 100} %</option>)}
      </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
    </Flex>
    {rendering && <Text role="status">{t("Chargement de la page…")}</Text>}
    <Box overflow="auto" maxH="60vh" borderWidth="1px" borderColor="app.border" tabIndex={0} role="region" aria-label={t("Page PDF (défilement horizontal et vertical)")}>
      <canvas ref={canvas} aria-hidden="true" style={{ display: "block", background: "white" }} />
    </Box>
    <Box as="details" mt="3"><Box as="summary" cursor="pointer" fontWeight="semibold">{t("Texte de la page (accessible)")}</Box>
      <Text as="pre" whiteSpace="pre-wrap" overflowWrap="anywhere" fontFamily="inherit" fontSize="sm" p="3">{text || (rendering ? t("Chargement de la page…") : t("Cette page ne contient pas de texte extractible. Le téléchargement reste disponible."))}</Text>
    </Box>
  </Box>
}
