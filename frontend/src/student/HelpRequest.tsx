import { t } from "../i18n"
import { useEffect, useState } from "react"
import { Box, Button, Flex, Stack, Text, Textarea } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import type { HelpRequestState } from "./types"
import { Icon, Panel } from "./ui"

const POLL_MS = 15000
const MAX = 300

type Props = { missionId: number; initial: HelpRequestState | null | undefined }

/** "J'ai besoin d'une explication": short optional message, then "reçue" and "traitée" states. */
export function HelpRequest({ missionId, initial }: Props) {
  const [request, setRequest] = useState<HelpRequestState | null>(initial ?? null)
  const [writing, setWriting] = useState(false)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  // While the request is pending, check now and then whether the teacher has handled it.
  useEffect(() => {
    if (request?.status !== "pending") return
    const timer = window.setInterval(() => {
      api<(HelpRequestState & { mission_version_id: number })[]>("/student/help")
        .then((items) => {
          const mine = items.find((item) => item.id === request.id)
          if (mine && mine.status !== request.status) setRequest(mine)
        })
        .catch(() => { /* keep the current state; next tick retries */ })
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [request])

  async function send() {
    setBusy(true)
    setError("")
    try {
      setRequest(await api<HelpRequestState>(`/student/missions/${missionId}/help`, "POST", { message: message.trim() }))
      setWriting(false)
      setMessage("")
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) return
      setError(reason instanceof ApiError && reason.status === 422 ? t("Écrivez un message court, sans mise en forme.") : t("Envoi impossible. Réessayez."))
    } finally {
      setBusy(false)
    }
  }

  const pending = request?.status === "pending"
  return <Panel as="section" aria-labelledby={`help-${missionId}`}>
    <Stack gap="3">
      <Flex gap="2" align="center" fontWeight="semibold" id={`help-${missionId}`}><Icon name="alert" />{t("Besoin d’aide ?")}</Flex>
      {pending && <Box role="status" p="3" bg="saffron.subtle" rounded="md">
        <Text fontWeight="semibold" color="saffron.fg">{t("Demande reçue")}</Text>
        <Text fontSize="sm">{t("Votre enseignant a été prévenu et passera vous voir. Vous pouvez continuer en attendant.")}</Text>
      </Box>}
      {request?.status === "handled" && !writing && <Box role="status" p="3" bg="brand.subtle" rounded="md">
        <Text fontWeight="semibold" color="brand.fg">{t("Demande traitée")}</Text>
        <Text fontSize="sm">{t("Encore une question ? Vous pouvez redemander de l’aide.")}</Text>
      </Box>}
      {!pending && !writing && <Button size="sm" variant="outline" colorPalette="brand" onClick={() => setWriting(true)}>{t("J’ai besoin d’une explication")}</Button>}
      {writing && <Stack gap="2">
        <label htmlFor={`help-message-${missionId}`}><Text as="span" fontSize="sm">{t("Ce qui vous bloque (facultatif)")}</Text></label>
        <Textarea id={`help-message-${missionId}`} value={message} maxLength={MAX} rows={3} onChange={(event) => setMessage(event.target.value)}
          placeholder={t("Par exemple : je ne vois pas pourquoi le total change.")} />
        <Text fontSize="xs" color="app.muted">{message.length} / {MAX} {t("caractères")}</Text>
        {error && <Text role="alert" fontSize="sm" color="red.fg">{error}</Text>}
        <Flex gap="2" wrap="wrap">
          <Button size="sm" colorPalette="brand" loading={busy} onClick={() => void send()}>{t("Envoyer la demande")}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setWriting(false); setError("") }}>{t("Annuler")}</Button>
        </Flex>
      </Stack>}
    </Stack>
  </Panel>
}
