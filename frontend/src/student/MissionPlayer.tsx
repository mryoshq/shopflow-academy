import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, Box, Button, Flex, Grid, Heading, Link, Stack, Text, VisuallyHidden } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Activity, DataView, emptyAnswer, isAnswerComplete } from "./activities"
import { clearDraft, helpFolded, loadDraft, newIdempotencyKey, rememberHelpFolded, rememberLastMission, saveDraft } from "./storage"
import type { Answer, AttemptHistoryItem, AttemptResult, PlayerMission } from "./types"
import { DemoBadge, ErrorState, Icon, LoadingState, Panel, StatusBadge, formatPoints } from "./ui"
import { HelpRequest } from "./HelpRequest"
import { LessonBody } from "./displays"
import { RunPanel } from "./RunPanel"
import { SqlChallenge } from "./SqlChallenge"

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
  const [helpOpen, setHelpOpen] = useState(() => !helpFolded())
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
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      setLoadError(error instanceof ApiError && error.status === 404
        ? "Cette mission n’existe pas ou ne vous est pas attribuée."
        : "Impossible de charger la mission.")
    }
  }, [missionId])

  useEffect(() => { void load() }, [load])
  // Move focus right after React commits, so keyboard and screen-reader users land on the new content.
  const loadedId = mission?.mission_version_id
  useEffect(() => { if (loadedId) headingRef.current?.focus() }, [loadedId])
  useEffect(() => { if (result) feedbackRef.current?.focus() }, [result])

  // Keyboard shortcuts: 1-9 choose a proposition, Enter validates (then continues or retries).
  const shortcut = useRef<(event: KeyboardEvent) => void>(() => {})
  shortcut.current = (event: KeyboardEvent) => {
    const definition = mission?.definition
    if (!mission || !definition || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return
    const target = event.target as HTMLElement | null
    const tag = target?.tagName ?? ""
    if (tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable || (tag === "INPUT" && !["radio", "checkbox"].includes((target as HTMLInputElement).type))) return
    const choiceKinds = ["single_choice", "multiple_choice", "true_false", "data_interpretation", "scenario_choice", "guided_simulation"]
    if (/^[1-9]$/.test(event.key) && choiceKinds.includes(definition.kind) && !result?.correct && !busy) {
      const choice = definition.choices[Number(event.key) - 1]
      if (!choice) return
      event.preventDefault()
      const chosen = definition.kind === "multiple_choice"
        ? (answer.choice_ids.includes(choice.id) ? answer.choice_ids.filter((id) => id !== choice.id) : [...answer.choice_ids, choice.id])
        : [choice.id]
      change({ ...answer, choice_ids: chosen })
      return
    }
    if (event.key !== "Enter" || tag === "BUTTON" || tag === "A" || target?.getAttribute("role") === "button") return
    if (result) {
      event.preventDefault()
      if (result.correct && mission.next_id) navigate(`/mission/${mission.next_id}`)
      else if (!result.correct) retry()
      return
    }
    if (choiceKinds.includes(definition.kind) || definition.kind === "reorder" || definition.kind === "matching") {
      if (isAnswerComplete(definition, answer) && !mission.paused) { event.preventDefault(); void submit() }
    }
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcut.current(event)
    document.addEventListener("keydown", listener)
    return () => document.removeEventListener("keydown", listener)
  }, [])

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
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      if (error instanceof ApiError && error.status === 429) setSubmitError("Beaucoup d’essais en peu de temps. Patientez une minute avant de réessayer.")
      else if (error instanceof ApiError && error.status === 409) {
        setSubmitError(error.message === "sequence paused" ? "La séquence est en pause : réessayez à la reprise." : "Cette mission est verrouillée pour le moment.")
        if (error.message === "sequence paused") setMission((current) => current && { ...current, paused: true })
      }
      else if (error instanceof ApiError && error.status === 422) setSubmitError("Votre réponse est incomplète. Vérifiez chaque élément.")
      else setSubmitError("Connexion interrompue : votre réponse n’a pas pu être envoyée.")
    } finally {
      setBusy(false)
    }
  }

  function toggleHelp() {
    rememberHelpFolded(helpOpen)
    setHelpOpen(!helpOpen)
  }

  async function markUnderstood() {
    if (!mission || busy) return
    setBusy(true)
    setSubmitError(null)
    try {
      const response = await api<AttemptResult>(`/student/missions/${missionId}/understood`, "POST")
      setMission((current) => current && { ...current, status: "completed", attempts_count: response.attempts_count, score: response.score })
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) setSubmitError(error instanceof ApiError && error.status === 409 ? "La séquence est en pause : réessayez à la reprise." : "Connexion interrompue. Réessayez.")
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
    </Panel> : <Stack gap="5">
      <Stack gap="5" minW="0">
        {definition.kind === "lesson" ? <Panel as="section" aria-labelledby="lesson-title">
          <Stack gap="4">
            <Text id="lesson-title" fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="0.08em">Leçon</Text>
            <LessonBody body={definition.body ?? ""} />
            <DataView data={definition.display_data} />
            <RunPanel runs={definition.run} missionId={mission.mission_version_id} />
            {submitError && <Text role="alert" color="red.fg">{submitError}</Text>}
            <Flex gap="3" wrap="wrap" align="center">
              {mission.status === "completed"
                ? <Flex gap="2" align="center" color="green.fg" fontWeight="semibold" role="status"><Icon name="check" />Leçon comprise</Flex>
                : <Button colorPalette="brand" size="lg" loading={busy} disabled={mission.paused} onClick={() => void markUnderstood()}>J’ai compris</Button>}
              {mission.status === "completed" && mission.next_id && <Button colorPalette="brand" onClick={() => navigate(`/mission/${mission.next_id}`)}>Mission suivante<Icon name="arrow-right" /></Button>}
              {mission.status === "completed" && !mission.next_id && <Button colorPalette="brand" variant="outline" onClick={() => navigate("/")}>Retour au tableau de bord</Button>}
            </Flex>
            <Text fontSize="sm" color="app.muted">Une leçon ne compte pas dans la note : elle aide à réussir les missions suivantes.</Text>
          </Stack>
        </Panel> : <>
        <Panel as="section" aria-labelledby="situation-title">
          <Stack gap="4">
            <Text id="situation-title" fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="0.08em">Situation</Text>
            <Text fontSize="lg" whiteSpace="pre-wrap">{definition.scenario}</Text>
            <DataView data={definition.display_data} />
            <RunPanel runs={definition.run} missionId={mission.mission_version_id} />
          </Stack>
        </Panel>

        <Panel as="section" aria-labelledby="question-title">
          <Stack gap="4">
            <Text id="question-title" fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="0.08em">Votre décision</Text>
            <Text fontWeight="semibold" fontSize="lg" whiteSpace="pre-wrap">{definition.instructions}</Text>
            {definition.kind === "sql_challenge"
              ? <SqlChallenge missionId={mission.mission_version_id} starter={definition.starter_sql ?? ""} disabled={mission.paused}
                onResult={(response) => setMission((current) => current && {
                  ...current, attempts_count: response.attempts_count, score: response.score,
                  status: response.correct || current.status === "completed" ? "completed" : "in_progress",
                  explanation: response.explanation ?? current.explanation,
                })} />
              : <Activity definition={definition} answer={answer} onChange={change} disabled={busy || Boolean(result?.correct)} name={`mission-${missionId}`} />}
            {!["lesson", "sql_challenge", "reorder", "matching"].includes(definition.kind) && !result && <Text fontSize="xs" color="app.muted">
              Raccourcis : touches 1 à {Math.min(9, definition.choices.length)} pour choisir, Entrée pour valider.</Text>}
            {mission.paused && <Alert.Root status="warning" variant="subtle" rounded="lg">
              <Alert.Indicator /><Alert.Content><Alert.Title>Séquence en pause</Alert.Title>
                <Alert.Description>Votre enseignant a suspendu les réponses. Vous pouvez relire la mission ; rechargez la page à la reprise.</Alert.Description></Alert.Content>
            </Alert.Root>}
            {mission.status === "completed" && !result && <Alert.Root status="info" variant="subtle" rounded="lg">
              <Alert.Indicator /><Alert.Content><Alert.Title>Vous avez déjà réussi cette mission.</Alert.Title>
                <Alert.Description>Vous pouvez la refaire pour vous entraîner.</Alert.Description></Alert.Content>
            </Alert.Root>}
            {submitError && <Alert.Root status="error" variant="subtle" rounded="lg" role="alert">
              <Alert.Indicator /><Alert.Content><Alert.Title>{submitError}</Alert.Title>
                <Alert.Description>Votre sélection est conservée.</Alert.Description></Alert.Content>
            </Alert.Root>}
            <Flex gap="3" wrap="wrap" align="center">
              {!result && definition.kind !== "sql_challenge" && <Button colorPalette="brand" size="lg" onClick={() => void submit()} loading={busy} loadingText="Vérification…" disabled={!complete || mission.paused}>
                {submitError ? "Renvoyer ma décision" : "Tester ma décision"}
              </Button>}
              {!complete && !result && definition.kind !== "sql_challenge" && <Text fontSize="sm" color="app.muted">Complétez votre réponse pour la tester.</Text>}
            </Flex>
          </Stack>
        </Panel>

        <Box ref={feedbackRef} tabIndex={-1} outline="none" aria-live="polite">
          {result && <Panel borderColor={result.correct ? "green.600" : "saffron.400"} borderLeftWidth="6px"
            css={{ animation: "fade-in 180ms ease-out" }}>
            <Stack gap="3">
              <Flex gap="2" align="center" fontWeight="bold" fontSize="lg" color={result.correct ? "green.fg" : "saffron.fg"}>
                <Icon name={result.correct ? "check" : "retry"} size={22} />
                {result.correct ? "Bonne décision" : "Presque ! Réessayez"}
              </Flex>
              {!result.correct && <Text>Relisez la situation ou ouvrez un indice : vous pouvez réessayer autant de fois que vous voulez, votre meilleur essai compte.</Text>}
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
        </>}
      </Stack>

      <Box as="aside" aria-label="Aide" borderWidth="1px" borderColor="app.border" rounded="card" bg="app.sunken" p={{ base: "3", md: "4" }}>
        <Button variant="ghost" size="sm" px="1" aria-expanded={helpOpen} aria-controls="mission-help" onClick={() => toggleHelp()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" focusable="false"
            style={{ transform: helpOpen ? "rotate(90deg)" : "none", transition: "transform 150ms" }}><path d="M9 6l6 6-6 6" /></svg>
          Aide : indices, question à l’enseignant{mission.attempts_count > 0 ? ", historique" : ""}
        </Button>
        {helpOpen && <Grid id="mission-help" mt="3" gap="4" templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} alignItems="start">
        <Panel>
          <Stack gap="3">
            <Flex gap="2" align="center" fontWeight="semibold"><Icon name="bulb" />Indices</Flex>
            {mission.hint_count === 0 && <Text color="app.muted" fontSize="sm">Aucun indice pour cette mission.</Text>}
            {mission.hints.length > 0 && <Stack gap="2.5" as="ol" listStyleType="none" p="0" m="0">{mission.hints.map((hint, index) => <Flex as="li" key={index} gap="2.5" align="start">
              <Flex flexShrink={0} w="6" h="6" rounded="full" bg="saffron.subtle" color="saffron.fg" fontSize="xs" fontWeight="bold" align="center" justify="center" aria-hidden="true">{index + 1}</Flex>
              <Text><VisuallyHidden>Indice {index + 1} : </VisuallyHidden>{hint}</Text></Flex>)}</Stack>}
            {mission.hints.length > 0 && <Text fontSize="xs" color="app.muted">{mission.hints.length === 1 ? "Indice déjà consulté." : `${mission.hints.length} indices déjà consultés.`} Ils restent affichés.</Text>}
            {mission.hint_count > mission.hints.length && <Button size="sm" variant="outline" colorPalette="brand" onClick={() => void revealHint()} loading={hintBusy} disabled={mission.paused}>
              {mission.hints.length === 0 ? "Afficher un indice" : "Indice suivant"} ({mission.hints.length + 1}/{mission.hint_count})
            </Button>}
            {mission.hint_count > 0 && mission.hint_count === mission.hints.length && <Text fontSize="xs" color="app.muted">Tous les indices sont affichés.</Text>}
          </Stack>
        </Panel>
        <HelpRequest key={mission.mission_version_id} missionId={mission.mission_version_id} initial={mission.help_request} />
        {mission.attempts_count > 0 && <Panel>
          <Stack gap="2">
            <Button size="sm" variant="ghost" alignSelf="start" px="0" aria-expanded={Boolean(history)} onClick={() => void toggleHistory()}>
              {history ? "Masquer l’historique" : `Historique de vos essais (${mission.attempts_count})`}
            </Button>
            {history && <Stack as="ol" gap="1" listStyleType="none" p="0" m="0" fontSize="sm">{history.map((item, index) => <Flex as="li" key={item.id} justify="space-between" gap="2">
              <Text color="app.muted">Essai {history.length - index} · {new Date(item.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
              <Text fontWeight="semibold" color={item.correct ? "green.fg" : "app.ink"}>{item.correct ? "Réussi" : "Pas encore"} · {formatPoints(item.points)} pts</Text>
            </Flex>)}</Stack>}
          </Stack>
        </Panel>}
        {definition.resources.length > 0 && <Panel><Stack gap="2"><Text fontWeight="semibold">Ressources</Text>
          {definition.resources.map((url) => <Link key={url} href={url} target="_blank" rel="noreferrer" color="brand.fg" textDecoration="underline" wordBreak="break-all">{url}</Link>)}
        </Stack></Panel>}
        <Stack gap="1.5" px="1">
          {!mission.ai_enabled && <Text fontSize="xs" color="app.muted">Assistant IA désactivé : les indices restent disponibles.</Text>}
          <Flex gap="1.5" align="center" fontSize="sm" color="app.muted"><Icon name="clock" size={14} />Environ {definition.estimated_duration_minutes} min, sans chronomètre.</Flex>
        </Stack>
        </Grid>}
      </Box>
    </Stack>}

    <Flex as="nav" aria-label="Navigation entre missions" justify="space-between" gap="3" pt="2" borderTopWidth="1px" borderColor="app.border">
      <Button variant="ghost" disabled={!mission.previous_id} onClick={() => mission.previous_id && navigate(`/mission/${mission.previous_id}`)}><Icon name="arrow-left" />Mission précédente</Button>
      <Button variant="ghost" disabled={!mission.next_id} onClick={() => mission.next_id && navigate(`/mission/${mission.next_id}`)}>Mission suivante<Icon name="arrow-right" /></Button>
    </Flex>
  </Stack>
}

function BackLink({ navigate }: { navigate: (path: string) => void }) {
  return <Button variant="ghost" size="sm" alignSelf="start" px="2" onClick={() => navigate("/")}><Icon name="arrow-left" size={16} />Tableau de bord</Button>
}
