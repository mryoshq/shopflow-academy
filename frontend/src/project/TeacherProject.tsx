import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, Field, Flex, Heading, Input, Link, NativeSelect, Stack, Table, Tabs, Text, Textarea } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { ErrorState, LoadingState, Panel } from "../student/ui"
import { DetailPanel } from "./Drawer"
import { ProjectText, fileSize, when } from "./ProjectText"
import type { Submission, TeacherProjectData, TeamGrade } from "./types"

const CRITERIA: { key: keyof Omit<TeamGrade, "comment" | "students">; label: string }[] = [
  { key: "sql", label: "SQL" }, { key: "python", label: "Python" }, { key: "nosql", label: "MongoDB et Redis" },
  { key: "airflow", label: "Airflow" }, { key: "reproducibility", label: "Reproductibilité et preuves" },
]

/** ADR-0034, teacher side: teams, milestones, submissions, grid on 20, defence slots. `readOnly` for an allowed observer. */
export function TeacherProject({ assignmentId, readOnly = false }: { assignmentId: number; readOnly?: boolean }) {
  const [data, setData] = useState<TeacherProjectData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [tab, setTab] = useState("binomes")
  const base = readOnly ? `/observer/classes/${assignmentId}/project` : `/teacher/classes/${assignmentId}/project`
  const load = useCallback(async () => {
    try { setData(await api<TeacherProjectData>(base)); setError(null) }
    catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) return
      setError(reason instanceof ApiError && reason.status === 403 ? "L’enseignant n’a pas ouvert l’espace projet à votre compte." : "Chargement impossible. Réessayez.")
    }
  }, [base])
  useEffect(() => { void load() }, [load])

  async function act(method: string, path: string, body: unknown, success: string) {
    setNotice("")
    try { await api(path, method, body); setNotice(success); await load(); return true }
    catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "Action impossible. Réessayez."); return false }
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!data) return <LoadingState label="Chargement du projet…" />
  return <Stack gap="4">
    <Flex gap="3" align="center" wrap="wrap"><Heading as="h2" size="lg" flex="1">Projet CampusEquip</Heading>
      {!readOnly && <Button size="sm" variant="outline" asChild><a href={`/api/v1/teacher/classes/${assignmentId}/project/grades.csv`} download>Exporter les notes du projet (CSV)</a></Button>}</Flex>
    <Text fontSize="sm" color="app.muted">Note du projet sur 20, séparée de la note du cours : SQL 4, Python 4, MongoDB et Redis 3, Airflow 3, reproductibilité et preuves 2 (communs), compréhension individuelle 4 par étudiant.</Text>
    {notice && <Text role="status" color="brand.fg" fontWeight="medium">{notice}</Text>}
    <Tabs.Root value={tab} onValueChange={(event) => setTab(event.value)} variant="line" colorPalette="brand" lazyMount>
      <Tabs.List aria-label="Projet" overflowX="auto">
        <Tabs.Trigger value="binomes">Binômes</Tabs.Trigger><Tabs.Trigger value="jalons">Jalons</Tabs.Trigger>
        <Tabs.Trigger value="depots">Dépôts</Tabs.Trigger><Tabs.Trigger value="notes">Notes</Tabs.Trigger><Tabs.Trigger value="soutenances">Soutenances</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="binomes" pt="5"><Teams data={data} readOnly={readOnly} act={act} /></Tabs.Content>
      <Tabs.Content value="jalons" pt="5"><Milestones data={data} readOnly={readOnly} act={act} /></Tabs.Content>
      <Tabs.Content value="depots" pt="5"><Submissions data={data} readOnly={readOnly} act={act} /></Tabs.Content>
      <Tabs.Content value="notes" pt="5"><Grades data={data} readOnly={readOnly} act={act} /></Tabs.Content>
      <Tabs.Content value="soutenances" pt="5"><Slots data={data} readOnly={readOnly} act={act} assignmentId={assignmentId} /></Tabs.Content>
    </Tabs.Root>
  </Stack>
}

type Act = (method: string, path: string, body: unknown, success: string) => Promise<boolean>
type Part = { data: TeacherProjectData; readOnly: boolean; act: Act }
const teamName = (data: TeacherProjectData, id: number | null) => data.teams.find((team) => team.id === id)?.members.map((m) => m.name).join(" + ") ?? "—"

function Teams({ data, readOnly, act }: Part) {
  const [first, setFirst] = useState("")
  const [second, setSecond] = useState("")
  const ids = [first, second].filter(Boolean).map(Number)
  return <Stack gap="4">
    {data.teams.length === 0 && <Text color="app.muted">Aucun binôme pour le moment.</Text>}
    <Stack as="ul" listStyleType="none" p="0" m="0" gap="2">{data.teams.map((team) => <Flex as="li" key={team.id} gap="3" align="center" wrap="wrap" p="3" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
      <Text fontWeight="semibold" flex="1">{team.members.map((member) => member.name).join(" + ") || "(vide)"}</Text>
      {team.members.length === 1 && <Badge variant="subtle">Seul</Badge>}
      {!readOnly && team.members.length === 2 && <Button size="xs" variant="outline" onClick={() => void act("PUT", `/teacher/project/teams/${team.id}`, { user_ids: [team.members[0].id] }, "Composition corrigée.")}>
        Retirer {team.members[1].name}</Button>}
    </Flex>)}</Stack>
    <Box><Text fontWeight="semibold">Sans binôme ({data.alone.length})</Text><Text fontSize="sm" color="app.muted">{data.alone.map((item) => item.name).join(", ") || "Tout le monde a un binôme."}</Text></Box>
    {!readOnly && data.alone.length > 0 && <Panel><Stack gap="2">
      <Text fontWeight="semibold">Former un binôme (ou un étudiant seul)</Text>
      <Flex gap="2" wrap="wrap">{[[first, setFirst], [second, setSecond]].map(([value, set], index) => <NativeSelect.Root key={index} maxW="xs">
        <NativeSelect.Field aria-label={index ? "Second étudiant (facultatif)" : "Premier étudiant"} value={value as string} onChange={(event) => (set as (v: string) => void)(event.target.value)}>
          <option value="">{index ? "Second (facultatif)" : "Premier étudiant"}</option>{data.alone.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>)}</Flex>
      <Button alignSelf="start" colorPalette="brand" disabled={!first || first === second}
        onClick={() => void act("POST", `/teacher/classes/${data.assignment_id}/project/teams`, { user_ids: ids }, "Binôme créé.").then((ok) => { if (ok) { setFirst(""); setSecond("") } })}>Créer</Button>
    </Stack></Panel>}
  </Stack>
}

function Milestones({ data, readOnly, act }: Part) {
  const [title, setTitle] = useState("")
  const [instructions, setInstructions] = useState("")
  const [due, setDue] = useState("")
  const [deliverables, setDeliverables] = useState("")
  return <Stack gap="4">
    {data.milestones.map((milestone) => <Panel key={milestone.id} as="article"><Stack gap="2">
      <Flex gap="2" align="center" wrap="wrap"><Heading as="h3" size="sm" flex="1">{milestone.title}</Heading>
        <Badge variant="subtle">{milestone.due_at ? `À rendre le ${when(milestone.due_at)}` : "Sans date limite"}</Badge>
        {!readOnly && <Button size="xs" variant="ghost" colorPalette="red" onClick={() => void act("DELETE", `/teacher/project/milestones/${milestone.id}`, undefined, "Jalon supprimé.")}>Supprimer</Button>}</Flex>
      <ProjectText text={milestone.instructions} />
      {milestone.deliverables.length > 0 && <Text fontSize="sm">Livrables : {milestone.deliverables.join(" · ")}</Text>}
    </Stack></Panel>)}
    {!readOnly && <Panel as="form" onSubmit={(event: React.FormEvent) => { event.preventDefault()
      void act("POST", `/teacher/classes/${data.assignment_id}/project/milestones`, { title, instructions, due_at: due ? new Date(due).toISOString() : null,
        deliverables: deliverables.split("\n"), sort_order: data.milestones.length }, "Jalon publié.").then((ok) => { if (ok) { setTitle(""); setInstructions(""); setDue(""); setDeliverables("") } }) }}>
      <Stack gap="3"><Text fontWeight="semibold">Nouveau jalon</Text>
        <Field.Root required><Field.Label>Titre</Field.Label><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Conception du 29 octobre" /></Field.Root>
        <Field.Root><Field.Label>Consignes</Field.Label><Textarea rows={4} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></Field.Root>
        <Field.Root><Field.Label>Date limite (facultative)</Field.Label><Input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} maxW="xs" /></Field.Root>
        <Field.Root><Field.Label>Livrables attendus (un par ligne)</Field.Label><Textarea rows={3} value={deliverables} onChange={(event) => setDeliverables(event.target.value)}
          placeholder={"Tableau des sources\nRègles de qualité\nSchéma"} /></Field.Root>
        <Button type="submit" colorPalette="brand" alignSelf="start" disabled={!title.trim()}>Publier le jalon</Button></Stack>
    </Panel>}
  </Stack>
}

function Submissions({ data, readOnly, act }: Part) {
  const [open, setOpen] = useState<{ team: number; milestone: number } | null>(null)
  const [detail, setDetail] = useState<{ submissions: Submission[]; comments: { id: number; text: string; created_at: string | null }[] } | null>(null)
  const [comment, setComment] = useState("")
  useEffect(() => {
    if (!open || readOnly) { setDetail(null); return }
    void api<{ submissions: Submission[]; comments: { id: number; text: string; created_at: string | null }[] }>(`/teacher/project/teams/${open.team}/milestones/${open.milestone}`)
      .then(setDetail).catch(() => setDetail(null))
  }, [open, readOnly])
  const milestone = data.milestones.find((item) => item.id === open?.milestone)
  return <Stack gap="5">
    {data.milestones.length === 0 && <Text color="app.muted">Publiez d’abord un jalon.</Text>}
    {data.milestones.map((item) => <Stack key={item.id} gap="2">
      <Heading as="h3" size="sm">{item.title} <Text as="span" fontWeight="normal" color="app.muted">({item.submissions.length} / {data.teams.length} binômes)</Text></Heading>
      <Box overflowX="auto" tabIndex={0} role="region" aria-label={`Dépôts : ${item.title}`} borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
        <Table.Root size="sm"><Table.Header><Table.Row bg="app.sunken">{["Binôme", "Version", "Déposé le", "", ""].map((label, i) => <Table.ColumnHeader key={i}>{label}</Table.ColumnHeader>)}</Table.Row></Table.Header>
          <Table.Body>{data.teams.map((team) => {
            const sub = item.submissions.find((entry) => entry.team_id === team.id)
            return <Table.Row key={team.id}><Table.Cell fontWeight="semibold">{team.members.map((m) => m.name).join(" + ")}</Table.Cell>
              <Table.Cell>{sub ? `v${sub.version}` : "—"}</Table.Cell><Table.Cell>{sub ? when(sub.created_at) : "Pas encore déposé"}</Table.Cell>
              <Table.Cell>{sub?.late && <Badge colorPalette="saffron">En retard</Badge>}</Table.Cell>
              <Table.Cell>{sub && !readOnly && <Button size="xs" variant="outline" onClick={() => setOpen({ team: team.id, milestone: item.id })}
                aria-label={`Consulter le dépôt de ${team.members.map((m) => m.name).join(" et ")}`}>Consulter</Button>}</Table.Cell></Table.Row>
          })}</Table.Body></Table.Root>
      </Box>
    </Stack>)}
    <DetailPanel open={open !== null} title={open ? `${teamName(data, open.team)} · ${milestone?.title ?? ""}` : "Dépôt"} onClose={() => { setOpen(null); setComment("") }}>
      {!detail ? <Text role="status" color="app.muted">Chargement…</Text> : <Stack gap="4">
        {detail.submissions.map((sub) => <Box key={sub.id} borderWidth="1px" borderColor="app.border" rounded="lg" p="3">
          <Flex gap="2" align="center" wrap="wrap" mb="2"><Text fontWeight="semibold">Version {sub.version}</Text><Text fontSize="sm" color="app.muted">{when(sub.created_at)} · {sub.submitted_by}</Text>
            {sub.late && <Badge colorPalette="saffron">Après la date limite</Badge>}</Flex>
          <ProjectText text={sub.text} />
          {sub.link && <Link href={sub.link} target="_blank" rel="noreferrer" color="brand.fg" display="block">{sub.link}</Link>}
          {sub.files.map((file) => <Link key={file.id} href={`/api/v1/teacher/project/files/${file.id}`} color="brand.fg" display="block">{file.name} ({fileSize(file.size)})</Link>)}
        </Box>)}
        <Stack gap="2"><Text fontWeight="semibold">Commentaires (visibles du binôme)</Text>
          {detail.comments.map((c) => <Box key={c.id} p="2.5" rounded="md" bg="app.sunken" fontSize="sm"><Text color="app.muted">{when(c.created_at)}</Text><Text whiteSpace="pre-wrap">{c.text}</Text></Box>)}
          <Textarea aria-label="Nouveau commentaire" rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
          <Button alignSelf="start" colorPalette="brand" disabled={!comment.trim() || !open} onClick={() => open && void act("POST", `/teacher/project/teams/${open.team}/comments`,
            { milestone_id: open.milestone, text: comment }, "Commentaire envoyé au binôme.").then((ok) => { if (ok) { setComment(""); setOpen({ ...open }) } })}>Envoyer le commentaire</Button>
        </Stack>
      </Stack>}
    </DetailPanel>
  </Stack>
}

function Grades({ data, readOnly, act }: Part) {
  return <Stack gap="4">{data.teams.length === 0 ? <Text color="app.muted">Aucun binôme à noter.</Text>
    : data.teams.map((team) => <GradeForm key={team.id} team={team} data={data} readOnly={readOnly} act={act} />)}</Stack>
}

function GradeForm({ team, data, readOnly, act }: Part & { team: TeacherProjectData["teams"][number] }) {
  const toText = (value: number | null) => value === null ? "" : String(value).replace(".", ",")
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(CRITERIA.map((c) => [c.key, toText(team.grade[c.key])])))
  const [individual, setIndividual] = useState<Record<string, string>>(() => Object.fromEntries(team.grade.students.map((s) => [String(s.id), toText(s.individual)])))
  const [comment, setComment] = useState(team.grade.comment)
  const parse = (value: string) => value.trim() === "" ? null : Number(value.replace(",", "."))
  return <Panel as="section" aria-label={`Note de ${team.members.map((m) => m.name).join(" et ")}`}><Stack gap="3">
    <Heading as="h3" size="sm">{team.members.map((m) => m.name).join(" + ")}</Heading>
    <Flex gap="3" wrap="wrap">{CRITERIA.map((criterion) => <Field.Root key={criterion.key} maxW="40">
      <Field.Label fontSize="sm">{criterion.label} /{data.grid[criterion.key]}</Field.Label>
      <Input inputMode="decimal" value={values[criterion.key]} disabled={readOnly} onChange={(event) => setValues({ ...values, [criterion.key]: event.target.value })} /></Field.Root>)}</Flex>
    <Flex gap="3" wrap="wrap">{team.grade.students.map((student) => <Field.Root key={student.id} maxW="56">
      <Field.Label fontSize="sm">Compréhension individuelle de {student.name} /{data.individual_max}</Field.Label>
      <Input inputMode="decimal" value={individual[String(student.id)] ?? ""} disabled={readOnly} onChange={(event) => setIndividual({ ...individual, [String(student.id)]: event.target.value })} /></Field.Root>)}</Flex>
    <Text fontSize="sm" css={{ fontVariantNumeric: "tabular-nums" }}>{team.grade.students.map((s) => `${s.name} : ${s.total === null ? "—" : String(s.total).replace(".", ",")} / 20`).join(" · ")}</Text>
    <Field.Root><Field.Label fontSize="sm">Commentaire</Field.Label><Textarea rows={2} value={comment} disabled={readOnly} onChange={(event) => setComment(event.target.value)} /></Field.Root>
    {!readOnly && <Button alignSelf="start" colorPalette="brand" onClick={() => void act("PUT", `/teacher/project/teams/${team.id}/grade`, {
      ...Object.fromEntries(CRITERIA.map((c) => [c.key, parse(values[c.key])])),
      individual: Object.fromEntries(Object.entries(individual).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v.replace(",", "."))])), comment,
    }, "Note du projet enregistrée.")}>Enregistrer la note</Button>}
  </Stack></Panel>
}

function Slots({ data, readOnly, act, assignmentId }: Part & { assignmentId: number }) {
  const [start, setStart] = useState("2026-11-23T09:00")
  const [minutes, setMinutes] = useState("20")
  const [label, setLabel] = useState("")
  return <Stack gap="4">
    {data.slots.length === 0 && <Text color="app.muted">Aucun créneau. Les créneaux sont visibles des étudiants.</Text>}
    <Stack as="ul" listStyleType="none" p="0" m="0" gap="2">{data.slots.map((slot) => <Flex as="li" key={slot.id} gap="3" align="center" wrap="wrap" p="3" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
      <Text css={{ fontVariantNumeric: "tabular-nums" }} minW="48">{when(slot.starts_at)} – {slot.ends_at ? new Date(slot.ends_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""}</Text>
      <Text color="app.muted">{slot.label}</Text>
      {readOnly ? <Text>{slot.team.join(" + ") || "libre"}</Text> : <NativeSelect.Root maxW="xs"><NativeSelect.Field aria-label={`Binôme du créneau de ${when(slot.starts_at)}`} value={slot.team_id ?? ""}
        onChange={(event) => void act("PATCH", `/teacher/project/slots/${slot.id}`, event.target.value ? { team_id: Number(event.target.value) } : { clear_team: true }, "Créneau mis à jour.")}>
        <option value="">Libre</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.members.map((m) => m.name).join(" + ")}</option>)}
      </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>}
      {!readOnly && <Button size="xs" variant="ghost" colorPalette="red" onClick={() => void act("DELETE", `/teacher/project/slots/${slot.id}`, undefined, "Créneau supprimé.")}>Supprimer</Button>}
    </Flex>)}</Stack>
    {!readOnly && <Panel><Flex gap="3" wrap="wrap" align="end">
      <Field.Root maxW="56"><Field.Label>Début</Field.Label><Input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></Field.Root>
      <Field.Root maxW="28"><Field.Label>Durée (min)</Field.Label><Input inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></Field.Root>
      <Field.Root maxW="48"><Field.Label>Salle ou précision</Field.Label><Input value={label} onChange={(event) => setLabel(event.target.value)} /></Field.Root>
      <Button colorPalette="brand" disabled={!start || !(Number(minutes) > 0)} onClick={() => {
        const begin = new Date(start)
        void act("POST", `/teacher/classes/${assignmentId}/project/slots`, { starts_at: begin.toISOString(), ends_at: new Date(begin.getTime() + Number(minutes) * 60000).toISOString(), label },
          "Créneau ajouté.").then((ok) => { if (ok) setStart(new Date(begin.getTime() + Number(minutes) * 60000 - begin.getTimezoneOffset() * 60000).toISOString().slice(0, 16)) })
      }}>Ajouter le créneau</Button>
    </Flex></Panel>}
  </Stack>
}
