import { useState } from "react"
import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import type { RunView } from "../studioTypes"
import { CodeBlock, DataTable } from "./displays"
import { Icon } from "./ui"

export type SqlResult = { kind: "sql"; columns: string[]; rows: (string | number | boolean | null)[][]; truncated: boolean; elapsed_ms: number }
export type RunResult = SqlResult | { kind: "python"; output: string }
type State = { status: "idle" | "loading" | "done" | "error" | "timeout"; result?: RunResult; message?: string }

export function ResultView({ result, label }: { result: RunResult; label: string }) {
  if (result.kind === "python") return <Box as="pre" m="0" p="3" bg="code.bg" color="code.fg" borderWidth="1px" borderColor="code.border" rounded="lg"
    overflowX="auto" fontSize="sm" tabIndex={0} aria-label={`Sortie de ${label}`} css={{ fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace" }}>{result.output || "(aucune sortie)"}</Box>
  return <Stack gap="1">
    {result.columns.length === 0 ? <Text fontSize="sm">La requête n’a renvoyé aucune ligne.</Text>
      : <DataTable caption={`Résultat : ${result.rows.length} ligne${result.rows.length > 1 ? "s" : ""}${result.truncated ? " (200 premières seulement)" : ""}`} columns={result.columns} rows={result.rows} />}
    <Text fontSize="xs" color="app.muted">Exécutée en {result.elapsed_ms} ms sur la base de laboratoire (données fictives, lecture seule).</Text>
  </Stack>
}

export function failure(reason: unknown): State {
  if (reason instanceof ApiError && reason.status === 504) return { status: "timeout", message: "La requête a dépassé le délai de 3 secondes." }
  if (reason instanceof ApiError && reason.status === 429) return { status: "error", message: "Beaucoup d’exécutions en peu de temps : patientez une minute." }
  if (reason instanceof ApiError && reason.status === 503) return { status: "error", message: "La base de laboratoire est indisponible pour le moment. Prévenez votre enseignant." }
  if (reason instanceof ApiError && [400, 409, 422].includes(reason.status)) return { status: "error", message: reason.message }
  return { status: "error", message: "Connexion interrompue. Réessayez." }
}

/** Preconfigured executions: the server runs the code stored in the mission, never text from the browser. */
export function RunPanel({ runs, missionId, endpoint = "student" }: { runs: RunView[] | undefined; missionId?: number; endpoint?: "student" | "teacher" }) {
  const [states, setStates] = useState<Record<string, State>>({})
  if (!runs || runs.length === 0) return null
  async function run(item: RunView) {
    if (!missionId) return
    setStates((current) => ({ ...current, [item.id]: { status: "loading" } }))
    try {
      const result = await api<RunResult>(`/${endpoint}/missions/${missionId}/runs/${encodeURIComponent(item.id)}`, "POST")
      setStates((current) => ({ ...current, [item.id]: { status: "done", result } }))
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) return
      setStates((current) => ({ ...current, [item.id]: failure(reason) }))
    }
  }
  return <Stack gap="4" as="section" aria-label="Code à exécuter">
    {runs.map((item) => {
      const state = states[item.id] ?? { status: "idle" }
      return <Stack key={item.id} gap="2">
        <CodeBlock code={item.code} language={item.language} title={item.label} />
        <Flex gap="3" align="center" wrap="wrap">
          <Button size="sm" colorPalette="brand" variant={state.status === "done" ? "outline" : "solid"} loading={state.status === "loading"}
            loadingText="Exécution…" disabled={!missionId} onClick={() => void run(item)} aria-label={`Exécuter : ${item.label}`}>
            <Icon name="arrow-right" size={14} />{state.status === "done" ? "Exécuter à nouveau" : "Exécuter"}</Button>
          {item.language === "python" && state.status === "idle" && <Text fontSize="sm" color="app.muted">Résultat obtenu à la préparation du cours, dans un environnement isolé.</Text>}
        </Flex>
        <Box aria-live="polite">
          {state.status === "done" && state.result && <ResultView result={state.result} label={item.label} />}
          {(state.status === "error" || state.status === "timeout") && <Flex role="alert" gap="2" align="center" p="3" bg="saffron.subtle" rounded="md" color="saffron.fg">
            <Icon name={state.status === "timeout" ? "clock" : "alert"} size={16} /><Text fontSize="sm">{state.message}</Text></Flex>}
        </Box>
      </Stack>
    })}
  </Stack>
}
