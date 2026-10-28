import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Badge, Box, Button, Field, Flex, Heading, Input, Stack, Table, Text, chakra } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Panel } from "../student/ui"

type ObserverAccount = { id: number; username: string; enabled: boolean; show_answers: boolean; named: boolean; project_access?: boolean; created_at: string | null }
type View = { id: number; observer: string; view: string; assignment_id: number | null; details: Record<string, unknown>; created_at: string | null }
const VIEW_LABEL: Record<string, string> = {
  classes: "Liste des classes", course: "Aperçu du cours", progress: "Progression", results: "Résultats", "results.csv": "Export CSV des résultats",
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <chakra.label display="flex" alignItems="center" gap="2" minH="11" cursor="pointer" fontSize="sm">
    <chakra.input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} w="5" h="5" />{label}
  </chakra.label>
}

/** Teacher side of ADR-0025: create, set and disable read-only observers; see every consultation. */
export function ObserversPanel() {
  const [observers, setObservers] = useState<ObserverAccount[] | null>(null)
  const [views, setViews] = useState<View[]>([])
  const [username, setUsername] = useState("")
  const [showAnswers, setShowAnswers] = useState(false)
  const [named, setNamed] = useState(false)
  const [secret, setSecret] = useState<{ username: string; password: string } | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, journal] = await Promise.all([api<ObserverAccount[]>("/teacher/observers"), api<View[]>("/teacher/observers/views")])
      setObservers(list)
      setViews(journal)
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) setMessage("Chargement impossible. Réessayez.")
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      const created = await api<ObserverAccount & { password: string }>("/teacher/observers", "POST", { username, show_answers: showAnswers, named })
      setSecret({ username: created.username, password: created.password })
      setUsername("")
      await load()
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : "Création impossible. Réessayez.")
    } finally {
      setBusy(false)
    }
  }
  async function change(observer: ObserverAccount, patch: Partial<Pick<ObserverAccount, "enabled" | "show_answers" | "named" | "project_access">>) {
    setMessage("")
    try {
      await api(`/teacher/observers/${observer.id}`, "PATCH", patch)
      await load()
    } catch {
      setMessage("Modification impossible. Réessayez.")
    }
  }
  async function reset(observer: ObserverAccount) {
    setMessage("")
    try {
      const result = await api<{ username: string; password: string }>(`/teacher/observers/${observer.id}/reset-password`, "POST")
      setSecret({ username: result.username, password: result.password })
    } catch {
      setMessage("Réinitialisation impossible. Réessayez.")
    }
  }

  return <Stack gap="6">
    <Stack gap="1">
      <Heading as="h2" size="lg">Observateurs en lecture seule</Heading>
      <Text color="app.muted">Un observateur (inspecteur, collègue, responsable) consulte l’aperçu du cours, la progression et les résultats de vos classes, sans rien pouvoir modifier. Chaque consultation est listée ci-dessous.</Text>
    </Stack>
    <Panel as="section" aria-label="Créer un observateur">
      <form onSubmit={create}><Stack gap="3">
        <Field.Root required maxW="md"><Field.Label>Identifiant de l’observateur</Field.Label>
          <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="inspection.b3" autoComplete="off" /></Field.Root>
        <Flex gap="4" wrap="wrap">
          <Toggle label="Afficher les noms des étudiants (sinon « Étudiant 1, 2… »)" checked={named} onChange={setNamed} />
          <Toggle label="Afficher les corrigés dans l’aperçu" checked={showAnswers} onChange={setShowAnswers} />
        </Flex>
        <Button type="submit" colorPalette="brand" alignSelf="start" loading={busy} disabled={!username.trim()}>Créer le compte</Button>
      </Stack></form>
    </Panel>
    {secret && <Box role="status" p="4" rounded="lg" bg="saffron.subtle" borderWidth="1px" borderColor="saffron.solid">
      <Text fontWeight="semibold">Mot de passe de {secret.username}, affiché une seule fois :</Text>
      <Text fontFamily="mono" fontSize="lg" my="2">{secret.password}</Text>
      <Text fontSize="sm">Transmettez-le à l’observateur ; il ne sera plus affiché. <Button size="xs" variant="ghost" onClick={() => setSecret(null)}>Masquer</Button></Text>
    </Box>}
    {message && <Text role="alert" color="red.fg">{message}</Text>}
    {observers && (observers.length === 0 ? <Text color="app.muted">Aucun observateur pour le moment.</Text>
      : <Stack gap="3" as="ul" listStyleType="none" aria-label="Observateurs">{observers.map((observer) => <Panel as="li" key={observer.id}>
        <Flex gap="3" align="center" wrap="wrap" justify="space-between">
          <Flex gap="2" align="center"><Text fontWeight="semibold">{observer.username}</Text>
            <Badge colorPalette={observer.enabled ? "green" : "gray"} variant="subtle">{observer.enabled ? "Actif" : "Désactivé"}</Badge></Flex>
          <Flex gap="2" wrap="wrap">
            <Button size="sm" variant="outline" onClick={() => void reset(observer)} disabled={!observer.enabled}>Nouveau mot de passe</Button>
            <Button size="sm" variant="outline" colorPalette={observer.enabled ? "red" : "brand"} onClick={() => void change(observer, { enabled: !observer.enabled })}
              aria-label={`${observer.enabled ? "Désactiver" : "Réactiver"} ${observer.username}`}>{observer.enabled ? "Désactiver" : "Réactiver"}</Button>
          </Flex>
        </Flex>
        <Flex gap="4" wrap="wrap" mt="2">
          <Toggle label="Noms des étudiants visibles" checked={observer.named} onChange={(value) => void change(observer, { named: value })} />
          <Toggle label="Corrigés visibles dans l’aperçu" checked={observer.show_answers} onChange={(value) => void change(observer, { show_answers: value })} />
          <Toggle label="Espace projet visible" checked={Boolean(observer.project_access)} onChange={(value) => void change(observer, { project_access: value })} />
        </Flex>
      </Panel>)}</Stack>)}
    <Stack gap="2" as="section" aria-label="Consultations des observateurs">
      <Heading as="h3" size="md">Consultations</Heading>
      {views.length === 0 ? <Text color="app.muted">Aucune consultation enregistrée.</Text>
        : <Box overflowX="auto" tabIndex={0} role="region" aria-label="Journal des consultations" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
          <Table.Root size="sm"><Table.Header><Table.Row bg="app.sunken">{["Date", "Observateur", "Consultation", "Classe"].map((label) =>
            <Table.ColumnHeader key={label} scope="col">{label}</Table.ColumnHeader>)}</Table.Row></Table.Header>
            <Table.Body>{views.map((view) => <Table.Row key={view.id}>
              <Table.Cell whiteSpace="nowrap">{view.created_at ? new Date(view.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}</Table.Cell>
              <Table.Cell>{view.observer}</Table.Cell>
              <Table.Cell>{VIEW_LABEL[view.view] ?? view.view}{view.details.answers ? " (avec corrigés)" : ""}</Table.Cell>
              <Table.Cell>{view.assignment_id ?? "—"}</Table.Cell>
            </Table.Row>)}</Table.Body></Table.Root>
        </Box>}
    </Stack>
  </Stack>
}
