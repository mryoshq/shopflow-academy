import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, Box, Button, Flex, Heading, Link, Stack, Text, VisuallyHidden } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Activity, DataView, emptyAnswer, isAnswerComplete } from "./activities"
import { clearDraft, loadDraft, newIdempotencyKey, rememberLastMission, saveDraft } from "./storage"
import type { Answer, AttemptHistoryItem, AttemptResult, PlayerMission } from "./types"
import { DemoBadge, ErrorState, Icon, LoadingState, Panel, StatusBadge, formatPoints } from "./ui"

type Props = { missionId: number; navigate: (path: string) => void }

export function MissionPlayer({ missionId, navigate }: Props) {
  const [mission, setMission] = useState<PlayerMission | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<Answer>({ choice_ids: [], pairs: {} })
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hintBusy, setHintBusy] = useState(false)
  const [history, setHistory] = useState<AttemptHistoryItem[] | null>(null)
  const pendingKey = useRef<string | null>(null)
  const feedbackRef = useRef<HTMLDivElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    setMission(null)
    setResult(null)
    setSubmitError(null)
    pendingKey.current = null
    try {
      const data = await api<PlayerMission>(`/student/missions/${missionId}`)
      setMission(data)
      if (data.definition) setAnswer(loadDraft(missionId) ?? emptyAnswer(data.definition))
      rememberLastMission(missionId)
      requestAnimationFrame(() => headingRef.current?.focus())
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      setLoadError(error instanceof ApiError && error.status === 404
        ? "Cette mission n’existe pas ou ne vous est pas attribuée."
        : "Impossible de charger la mission.")
    }
  }, [missionId])

  useEffect(() => { void load() }, [load])

  function change(next: Answer) {
    setAnswer(next)
    setResult(null)
    setSubmitError(null)
    pendingKey.current = null
    saveDraft(missionId, next)
  }

  async function submit() {
    if (!mission?.definition || busy) return
    setBusy(true)
    setSubmitError(null)
    // The same key is reused if the network fails, so a retry never creates a second attempt.
    pendingKey.current ??= newIdempotencyKey()
    try {
      const response = await api<AttemptResult>(`/student/missions/${missionId}/attempts`, "POST", { idempotency_key: pendingKey.current, answer })
      pendingKey.current = null
      setResult(response)
      if (response.correct) clearDraft(missionId)
      setMission((current) => current && {
        ...current, attempts_count: response.attempts_count,
        status: response.correct || current.status === "completed" ? "completed" : "in_progress",
        last_attempt: { correct: response.correct, created_at: new Date().toISOString() },
        explanation: response.explanation ?? current.explanation, score: response.score,
      })
      setHistory(null)
      requestAnimationFrame(() => feedbackRef.current?.focus())
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      if (error instanceof ApiError && error.status === 429) setSubmitError("Beaucoup d’essais en peu de temps. Patientez une minute avant de réessayer.")
      else if (error instanceof ApiError && error.status === 409) setSubmitError("Cette mission est verrouillée pour le moment.")
      else if (error instanceof ApiError && error.status === 422) setSubmitError("Votre réponse est incomplète. Vérifiez chaque élément.")
      else setSubmitError("Connexion interrompue : votre réponse n’a pas pu être envoyée.")
    } finally {
      setBusy(false)
    }
  }

  async function revealHint() {
    if (!mission || hintBusy) return
    setHintBusy(true)
    try {
      const response = await api<{ hints: string[]; hint_count: number }>(`/student/missions/${missionId}/hints`, "POST")
      setMission({ ...mission, hints: response.hints, hint_count: response.hint_count })
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) setSubmitError("Impossible d’afficher l’indice. Réessayez.")
    } finally {
      setHintBusy(false)
    }
  }

  async function toggleHistory() {
    if (history) return setHistory(null)
    try { setHistory(await api<AttemptHistoryItem[]>(`/student/missions/${missionId}/attempts`)) }
    catch (error) { if (!(error instanceof ApiError && error.status === 401)) setSubmitError("Impossible de charger l’historique.") }
  }

  function retry() {
    setResult(null)
    pendingKey.current = null
    if (mission?.definition && result?.correct) setAnswer(emptyAnswer(mission.definition))
  }

  if (loadError) return <Stack gap="4"><BackLink navigate={navigate} /><ErrorState message={loadError} onRetry={() => void load()} /></Stack>
  if (!mission) return <LoadingState label="Chargement de la mission…" />

  const definition = mission.definition
  const complete = definition ? isAnswerComplete(definition, answer) : false
  const labelOf = (id: string) => definition?.choices.find((choice) => choice.id === id)?.label ?? ""

  return <Stack gap="5">
    <Flex justify="space-between" align="center" gap="3" wrap="wrap">
      <BackLink navigate={navigate} />
      <Text color="app.muted" fontSize="sm">Mission {mission.position} sur {mission.total}</Text>
    </Flex>

    <Stack gap="2">
      <Flex gap="2" align="center" wrap="wrap">
        {mission.is_demo && <DemoBadge />}
        <StatusBadge status={mission.status} />
        <Text fontSize="sm" color="app.muted">{mission.course_title} · {mission.module} · {mission.chapter}</Text>
        {mission.score && <Text fontSize="sm" fontWeight="semibold" ml="auto" css={{ fontVariantNumeric: "tabular-nums" }}>
          Meilleur score : {formatPoints(mission.score.best)} / {mission.score.possible} pts{mission.score.bonus ? " (bonus)" : ""}</Text>}
      </Flex>
      <Heading as="h1" size={{ base: "2xl", md: "3xl" }} ref={headingRef} tabIndex={-1} outline="none">{mission.title}</Heading>
      <Box h="1.5" bg="app.sunken" rounded="full" overflow="hidden" role="img" aria-label={`Position dans le cours : ${mission.position} sur ${mission.total}`}>
        <Box h="full" bg="brand.solid" w={`${(mission.position / mission.total) * 100}%`} />
      </Box>
    </Stack>

    {mission.status === "locked" || !definition ? <Panel>
      <Stack gap="3" align="start">
        <Flex gap="2" align="center" fontWeight="semibold"><Icon name="lock" />Mission verrouillée</Flex>
        <Text>Terminez d’abord : {mission.locked_by.join(", ")}.</Text>
        <Button colorPalette="brand" variant="outline" onClick={() => navigate("/")}>Retour au tableau de bord</Button>
      </Stack>
    </Panel> : <Flex gap="6" align="start" direction={{ base: "column", lg: "row" }}>
      <Stack gap="5" flex="1" minW="0">
        <Panel as="section" aria-labelledby="situation-title">
          <Stack gap="4">
            <Text id="situation-title" fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="0.08em">Situation</Text>
            <Text fontSize="lg" whiteSpace="pre-wrap">{definition.scenario}</Text>
            <DataView data={definition.display_data} />
          </Stack>
        </Panel>

        <Panel as="section" aria-labelledby="question-title">
          <Stack gap="4">
            <Text id="question-title" fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="0.08em">Votre décision</Text>
            <Text fontWeight="semibold" fontSize="lg" whiteSpace="pre-wrap">{definition.instructions}</Text>
            <Activity definition={definition} answer={answer} onChange={change} disabled={busy || Boolean(result?.correct)} name={`mission-${missionId}`} />
            {mission.status === "completed" && !result && <Alert.Root status="info" variant="subtle" rounded="lg">
              <Alert.Indicator /><Alert.Content><Alert.Title>Vous avez déjà réussi cette mission.</Alert.Title>
                <Alert.Description>Vous pouvez la refaire pour vous entraîner.</Alert.Description></Alert.Content>
            </Alert.Root>}
            {submitError && <Alert.Root status="error" variant="subtle" rounded="lg" role="alert">
              <Alert.Indicator /><Alert.Content><Alert.Title>{submitError}</Alert.Title>
                <Alert.Description>Votre sélection est conservée.</Alert.Description></Alert.Content>
            </Alert.Root>}
            <Flex gap="3" wrap="wrap" align="center">
              {!result && <Button colorPalette="brand" size="lg" onClick={() => void submit()} loading={busy} loadingText="Vérification…" disabled={!complete}>
                {submitError ? "Renvoyer ma décision" : "Tester ma décision"}
              </Button>}
              {!complete && !result && <Text fontSize="sm" color="app.muted">Complétez votre réponse pour la tester.</Text>}
            </Flex>
          </Stack>
        </Panel>

        <Box ref={feedbackRef} tabIndex={-1} outline="none" aria-live="polite">
          {result && <Panel borderColor={result.correct ? "green.600" : "saffron.400"} borderLeftWidth="6px"
            css={{ animation: "fade-in 180ms ease-out" }}>
            <Stack gap="3">
              <Flex gap="2" align="center" fontWeight="bold" fontSize="lg" color={result.correct ? "green.800" : "saffron.800"}>
                <Icon name={result.correct ? "check" : "retry"} size={22} />
                {result.correct ? "Bonne décision" : "À revoir"}
              </Flex>
              {!result.correct && <Text>Ce n’est pas encore la bonne réponse. Relisez la situation, ou demandez un indice.</Text>}
              {result.feedback.length > 0 && <Stack gap="2" as="ul" listStyleType="none" p="0" m="0">
                {result.feedback.map((item) => <Box as="li" key={item.choice_id} p="3" bg="app.sunken" rounded="md">
                  <Text fontSize="sm" color="app.muted">« {labelOf(item.choice_id)} »</Text><Text>{item.text}</Text>
                </Box>)}
              </Stack>}
              {result.explanation && <Box p="4" bg="brand.subtle" rounded="md"><Text fontWeight="semibold" mb="1">Explication</Text><Text>{result.explanation}</Text></Box>}
              <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>Essai n° {result.attempts_count}{result.replayed ? " (déjà enregistré)" : ""} : {formatPoints(result.points)} / {result.score.possible} pts. Meilleur score conservé : {formatPoints(result.score.best)} pts.</Text>
              <Flex gap="3" wrap="wrap">
                {!result.correct && <Button variant="outline" colorPalette="brand" onClick={retry}><Icon name="retry" />Réessayer</Button>}
                {result.correct && mission.next_id && <Button colorPalette="brand" onClick={() => navigate(`/mission/${mission.next_id}`)}>Mission suivante<Icon name="arrow-right" /></Button>}
                {result.correct && !mission.next_id && <Button colorPalette="brand" onClick={() => navigate("/")}>Retour au tableau de bord</Button>}
              </Flex>
            </Stack>
          </Panel>}
          {!result && mission.explanation && <Panel><Text fontWeight="semibold" mb="1">Explication</Text><Text>{mission.explanation}</Text></Panel>}
        </Box>
      </Stack>

      <Stack gap="4" w={{ base: "full", lg: "80" }} flexShrink={0} as="aside" aria-label="Aide">
        <Panel>
          <Stack gap="3">
            <Flex gap="2" align="center" fontWeight="semibold"><Icon name="bulb" />Indices</Flex>
            {mission.hint_count === 0 && <Text color="app.muted" fontSize="sm">Aucun indice pour cette mission.</Text>}
            {mission.hints.length > 0 && <Stack gap="2.5" as="ol" listStyleType="none" p="0" m="0">{mission.hints.map((hint, index) => <Flex as="li" key={index} gap="2.5" align="start">
              <Flex flexShrink={0} w="6" h="6" rounded="full" bg="saffron.subtle" color="saffron.fg" fontSize="xs" fontWeight="bold" align="center" justify="center" aria-hidden="true">{index + 1}</Flex>
              <Text><VisuallyHidden>Indice {index + 1} : </VisuallyHidden>{hint}</Text></Flex>)}</Stack>}
            {mission.hints.length > 0 && <Text fontSize="xs" color="app.muted">{mission.hints.length === 1 ? "Indice déjà consulté." : `${mission.hints.length} indices déjà consultés.`} Ils restent affichés.</Text>}
            {mission.hint_count > mission.hints.length && <Button size="sm" variant="outline" colorPalette="brand" onClick={() => void revealHint()} loading={hintBusy}>
              {mission.hints.length === 0 ? "Afficher un indice" : "Indice suivant"} ({mission.hints.length + 1}/{mission.hint_count})
            </Button>}
            {mission.hint_count > 0 && mission.hint_count === mission.hints.length && <Text fontSize="xs" color="app.muted">Tous les indices sont affichés.</Text>}
          </Stack>
        </Panel>
        {mission.attempts_count > 0 && <Panel>
          <Stack gap="2">
            <Button size="sm" variant="ghost" alignSelf="start" px="0" aria-expanded={Boolean(history)} onClick={() => void toggleHistory()}>
              {history ? "Masquer l’historique" : `Historique de vos essais (${mission.attempts_count})`}
            </Button>
            {history && <Stack as="ol" gap="1" listStyleType="none" p="0" m="0" fontSize="sm">{history.map((item, index) => <Flex as="li" key={item.id} justify="space-between" gap="2">
              <Text color="app.muted">Essai {history.length - index} · {new Date(item.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
              <Text fontWeight="semibold" color={item.correct ? "green.800" : "app.ink"}>{item.correct ? "Réussi" : "À revoir"} · {formatPoints(item.points)} pts</Text>
            </Flex>)}</Stack>}
          </Stack>
        </Panel>}
        {definition.resources.length > 0 && <Panel><Stack gap="2"><Text fontWeight="semibold">Ressources</Text>
          {definition.resources.map((url) => <Link key={url} href={url} target="_blank" rel="noreferrer" color="brand.fg" textDecoration="underline" wordBreak="break-all">{url}</Link>)}
        </Stack></Panel>}
        {!mission.ai_enabled && <Text fontSize="xs" color="app.muted" px="1">Assistant IA désactivé : les indices ci-dessus restent disponibles.</Text>}
        <Flex gap="1.5" align="center" fontSize="sm" color="app.muted" px="1"><Icon name="clock" size={14} />Environ {definition.estimated_duration_minutes} min, sans chronomètre.</Flex>
      </Stack>
    </Flex>}

    <Flex as="nav" aria-label="Navigation entre missions" justify="space-between" gap="3" pt="2" borderTopWidth="1px" borderColor="app.border">
      <Button variant="ghost" disabled={!mission.previous_id} onClick={() => mission.previous_id && navigate(`/mission/${mission.previous_id}`)}><Icon name="arrow-left" />Mission précédente</Button>
      <Button variant="ghost" disabled={!mission.next_id} onClick={() => mission.next_id && navigate(`/mission/${mission.next_id}`)}>Mission suivante<Icon name="arrow-right" /></Button>
    </Flex>
  </Stack>
}

function BackLink({ navigate }: { navigate: (path: string) => void }) {
  return <Button variant="ghost" size="sm" alignSelf="start" px="2" onClick={() => navigate("/")}><Icon name="arrow-left" size={16} />Tableau de bord</Button>
}
