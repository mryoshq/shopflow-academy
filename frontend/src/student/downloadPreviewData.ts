import type { DownloadFile } from "../studioTypes"

export const MAX_CODE_PREVIEW_BYTES = 256 * 1024
export const MAX_CODE_PREVIEW_LINES = 4000
const ID = /^[0-9a-f]{16}\.(pdf|docx|zip|csv|sql|py|md)$/
const TEXT_MIME = new Set(["text/plain", "text/csv", "text/markdown"])

export function downloadExtension(file: DownloadFile): string {
  const ext = file.id.split(".").pop() ?? ""
  return ID.test(file.id) && file.name.toLowerCase().endsWith(`.${ext}`) ? ext : ""
}
export function codePreviewable(file: DownloadFile): boolean {
  return ["sql", "py", "csv", "md"].includes(downloadExtension(file)) && Number.isFinite(file.size) && file.size >= 0 && file.size <= MAX_CODE_PREVIEW_BYTES
}

/** Fetch exactly the original protected attachment; never follow redirects or accept an arbitrary URL.
 * Cap the stream before decoding/parsing, even when metadata or Content-Length is missing or false.
 */
export async function fetchDownloadBytes(file: DownloadFile, limit: number, mimeTypes: ReadonlySet<string>, signal: AbortSignal): Promise<Uint8Array> {
  if (!downloadExtension(file) || file.size < 0 || !Number.isFinite(file.size) || file.size > limit) throw new Error("unsupported")
  const response = await fetch(`/api/v1/downloads/${file.id}`, { credentials: "same-origin", cache: "no-store", redirect: "error", signal })
  if (response.status === 401) window.dispatchEvent(new Event("academy:unauthorized"))
  if (!response.ok) throw new Error("unavailable")
  const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? ""
  const size = Number(response.headers.get("content-length") ?? 0)
  if (!mimeTypes.has(mime) || size > limit || !response.body) { await response.body?.cancel(); throw new Error("unsupported") }
  const reader = response.body.getReader()
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener("abort", abort, { once: true })
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError")
      const { done, value } = await reader.read()
      if (signal.aborted) throw new DOMException("Aborted", "AbortError")
      if (done) break
      length += value.byteLength
      if (length > limit) throw new Error("too-large")
      chunks.push(value)
    }
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => {}); reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

export async function fetchCodePreview(file: DownloadFile, signal: AbortSignal): Promise<string> {
  if (!codePreviewable(file)) throw new Error("unsupported")
  const bytes = await fetchDownloadBytes(file, MAX_CODE_PREVIEW_BYTES, TEXT_MIME, signal)
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  // Reject binary controls; show Markdown/HTML-looking source as inert text only.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) || text.split("\n").length > MAX_CODE_PREVIEW_LINES) throw new Error("unsupported")
  return text
}

export const MAX_PDF_PREVIEW_BYTES = 10 * 1024 * 1024
export function pdfPreviewable(file: DownloadFile): boolean {
  return downloadExtension(file) === "pdf" && Number.isFinite(file.size) && file.size >= 0 && file.size <= MAX_PDF_PREVIEW_BYTES
}

/** Avoid creating one React node per token for unusually long or punctuation-heavy source. */
export function previewHighlighting(code: string): boolean {
  return code.length <= 20_000 && code.split("\n").every((line) => line.length <= 2000)
}
