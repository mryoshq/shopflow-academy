import { useRef, useState } from "react"
import { Alert, Box, Button, Flex, Stack, Text, Textarea } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { newIdempotencyKey } from "./storage"
import type { AttemptResult } from "./types"
import { failure, ResultView, type SqlResult } from "./RunPanel"
import { Icon, formatPoints } from "./ui"

type Props = { missionId: number; starter: string; disabled?: boolean; onResult: (result: AttemptResult) => void }

/** Bonus SQL challenge: edit the query, run it read-only, the server compares its result with the expected one. */
export function SqlChallenge({ missionId, starter, disabled, onResult }: Props) {
  const [sql, setSql] = useState(starter)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<{ attempt: AttemptResult; result: SqlResult | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pendingKey = useRef<string | null>(null)

  async function submit() {
    if (busy || !sql.trim()) return
    setBusy(true)
    setError(null)
    pendingKey.current ??= newIdempotencyKey()
    try {
      const response = await api<AttemptResult & { result: SqlResult | null }>(`/student/missions/${missionId}/sql`, "POST", { idempotency_key: pendingKey.current, sql })
      pendingKey.current = null
      setOutcome({ attempt: response, result: response.result ? { ...response.result, kind: "sql" } : null })
      onResult(response)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) return
      if (reason instanceof ApiError && reason.status !== 0) pendingKey.current = null
      setOutcome(null)
      setError(failure(reason).message ?? "Erreur")
    } finally {
      setBusy(false)
    }
  }

  return <Stack gap="3">
    <label htmlFor={`sql-${missionId}`}><Text as="span" fontWeight="semibold">Votre requête</Text></label>
    <Textarea id={`sql-${missionId}`} value={sql} onChange={(event) => { setSql(event.target.value); setOutcome(null) }} rows={Math.min(14, Math.max(6, sql.split("\n").length + 1))}
      spellCheck={false} autoCapitalize="off" autoCorrect="off" maxLength={4000} disabled={disabled}
      onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submit() } }}
      css={{ fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace", fontSize: "14px", background: "var(--chakra-colors-code-bg)" }} />
    <Text fontSize="xs" color="app.muted">Une seule requête SELECT (WITH et EXPLAIN permis), sur les tables du laboratoire. Ctrl + Entrée pour exécuter.</Text>
    <Flex gap="3" wrap="wrap">
      <Button colorPalette="brand" size="lg" loading={busy} loadingText="Exécution…" disabled={disabled || !sql.trim()} onClick={() => void submit()}>Exécuter et vérifier</Button>
      <Button variant="ghost" onClick={() => { setSql(starter); setOutcome(null); setError(null) }} disabled={busy}>Revenir à la requête de départ</Button>
    </Flex>
    <Box aria-live="polite">
      {error && <Alert.Root status="warning" variant="subtle" rounded="lg" role="alert"><Alert.Indicator /><Alert.Content>
        <Alert.Title>Requête non exécutée</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content></Alert.Root>}
      {outcome && <Stack gap="3">
        <Flex gap="2" align="center" fontWeight="bold" color={outcome.attempt.correct ? "green.fg" : "saffron.fg"}>
          <Icon name={outcome.attempt.correct ? "check" : "retry"} />
          {outcome.attempt.correct ? `Bravo, c’est le résultat attendu (+${formatPoints(outcome.attempt.points)} pts bonus)` : "Presque ! Le résultat diffère encore : réessayez."}
        </Flex>
        {outcome.result && <ResultView result={outcome.result} label="votre requête" />}
      </Stack>}
    </Box>
  </Stack>
}
