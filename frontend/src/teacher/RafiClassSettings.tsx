import { useEffect, useState } from "react"
import { Heading, Stack, Switch, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { t } from "../i18n"
import { Panel } from "../student/ui"

/** ADR-0047: the teacher switches Rafi's sounds off for the whole class (each student can also do it for themselves). */
export function RafiClassSettings({ assignmentId }: { assignmentId: number }) {
  const [sounds, setSounds] = useState<boolean | null>(null)
  const [notice, setNotice] = useState("")
  useEffect(() => {
    void api<{ sounds: boolean }>(`/teacher/classes/${assignmentId}/rafi`).then((value) => setSounds(value.sounds)).catch(() => setSounds(null))
  }, [assignmentId])
  async function choose(value: boolean) {
    setNotice("")
    try { setSounds((await api<{ sounds: boolean }>(`/teacher/classes/${assignmentId}/rafi`, "PUT", { sounds: value })).sounds); setNotice(value ? t("Sons de Rafi rétablis pour la classe.") : t("Sons de Rafi coupés pour toute la classe.")) }
    catch (reason) { setNotice(reason instanceof ApiError ? reason.message : t("Action impossible. Réessayez.")) }
  }
  if (sounds === null) return null
  return <Panel><Stack gap="2">
    <Heading as="h3" size="sm">{t("Rafi, l’assistant des étudiants")}</Heading>
    <Text fontSize="sm" color="app.muted">{t("Rafi présente les annonces (rappels des jalons, blocs à terminer, vos messages) dans le coin de l’écran des étudiants. Ses sons sont courts et rares.")}</Text>
    <Switch.Root checked={sounds} onCheckedChange={(event) => void choose(event.checked)} colorPalette="brand" size="sm">
      <Switch.HiddenInput /><Switch.Control><Switch.Thumb /></Switch.Control>
      <Switch.Label fontSize="sm">{t("Sons de Rafi pour toute la classe")}</Switch.Label>
    </Switch.Root>
    {notice && <Text fontSize="sm" color="brand.fg" role="status">{notice}</Text>}
  </Stack></Panel>
}
