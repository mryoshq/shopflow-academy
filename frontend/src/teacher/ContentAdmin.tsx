import { locale, msg, t } from "../i18n"
import { useEffect, useState } from "react"
import { Box, Button, Field, Flex, Heading, Input, NativeSelect, Stack, Text } from "@chakra-ui/react"
import { api, ApiError, csrfToken } from "../api"
import type { Release } from "../studioTypes"

export type ImportReport = { dry_run: boolean; valid?: boolean; id?: number; title: string; slug: string; objectives: number; modules: number; chapters: number; missions: number; missions_without_definition: number; slug_available: boolean }
type ImportError = { path: string; message: string }
export type SearchResult = { id: number; slug: string; title: string; status: "draft" | "published" | "archived"; owner: string }
type HistoryItem = { id: number; action: string; resource_type: string; actor: string; created_at: string | null; has_backup: boolean }

const ACTION_LABELS: Record<string, string> = {
  "course.create": msg("Cours créé"), "course.update": msg("Cours modifié"), "course.publish": msg("Version publiée"), "course.archive": msg("Cours archivé"),
  "course.import": msg("Cours importé"), "course.restore": msg("Brouillon restauré depuis une version"), "course.delete": msg("Cours supprimé"),
  "objective.create": msg("Objectif ajouté"), "objective.update": msg("Objectif modifié"), "objective.delete": msg("Objectif supprimé"),
  "module.create": msg("Module ajouté"), "module.update": msg("Module modifié"), "module.delete": msg("Module supprimé"),
  "chapter.create": msg("Chapitre ajouté"), "chapter.update": msg("Chapitre modifié"), "chapter.delete": msg("Chapitre supprimé"),
  "mission.create": msg("Mission ajoutée"), "mission.update": msg("Mission modifiée"), "mission.meta.update": msg("Mission renommée ou déplacée"), "mission.delete": msg("Mission supprimée"),
}

export function slugify(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function importErrors(error: unknown): { message: string; errors: ImportError[] } {
  if (error instanceof ApiError) {
    if (error.status === 409) return { message: t("Cet identifiant de cours existe déjà : choisissez-en un autre."), errors: [] }
    return { message: t("Le fichier ne respecte pas le format attendu."), errors: (error as ApiError & { errors?: ImportError[] }).errors ?? [] }
  }
  return { message: t("Connexion interrompue. Réessayez."), errors: [] }
}

/** POST with the raw error body, so that the validation report (path + message) can be shown. */
async function postImport(document: unknown, slug: string, title: string, dryRun: boolean): Promise<ImportReport> {
  const response = await fetch(`/api/v1/teacher/courses/import${dryRun ? "?dry_run=true" : ""}`, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
    body: JSON.stringify({ document, slug: slug || undefined, title: title || undefined }),
  })
  if (response.status === 401) window.dispatchEvent(new Event("academy:unauthorized"))
  if (!response.ok) {
    let body: { detail?: { errors?: ImportError[]; message?: string } | unknown } = {}
    try { body = await response.json() } catch { /* empty */ }
    const error = new ApiError(response.status, "import failed") as ApiError & { errors?: ImportError[] }
    const detail = body.detail as { errors?: ImportError[] } | undefined
    error.errors = Array.isArray(detail?.errors) ? detail!.errors : []
    throw error
  }
  return await response.json() as ImportReport
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, "utf-8")
  })
}

export function CourseImport({ onImported }: { onImported: (id: number) => void }) {
  const [document, setDocument] = useState<unknown>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [slug, setSlug] = useState("")
  const [title, setTitle] = useState("")
  const [problem, setProblem] = useState<{ message: string; errors: ImportError[] } | null>(null)
  const [busy, setBusy] = useState(false)

  async function check(next: unknown, nextSlug = slug, nextTitle = title) {
    setBusy(true)
    setProblem(null)
    try { setReport(await postImport(next, nextSlug, nextTitle, true)) }
    catch (error) { setReport(null); setProblem(importErrors(error)) }
    finally { setBusy(false) }
  }

  async function onFile(file: File | undefined) {
    setReport(null)
    setProblem(null)
    if (!file) return
    if (file.size > 900_000) return setProblem({ message: "Fichier trop volumineux (900 Ko maximum).", errors: [] })
    try {
      const parsed = JSON.parse(await readText(file))
      setDocument(parsed)
      setSlug("")
      setTitle("")
      await check(parsed, "", "")
    } catch {
      setProblem({ message: t("Ce fichier n’est pas un JSON lisible."), errors: [] })
    }
  }

  async function confirm() {
    if (!document) return
    setBusy(true)
    try {
      const created = await postImport(document, slug, title, false)
      setDocument(null)
      setReport(null)
      if (created.id) onImported(created.id)
    } catch (error) { setProblem(importErrors(error)) }
    finally { setBusy(false) }
  }

  return <Stack gap="3">
    <Heading as="h4" size="sm">{t("Importer un cours (JSON)")}</Heading>
    <Text fontSize="sm" color="app.muted">{t("Le fichier est vérifié avant toute création. L’import crée toujours un nouveau brouillon.")}</Text>
    <input type="file" accept=".json,application/json" aria-label={t("Fichier de cours JSON")} onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = "" }} />
    {problem && <Box role="alert" bg="red.subtle" color="red.fg" p="3" rounded="md" fontSize="sm">
      <Text fontWeight="semibold">{problem.message}</Text>
      {problem.errors.length > 0 && <Stack as="ul" gap="1" mt="2" pl="4">{problem.errors.slice(0, 12).map((item, index) =>
        <Text as="li" key={index}><Text as="span" fontFamily="mono">{item.path || "document"}</Text> : {item.message}</Text>)}</Stack>}
    </Box>}
    {report && <Stack gap="2" bg="brand.subtle" p="3" rounded="md" fontSize="sm" role="status">
      <Text fontWeight="semibold">{t("Fichier valide : «")}{" "}{report.title} »</Text>
      <Text>{report.objectives} {t("objectifs ·")}{" "}{report.modules} {t("module(s) ·")}{" "}{report.chapters} {t("chapitre(s) ·")}{" "}{report.missions} {t("mission(s)")}{report.missions_without_definition ? t(" dont {{missions_without_definition}} à compléter", { missions_without_definition: report.missions_without_definition }) : ""}</Text>
      {!report.slug_available && <Text color="saffron.fg">{t("L’identifiant «")}{" "}{report.slug} {t("» existe déjà : donnez un nouveau titre.")}</Text>}
      <Field.Root><Field.Label fontSize="sm">{t("Titre du nouveau cours")}</Field.Label>
        <Input size="sm" value={title} placeholder={report.title} onChange={(event) => { setTitle(event.target.value); setSlug(slugify(event.target.value)) }} /></Field.Root>
      <Flex gap="2" wrap="wrap">
        <Button size="sm" variant="outline" onClick={() => void check(document)} loading={busy}>{t("Vérifier à nouveau")}</Button>
        <Button size="sm" colorPalette="brand" onClick={() => void confirm()} loading={busy} disabled={!report.slug_available && !slug}>{t("Importer comme nouveau brouillon")}</Button>
      </Flex>
    </Stack>}
  </Stack>
}

export function CourseSearch({ onSelect, selectedId, refreshKey }: { onSelect: (id: number) => void; selectedId: number | null; refreshKey: number }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const [sort, setSort] = useState("recent")
  const [results, setResults] = useState<SearchResult[] | null>(null)
  useEffect(() => {
    let live = true
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, status, sort })
      api<SearchResult[]>(`/teacher/course-search?${params}`).then((items) => { if (live) setResults(items) }).catch(() => { if (live) setResults([]) })
    }, 200)
    return () => { live = false; window.clearTimeout(timer) }
  }, [query, status, sort, refreshKey])
  return <Stack gap="2">
    <Input size="sm" aria-label={t("Rechercher un cours")} placeholder={t("Rechercher un cours…")} value={query} onChange={(event) => setQuery(event.target.value)} />
    <Flex gap="2">
      <NativeSelect.Root size="sm"><NativeSelect.Field aria-label={t("Filtrer par état")} value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">{t("Tous les états")}</option><option value="draft">{t("Brouillons")}</option><option value="published">{t("Publiés")}</option><option value="archived">{t("Archivés")}</option>
      </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
      <NativeSelect.Root size="sm"><NativeSelect.Field aria-label={t("Trier")} value={sort} onChange={(event) => setSort(event.target.value)}>
        <option value="recent">{t("Plus récents")}</option><option value="title">{t("Titre A→Z")}</option>
      </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
    </Flex>
    {results === null ? <Text fontSize="sm" color="app.muted">{t("Recherche…")}</Text> : results.length === 0
      ? <Text fontSize="sm" color="app.muted">{t("Aucun cours ne correspond.")}</Text>
      : <Stack gap="1.5" maxH="80" overflowY="auto" as="ul" listStyleType="none" p="0" m="0">{results.map((item) => <Box as="li" key={item.id}>
        <Button size="sm" w="full" variant={selectedId === item.id ? "solid" : "outline"} colorPalette="brand" justifyContent="start" whiteSpace="normal" h="auto" py="2" textAlign="left" onClick={() => onSelect(item.id)}>
          {item.title} · {item.status === "archived" ? t("Archivé") : item.status === "published" ? t("Publié") : t("Brouillon")}
        </Button></Box>)}</Stack>}
  </Stack>
}

export function ReleaseTools({ courseId, releases, archived, onRestored, refreshKey }: { courseId: number; releases: Release[]; archived: boolean; onRestored: () => void; refreshKey: number }) {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    api<HistoryItem[]>(`/teacher/courses/${courseId}/history`).then((items) => { if (live) setHistory(items) }).catch(() => undefined)
    return () => { live = false }
  }, [courseId, refreshKey])

  async function restore(release: Release) {
    setBusy(true)
    setNotice("")
    try {
      const result = await api<{ restored_missions: number }>(`/teacher/courses/${courseId}/restore`, "POST", { release_id: release.id })
      setNotice(t("Brouillon restauré depuis la version {{version}} ({{restored_missions}} missions). L’ancien brouillon est sauvegardé dans l’historique.", { version: release.version, restored_missions: result.restored_missions }))
      setHistory(await api<HistoryItem[]>(`/teacher/courses/${courseId}/history`))
      onRestored()
    } catch (error) {
      setNotice(error instanceof ApiError ? `Restauration impossible : ${error.message}` : t("Connexion interrompue."))
    } finally { setBusy(false) }
  }

  return <Stack gap="4">
    <Flex gap="2" wrap="wrap"><Button size="sm" variant="outline" asChild><a href={`/api/v1/teacher/courses/${courseId}/export`} download>{t("Exporter le brouillon (JSON)")}</a></Button></Flex>
    {releases.length > 0 && <Stack gap="2" as="ul" listStyleType="none" p="0" m="0">{releases.map((release) => <Flex as="li" key={release.id} gap="2" align="center" wrap="wrap" p="2" borderWidth="1px" borderColor="app.border" rounded="md">
      <Text flex="1" fontSize="sm">{t("Version")}{" "}{release.version} · {release.status === "archived" ? t("archivée") : t("publiée")} · {new Date(release.published_at).toLocaleDateString(locale())}</Text>
      <Button size="xs" variant="outline" asChild><a href={`/api/v1/teacher/releases/${release.id}/export`} download aria-label={t("Exporter la version {{version}}", { version: release.version })}>{t("Exporter")}</a></Button>
      <Button size="xs" variant="outline" colorPalette="saffron" disabled={archived} loading={busy} onClick={() => void restore(release)} aria-label={t("Restaurer le brouillon depuis la version {{version}}", { version: release.version })}>{t("Restaurer dans le brouillon")}</Button>
    </Flex>)}</Stack>}
    {notice && <Text role="status" fontSize="sm" color="brand.fg">{notice}</Text>}
    <Box>
      <Heading as="h5" size="sm" mb="2">{t("Historique des modifications")}</Heading>
      {history.length === 0 ? <Text fontSize="sm" color="app.muted">{t("Aucune modification enregistrée.")}</Text>
        : <Stack as="ol" gap="1" listStyleType="none" p="0" m="0" fontSize="sm" maxH="64" overflowY="auto">{history.map((item) => <Flex as="li" key={item.id} gap="2" justify="space-between" wrap="wrap">
          <Text>{t(ACTION_LABELS[item.action] ?? item.action)}{item.has_backup && <> · <a href={`/api/v1/teacher/history/${item.id}/backup`} download style={{ textDecoration: "underline" }}>{t("sauvegarde du brouillon précédent")}</a></>}</Text>
          <Text color="app.muted">{item.actor} · {item.created_at ? new Date(item.created_at).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" }) : ""}</Text>
        </Flex>)}</Stack>}
    </Box>
  </Stack>
}
