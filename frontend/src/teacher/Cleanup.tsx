import { t, tn } from "../i18n"
import { useState } from "react"
import { Button, Stack, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"

type Report = { mode: "dry-run" | "apply"; count: number; courses: { id: number; slug: string; title: string }[] }

/** Archive in one go the courses left by old automated tests. Simulation first; nothing is deleted. */
export function Cleanup({ onDone }: { onDone?: () => void }) {
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function call(apply: boolean) {
    setBusy(true)
    setMessage("")
    try {
      const result = await api<Report>("/teacher/courses/cleanup", "POST", { apply })
      setReport(apply ? null : result)
      if (apply) {
        setMessage(tn("{{count}} cours archivé. Rien n’a été supprimé.", result.count))
        onDone?.()
      }
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : t("Connexion interrompue. Réessayez."))
    } finally {
      setBusy(false)
    }
  }

  return <Stack gap="3">
    <Text fontWeight="semibold">{t("Ménage des cours de test")}</Text>
    <Text fontSize="sm" color="app.muted">{t("Archive les cours laissés par les tests automatiques (nom contenant e2e, test ou demo), jamais donnés à votre classe. Rien n’est supprimé.")}</Text>
    <Button size="sm" variant="outline" alignSelf="start" loading={busy} onClick={() => void call(false)}>{t("Simuler le ménage")}</Button>
    {report && (report.count === 0 ? <Text fontSize="sm">{t("Aucun cours à archiver.")}</Text> : <Stack gap="2">
      <Text fontSize="sm">{report.count} {t("cours seraient archivés :")}</Text>
      <Stack as="ul" gap="0.5" pl="4" fontSize="sm" maxH="40" overflowY="auto">{report.courses.map((item) => <li key={item.id}>{item.title} ({item.slug})</li>)}</Stack>
      <Button size="sm" colorPalette="saffron" alignSelf="start" loading={busy}
        onClick={() => { if (window.confirm(t("Archiver ces {{count}} cours ?", { count: report.count }))) void call(true) }}>{t("Archiver ces")}{" "}{report.count} {t("cours")}</Button>
    </Stack>)}
    {message && <Text role="status" fontSize="sm" color="brand.fg">{message}</Text>}
  </Stack>
}
