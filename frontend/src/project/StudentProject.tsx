import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, Field, Flex, Heading, Input, Link, NativeSelect, Stack, Text, Textarea } from "@chakra-ui/react"
import { api, ApiError, csrfToken } from "../api"
import { ErrorState, LoadingState, Panel } from "../student/ui"
import { ProjectText, TABLE_TEMPLATE, fileSize, when } from "./ProjectText"
import type { Milestone, ProjectFileRef, StudentProjectData } from "./types"

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.md,.zip"

async function uploadFile(file: File): Promise<ProjectFileRef> {
  const response = await fetch(`/api/v1/student/project/files?name=${encodeURIComponent(file.name)}`, {
    method: "POST", credentials: "same-origin", body: file,
    headers: { "X-CSRF-Token": csrfToken(), "Content-Type": file.type || "application/octet-stream" },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, typeof body.detail === "string" ? body.detail : "Envoi impossible.")
  return body as ProjectFileRef
}

/** ADR-0034, student side: my team, milestones with versioned submissions, teacher comments, defence slots. */
export function StudentProject() {
  const [data, setData] = useState<StudentProjectData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [invitee, setInvitee] = useState("")
  const load = useCallback(async () => {
    try { setData(await api<StudentProjectData>("/student/project")); setError(null) }
    catch (reason) { if (!(reason instanceof ApiError && reason.status === 401)) setError("Chargement impossible. Réessayez.") }
  }, [])
  useEffect(() => { void load() }, [load])

  async function act(path: string, body: unknown, success: string) {
    setNotice("")
    try { await api(path, "POST", body); setNotice(success); await load() }
    catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "Action impossible. Réessayez.") }
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!data) return <LoadingState label="Chargement de l’espace projet…" />
  if (!data.cohort_id) return <Panel><Text>Vous n’êtes inscrit dans aucune classe : l’espace projet n’est pas disponible.</Text></Panel>
  const team = data.team
  const available = (data.classmates ?? []).filter((item) => item.available)

  return <Stack gap="6">
    <Stack gap="1">
      <Link href="#/" color="brand.fg" fontSize="sm" alignSelf="start">← Tableau de bord</Link>
      <Heading as="h1" size={{ base: "2xl", md: "3xl" }}>Projet CampusEquip</Heading>
      <Text color="app.muted">{data.cohort} · travail en binôme (ou seul), dépôts par jalon, soutenance.</Text>
    </Stack>
    {notice && <Text role="status" color="brand.fg" fontWeight="medium">{notice}</Text>}

    <Panel as="section" aria-labelledby="team-title"><Stack gap="3">
      <Heading as="h2" size="md" id="team-title">Mon binôme</Heading>
      {team ? <>
        <Flex gap="2" wrap="wrap">{team.members.map((member) => <Badge key={member.id} colorPalette="brand" variant="subtle" rounded="full" px="3" py="1">{member.name}</Badge>)}
          {team.members.length === 1 && <Text fontSize="sm" color="app.muted">Vous travaillez seul pour l’instant.</Text>}</Flex>
        {team.invitations.length > 0 && <Text fontSize="sm">Invitation envoyée à {team.invitations.map((item) => item.name).join(", ")} : en attente.</Text>}
        {!team.full && <Flex gap="2" wrap="wrap" align="end">
          <Field.Root maxW="sm"><Field.Label>Inviter un camarade</Field.Label>
            <NativeSelect.Root><NativeSelect.Field value={invitee} onChange={(event) => setInvitee(event.target.value)}>
              <option value="">Choisir…</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
          <Button colorPalette="brand" variant="outline" disabled={!invitee}
            onClick={() => void act("/student/project/invitations", { user_id: Number(invitee) }, "Invitation envoyée.").then(() => setInvitee(""))}>Inviter</Button>
        </Flex>}
        <Button alignSelf="start" size="sm" variant="ghost" colorPalette="red" onClick={() => void act("/student/project/leave", undefined, "Vous avez quitté le binôme.")}>Quitter le binôme</Button>
      </> : <>
        <Text>Créez votre binôme, puis invitez un camarade ; il devra accepter. Vous pouvez aussi travailler seul.</Text>
        <Button alignSelf="start" colorPalette="brand" onClick={() => void act("/student/project/team", { cohort_id: data.cohort_id }, "Binôme créé.")}>Créer mon binôme</Button>
      </>}
      {(data.invitations ?? []).map((item) => <Flex key={item.id} gap="3" align="center" wrap="wrap" p="3" bg="brand.subtle" rounded="lg">
        <Text flex="1" minW="48">{item.from} vous invite dans son binôme ({item.members.join(", ")}).</Text>
        <Button size="sm" colorPalette="brand" onClick={() => void act(`/student/project/invitations/${item.id}/accept`, undefined, "Vous avez rejoint le binôme.")}>Accepter</Button>
        <Button size="sm" variant="outline" onClick={() => void act(`/student/project/invitations/${item.id}/decline`, undefined, "Invitation refusée.")}>Refuser</Button>
      </Flex>)}
    </Stack></Panel>

    <Stack as="section" gap="4" aria-labelledby="milestones-title">
      <Heading as="h2" size="md" id="milestones-title">Jalons</Heading>
      {(data.milestones ?? []).length === 0 && <Text color="app.muted">L’enseignant n’a pas encore publié de jalon.</Text>}
      {(data.milestones ?? []).map((milestone) => <MilestoneCard key={milestone.id} milestone={milestone} canSubmit={Boolean(team)} onSubmitted={load} />)}
    </Stack>

    <Panel as="section" aria-labelledby="slots-title"><Stack gap="2">
      <Heading as="h2" size="md" id="slots-title">Soutenances</Heading>
      {(data.slots ?? []).length === 0 ? <Text color="app.muted">Le planning n’est pas encore publié.</Text>
        : <Stack as="ul" listStyleType="none" p="0" m="0" gap="1.5">{data.slots!.map((slot) => <Flex as="li" key={slot.id} gap="3" wrap="wrap" p="2.5" rounded="md"
          bg={slot.mine ? "brand.subtle" : "transparent"} fontWeight={slot.mine ? "semibold" : "normal"}>
          <Text css={{ fontVariantNumeric: "tabular-nums" }}>{when(slot.starts_at)} – {slot.ends_at ? new Date(slot.ends_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""}</Text>
          <Text color="app.muted">{slot.label}</Text><Text>{slot.team.length ? slot.team.join(" + ") : "libre"}</Text>
          {slot.mine && <Badge colorPalette="brand">Votre créneau</Badge>}</Flex>)}</Stack>}
    </Stack></Panel>
  </Stack>
}

function MilestoneCard({ milestone, canSubmit, onSubmitted }: { milestone: Milestone; canSubmit: boolean; onSubmitted: () => Promise<void> }) {
  const [text, setText] = useState("")
  const [link, setLink] = useState("")
  const [files, setFiles] = useState<ProjectFileRef[]>([])
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const versions = milestone.submissions ?? []
  const latest = versions[0]
  const overdue = milestone.due_at !== null && new Date(milestone.due_at).getTime() < Date.now()

  async function onFiles(list: FileList | null) {
    if (!list) return
    setBusy(true)
    setMessage("")
    try {
      for (const file of Array.from(list)) {
        if (file.size > 20 * 1024 * 1024) throw new ApiError(413, `${file.name} : 20 Mo au plus.`)
        const uploaded = await uploadFile(file)
        setFiles((current) => [...current, uploaded])
      }
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : "Envoi impossible. Réessayez.")
    } finally {
      setBusy(false)
    }
  }
  async function submit() {
    setBusy(true)
    setMessage("")
    try {
      const result = await api<{ version: number; late: boolean }>(`/student/project/milestones/${milestone.id}/submissions`, "POST",
        { text, link: link.trim() || null, file_ids: files.map((file) => file.id) })
      setMessage(`Version ${result.version} déposée${result.late ? " (après la date limite)" : ""}.`)
      setText(""); setLink(""); setFiles([]); setPreview(false)
      await onSubmitted()
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : "Dépôt impossible. Réessayez.")
    } finally {
      setBusy(false)
    }
  }

  return <Panel as="article" aria-labelledby={`milestone-${milestone.id}`}><Stack gap="3">
    <Flex gap="2" align="center" wrap="wrap">
      <Heading as="h3" size="sm" id={`milestone-${milestone.id}`} flex="1">{milestone.title}</Heading>
      {milestone.due_at && <Badge colorPalette={overdue ? "saffron" : "gray"} variant="subtle">À rendre le {when(milestone.due_at)}</Badge>}
      {latest && <Badge colorPalette="green" variant="subtle">Version {latest.version} déposée</Badge>}
    </Flex>
    {milestone.instructions && <ProjectText text={milestone.instructions} />}
    {milestone.deliverables.length > 0 && <Box><Text fontWeight="semibold" fontSize="sm">Livrables attendus</Text>
      <Box as="ul" pl="5" fontSize="sm">{milestone.deliverables.map((item) => <li key={item}>{item}</li>)}</Box></Box>}
    {(milestone.comments ?? []).map((comment) => <Box key={comment.id} p="3" rounded="lg" bg="saffron.subtle" fontSize="sm">
      <Text fontWeight="semibold">Commentaire de l’enseignant · {when(comment.created_at)}</Text><Text whiteSpace="pre-wrap">{comment.text}</Text></Box>)}
    {latest && <Box borderWidth="1px" borderColor="app.border" rounded="lg" p="3">
      <Text fontSize="sm" color="app.muted" mb="2">Dernière version ({latest.version}) par {latest.submitted_by}, le {when(latest.created_at)}{latest.late ? " · après la date limite" : ""}</Text>
      <ProjectText text={latest.text} />
      {latest.link && <Link href={latest.link} target="_blank" rel="noreferrer" color="brand.fg">{latest.link}</Link>}
      {latest.files.map((file) => <Box key={file.id}><Link href={`/api/v1/student/project/files/${file.id}`} color="brand.fg">{file.name}</Link> <Text as="span" fontSize="sm" color="app.muted">({fileSize(file.size)})</Text></Box>)}
      {versions.length > 1 && <Text fontSize="xs" color="app.muted" mt="2">Versions précédentes : {versions.slice(1).map((v) => `v${v.version} (${when(v.created_at)})`).join(", ")}</Text>}
    </Box>}
    {canSubmit ? <Stack gap="2" as="form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <Field.Root><Field.Label>Texte {preview ? "(aperçu)" : ""}</Field.Label>
        {preview ? <Box p="3" borderWidth="1px" borderColor="app.border" rounded="md" w="full" minH="24"><ProjectText text={text} /></Box>
          : <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} maxLength={50000} placeholder="Votre texte. Les tableaux s’écrivent | col 1 | col 2 |" />}</Field.Root>
      <Flex gap="2" wrap="wrap">
        <Button size="sm" variant="outline" onClick={() => setText((value) => value + TABLE_TEMPLATE)} disabled={preview}>Insérer un tableau</Button>
        <Button size="sm" variant="ghost" onClick={() => setPreview(!preview)} aria-pressed={preview}>{preview ? "Modifier" : "Aperçu"}</Button>
      </Flex>
      <Field.Root><Field.Label>Lien (https)</Field.Label><Input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://github.com/…" /></Field.Root>
      <Field.Root><Field.Label>Fichiers (pdf, png, jpg, md, zip ; 20 Mo au plus)</Field.Label>
        <input type="file" multiple accept={ACCEPT} onChange={(event) => { void onFiles(event.target.files); event.target.value = "" }} /></Field.Root>
      {files.length > 0 && <Text fontSize="sm">Joints : {files.map((file) => `${file.name} (${fileSize(file.size)})`).join(", ")}</Text>}
      {message && <Text role="status" fontSize="sm" color="brand.fg">{message}</Text>}
      <Button type="submit" colorPalette="brand" alignSelf="start" loading={busy} disabled={!text.trim() && !link.trim() && files.length === 0}>
        {latest ? "Déposer une nouvelle version" : "Déposer"}</Button>
      {overdue && <Text fontSize="xs" color="saffron.fg">La date limite est passée : le dépôt reste possible et sera signalé comme en retard.</Text>}
    </Stack> : <Text fontSize="sm" color="app.muted">Créez ou rejoignez un binôme pour déposer.</Text>}
  </Stack></Panel>
}
