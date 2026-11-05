import { locale, t, tn } from "../i18n"
import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, Field, Flex, Heading, Input, Link, NativeSelect, Stack, Text, Textarea } from "@chakra-ui/react"
import { api, ApiError, csrfToken } from "../api"
import { ErrorState, Icon, LoadingState, Panel } from "../student/ui"
import { CAMPUSEQUIP_READY } from "../campusequip"
import { ProjectText, TABLE_TEMPLATE, fileSize, when } from "./ProjectText"
import { SurpriseReveal } from "./SurpriseDraw"
import { useStudentHref } from "../useHashRoute"
import { READ_ONLY, studentViewActive } from "../studentview/adapter"
import type { Milestone, ProjectFileRef, StudentProjectData } from "./types"

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.md,.zip"

async function uploadFile(file: File): Promise<ProjectFileRef> {
  if (studentViewActive()) throw new ApiError(403, t(READ_ONLY))  // ADR-0043: nothing is sent
  const response = await fetch(`/api/v1/student/project/files?name=${encodeURIComponent(file.name)}`, {
    method: "POST", credentials: "same-origin", body: file,
    headers: { "X-CSRF-Token": csrfToken(), "Content-Type": file.type || "application/octet-stream" },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, typeof body.detail === "string" ? body.detail : t("Envoi impossible."))
  return body as ProjectFileRef
}

/** Calendar days left until a deadline (0 = today, negative = passed). */
export function daysLeft(due: string, now = Date.now()): number {
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
  return Math.round((day(new Date(due)) - day(new Date(now))) / 86_400_000)
}

/** Upcoming milestones first (by date, undated last), then the passed ones (ADR-0051: shown folded). */
export function splitMilestones(milestones: Milestone[], now = Date.now()): { current: Milestone[]; past: Milestone[] } {
  const passed = (item: Milestone) => item.due_at !== null && new Date(item.due_at).getTime() < now
  const byDate = (a: Milestone, b: Milestone) => (a.due_at ? new Date(a.due_at).getTime() : Infinity) - (b.due_at ? new Date(b.due_at).getTime() : Infinity) || a.sort_order - b.sort_order
  return { current: milestones.filter((item) => !passed(item)).sort(byDate), past: milestones.filter(passed).sort(byDate).reverse() }
}

/**
 * ADR-0034, student side: milestones (what to hand in, date, days left, status, action), my team, defence slots.
 * ADR-0051: the Projet tab of the home page; the CampusEquip animation stays behind « Voir l'animation », after the action.
 */
export function StudentProject({ navigate }: { navigate?: (path: string) => void }) {
  const [data, setData] = useState<StudentProjectData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [invitee, setInvitee] = useState("")
  const href = useStudentHref()
  const load = useCallback(async () => {
    try { setData(await api<StudentProjectData>("/student/project")); setError(null) }
    catch (reason) { if (!(reason instanceof ApiError && reason.status === 401)) setError(t("Chargement impossible. Réessayez.")) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {  // ADR-0041: a draw notification refreshes the page (and brings the reveal)
    const refresh = () => void load()
    window.addEventListener("academy:refresh", refresh)
    return () => window.removeEventListener("academy:refresh", refresh)
  }, [load])

  async function act(path: string, body: unknown, success: string) {
    setNotice("")
    try { await api(path, "POST", body); setNotice(success); await load() }
    catch (reason) { setNotice(reason instanceof ApiError ? reason.message : t("Action impossible. Réessayez.")) }
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!data) return <LoadingState label={t("Chargement de l’espace projet…")} />
  if (!data.cohort_id) return <Panel><Text>{t("Vous n’êtes inscrit dans aucune classe : l’espace projet n’est pas disponible.")}</Text></Panel>
  const team = data.team
  const available = (data.classmates ?? []).filter((item) => item.available)

  const complete = Boolean(team && team.members.length >= 2)
  const { current, past } = splitMilestones(data.milestones ?? [])
  const teamPanel = <Panel as="section" aria-labelledby="team-title" key="team"><Stack gap="3">
      <Heading as="h2" size="md" id="team-title">{t("Mon binôme")}</Heading>
      {team ? <>
        <Flex gap="2" wrap="wrap">{team.members.map((member) => <Badge key={member.id} colorPalette="brand" variant="subtle" rounded="full" px="3" py="1">{member.name}</Badge>)}
          {team.members.length === 1 && <Text fontSize="sm" color="app.muted">{t("En attente d’un camarade : invitez-le ci-dessous. Seul, vous ne pouvez pas déposer.")}</Text>}
          {team.members.length === 2 && !team.full && <Text fontSize="sm" color="app.muted">{t("Vous pouvez encore inviter un troisième camarade (facultatif).")}</Text>}</Flex>
        {team.invitations.length > 0 && <Text fontSize="sm">{t("Invitation envoyée à")}{" "}{team.invitations.map((item) => item.name).join(", ")} {t(": en attente.")}</Text>}
        {!team.full && <Flex gap="2" wrap="wrap" align="end">
          <Field.Root maxW="sm"><Field.Label>{t("Inviter un camarade")}</Field.Label>
            <NativeSelect.Root><NativeSelect.Field value={invitee} onChange={(event) => setInvitee(event.target.value)}>
              <option value="">{t("Choisir…")}</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
          <Button colorPalette="brand" variant="outline" disabled={!invitee}
            onClick={() => void act("/student/project/invitations", { user_id: Number(invitee) }, t("Invitation envoyée.")).then(() => setInvitee(""))}>{t("Inviter")}</Button>
        </Flex>}
        <Button alignSelf="start" size="sm" variant="ghost" colorPalette="red" onClick={() => void act("/student/project/leave", undefined, t("Vous avez quitté le binôme."))}>{t("Quitter le binôme")}</Button>
      </> : <>
        <Text>{t("Le projet se fait à deux ou à trois. Formez votre équipe en invitant un ou deux camarades, qui devront accepter, ou tentez le binôme surprise : l’enseignant tirera au sort les étudiants encore sans équipe.")}</Text>
        {data.draw?.registered ? <Stack gap="2" p="3" rounded="lg" bg="brand.subtle" data-testid="draw-status">
          <Text fontWeight="semibold">{t("Vous êtes inscrit au binôme surprise.")}</Text>
          <Text fontSize="sm">{tn("{{count}} étudiant inscrit pour l’instant. Vous serez prévenu après le tirage.", data.draw.registered_count)}</Text>
          <Flex gap="2" wrap="wrap">
            <Button size="sm" variant="outline" colorPalette="brand" onClick={() => void act("/student/project/draw/leave", { cohort_id: data.cohort_id }, t("Vous êtes sorti du tirage."))}>{t("Me retirer du tirage")}</Button>
            <Button size="sm" variant="ghost" colorPalette="brand" onClick={() => void act("/student/project/team", { cohort_id: data.cohort_id }, t("Binôme créé : invitez un camarade."))}>{t("Former mon binôme")}</Button>
          </Flex>
        </Stack> : <Flex gap="2" wrap="wrap">
          <Button colorPalette="brand" onClick={() => void act("/student/project/team", { cohort_id: data.cohort_id }, t("Binôme créé : invitez un camarade."))}>{t("Former mon binôme")}</Button>
          <Button colorPalette="brand" variant="outline" onClick={() => void act("/student/project/draw/join", { cohort_id: data.cohort_id }, t("Inscription au binôme surprise enregistrée."))}>{t("Je tente le binôme surprise")}</Button>
        </Flex>}
      </>}
      {(data.invitations ?? []).map((item) => <Flex key={item.id} gap="3" align="center" wrap="wrap" p="3" bg="brand.subtle" rounded="lg">
        <Text flex="1" minW="48">{item.from} {t("vous invite dans son binôme (")}{item.members.join(", ")}).</Text>
        <Button size="sm" colorPalette="brand" onClick={() => void act(`/student/project/invitations/${item.id}/accept`, undefined, t("Vous avez rejoint le binôme."))}>{t("Accepter")}</Button>
        <Button size="sm" variant="outline" onClick={() => void act(`/student/project/invitations/${item.id}/decline`, undefined, t("Invitation refusée."))}>{t("Refuser")}</Button>
      </Flex>)}
    </Stack></Panel>

  const milestonesSection = <Stack as="section" gap="4" aria-labelledby="milestones-title" key="milestones">
    <Heading as="h2" size="lg" id="milestones-title">{t("Jalons")}</Heading>
    {current.length === 0 && past.length === 0 && <Text color="app.muted">{t("Aucun jalon pour le moment.")}</Text>}
    {current.length === 0 && past.length > 0 && <Text color="app.muted">{t("Tous les jalons sont passés.")}</Text>}
    {current.map((milestone) => <MilestoneCard key={milestone.id} milestone={milestone} canSubmit={complete} onSubmitted={load} />)}
    {past.length > 0 && <Box as="details" data-testid="past-milestones">
      <Box as="summary" cursor="pointer" fontWeight="semibold" color="brand.fg" py="2">{tn("{{count}} jalon passé", past.length)}</Box>
      <Stack gap="4" mt="3">{past.map((milestone) => <MilestoneCard key={milestone.id} milestone={milestone} canSubmit={complete} onSubmitted={load} />)}</Stack>
    </Box>}
  </Stack>

  return <Stack gap="6">
    <Heading as="h2" srOnly>{t("Projet CampusEquip")}</Heading>
    {data.surprise && data.surprise.partners.length > 0 && <SurpriseReveal key={data.surprise.draw_id} partners={data.surprise.partners} cohortId={data.cohort_id} />}
    {notice && <Text role="status" color="brand.fg" fontWeight="medium">{notice}</Text>}
    {/* Without a complete team nothing can be handed in: the team comes first. */}
    {complete ? [milestonesSection, teamPanel] : [teamPanel, milestonesSection]}

    <Panel as="section" aria-labelledby="slots-title"><Stack gap="2">
      <Heading as="h2" size="md" id="slots-title">{t("Soutenances")}</Heading>
      {(data.slots ?? []).length === 0 ? <Text color="app.muted">{t("Les créneaux de soutenance ne sont pas encore fixés.")}</Text>
        : <Stack as="ul" listStyleType="none" p="0" m="0" gap="1.5">{data.slots!.map((slot) => <Flex as="li" key={slot.id} gap="3" wrap="wrap" p="2.5" rounded="md"
          bg={slot.mine ? "brand.subtle" : "transparent"} fontWeight={slot.mine ? "semibold" : "normal"}>
          <Text css={{ fontVariantNumeric: "tabular-nums" }}>{when(slot.starts_at)} – {slot.ends_at ? new Date(slot.ends_at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) : ""}</Text>
          <Text color="app.muted">{slot.label}</Text><Text>{slot.team.length ? slot.team.join(" + ") : t("libre")}</Text>
          {slot.mine && <Badge colorPalette="brand">{t("Votre créneau")}</Badge>}</Flex>)}</Stack>}
    </Stack></Panel>

    {/* ADR-0051: the animation never comes before the action. */}
    {CAMPUSEQUIP_READY && <Flex as="section" aria-label={t("Animation CampusEquip")} gap="3" align="center" wrap="wrap" px={{ base: "5", md: "7" }} py="5" rounded="card" borderWidth="1px" borderColor="app.border" bg="app.surface">
      <Stack gap="0" flex="1" minW="48"><Text fontWeight="semibold">{t("Le voyage d’une location")}</Text>
        <Text fontSize="sm" color="app.muted">{t("Sept étapes : un lot CampusEquip, des guichets jusqu’aux indicateurs.")}</Text></Stack>
      {navigate ? <Button variant="outline" colorPalette="brand" onClick={() => navigate("/campusequip/1")}>{t("Voir l’animation")}<Icon name="arrow-right" /></Button>
        : <Button variant="outline" colorPalette="brand" asChild><a href={href("/campusequip/1")}>{t("Voir l’animation")}<Icon name="arrow-right" /></a></Button>}
    </Flex>}
  </Stack>
}

function MilestoneCard({ milestone, canSubmit, onSubmitted }: { milestone: Milestone; canSubmit: boolean; onSubmitted: () => Promise<void> }) {
  const [text, setText] = useState("")
  const [link, setLink] = useState("")
  const [files, setFiles] = useState<ProjectFileRef[]>([])
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [open, setOpen] = useState(false)
  const versions = milestone.submissions ?? []
  const latest = versions[0]
  const overdue = milestone.due_at !== null && new Date(milestone.due_at).getTime() < Date.now()
  const left = milestone.due_at ? daysLeft(milestone.due_at) : null
  const status = latest ? { label: t("Déposé (version {{version}})", { version: latest.version }), palette: "green" }
    : overdue ? { label: t("Non déposé"), palette: "saffron" } : { label: t("À rendre"), palette: "brand" }
  const remaining = left === null ? t("Sans date limite") : overdue ? t("Échéance passée") : left === 0 ? t("Dernier jour") : tn("Plus que {{count}} jour", left)

  async function onFiles(list: FileList | null) {
    if (!list) return
    setBusy(true)
    setMessage("")
    try {
      for (const file of Array.from(list)) {
        if (file.size > 20 * 1024 * 1024) throw new ApiError(413, t("{{name}} : 20 Mo au plus.", { name: file.name }))
        const uploaded = await uploadFile(file)
        setFiles((current) => [...current, uploaded])
      }
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : t("Envoi impossible. Réessayez."))
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
      setMessage(t("Version {{version}} déposée{{p1}}.", { version: result.version, p1: result.late ? t(" (après la date limite)") : "" }))
      setText(""); setLink(""); setFiles([]); setPreview(false); setOpen(false)
      await onSubmitted()
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : t("Dépôt impossible. Réessayez."))
    } finally {
      setBusy(false)
    }
  }

  return <Panel as="article" aria-labelledby={`milestone-${milestone.id}`} data-testid="milestone-card"><Stack gap="4">
    <Flex gap="3" align="start" wrap="wrap">
      <Stack gap="1" flex="1" minW="48">
        <Heading as="h3" size="md" id={`milestone-${milestone.id}`}>{milestone.title}</Heading>
        {milestone.due_at && <Text fontSize="sm" color="app.muted">{t("À rendre le")}{" "}{when(milestone.due_at)}</Text>}
      </Stack>
      <Flex direction={{ base: "row", sm: "column" }} gap={{ base: "3", sm: "1" }} align={{ base: "center", sm: "end" }} wrap="wrap">
        <Badge colorPalette={status.palette} variant="subtle" rounded="full" px="2.5">{status.label}</Badge>
        <Text fontSize="sm" fontWeight="semibold" color={overdue ? "app.muted" : "brand.fg"} css={{ fontVariantNumeric: "tabular-nums" }}>{remaining}</Text>
      </Flex>
    </Flex>
    {milestone.deliverables.length > 0 && <Box><Text fontWeight="semibold" fontSize="sm">{t("Ce qu’il faut rendre")}</Text>
      <Box as="ul" pl="5" fontSize="sm" listStyleType="disc">{milestone.deliverables.map((item) => <li key={item}>{item}</li>)}</Box></Box>}
    {milestone.instructions && (milestone.deliverables.length > 0
      ? <Box as="details"><Box as="summary" cursor="pointer" fontSize="sm" color="brand.fg" fontWeight="medium">{t("Consignes détaillées")}</Box><Box mt="2"><ProjectText text={milestone.instructions} /></Box></Box>
      : <ProjectText text={milestone.instructions} />)}
    {(milestone.comments ?? []).map((comment) => <Box key={comment.id} p="3" rounded="lg" bg="saffron.subtle" fontSize="sm">
      <Text fontWeight="semibold">{t("Commentaire de l’enseignant ·")}{" "}{when(comment.created_at)}</Text><Text whiteSpace="pre-wrap">{comment.text}</Text></Box>)}
    {latest && <Box borderWidth="1px" borderColor="app.border" rounded="lg" p="3">
      <Text fontSize="sm" color="app.muted" mb="2">{t("Dernière version (")}{latest.version}{t(") par")}{" "}{latest.submitted_by}{t(", le")}{" "}{when(latest.created_at)}{latest.late ? t(" · après la date limite") : ""}</Text>
      <ProjectText text={latest.text} />
      {latest.link && <Link href={latest.link} target="_blank" rel="noreferrer" color="brand.fg">{latest.link}</Link>}
      {latest.files.map((file) => <Box key={file.id}><Link href={`/api/v1/student/project/files/${file.id}`} color="brand.fg">{file.name}</Link> <Text as="span" fontSize="sm" color="app.muted">({fileSize(file.size)})</Text></Box>)}
      {versions.length > 1 && <Text fontSize="xs" color="app.muted" mt="2">{t("Versions précédentes :")}{" "}{versions.slice(1).map((v) => `v${v.version} (${when(v.created_at)})`).join(", ")}</Text>}
    </Box>}
    {canSubmit && !open && <Flex gap="3" align="center" wrap="wrap">
      <Button colorPalette="brand" variant={latest ? "outline" : "solid"} onClick={() => setOpen(true)}>
        {latest ? t("Déposer une nouvelle version") : t("Déposer")}</Button>
      {message && <Text role="status" fontSize="sm" color="brand.fg">{message}</Text>}
    </Flex>}
    {canSubmit ? open && <Stack gap="2" as="form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <Field.Root><Field.Label>{t("Texte")}{" "}{preview ? t("(aperçu)") : ""}</Field.Label>
        {preview ? <Box p="3" borderWidth="1px" borderColor="app.border" rounded="md" w="full" minH="24"><ProjectText text={text} /></Box>
          : <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} maxLength={50000} placeholder={t("Votre texte. Les tableaux s’écrivent | col 1 | col 2 |")} />}</Field.Root>
      <Flex gap="2" wrap="wrap">
        <Button size="sm" variant="outline" onClick={() => setText((value) => value + TABLE_TEMPLATE)} disabled={preview}>{t("Insérer un tableau")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setPreview(!preview)} aria-pressed={preview}>{preview ? t("Modifier") : t("Aperçu")}</Button>
      </Flex>
      <Field.Root><Field.Label>{t("Lien (https)")}</Field.Label><Input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://github.com/…" /></Field.Root>
      <Field.Root><Field.Label>{t("Fichiers (pdf, png, jpg, md, zip ; 20 Mo au plus)")}</Field.Label>
        <input type="file" multiple accept={ACCEPT} onChange={(event) => { void onFiles(event.target.files); event.target.value = "" }} /></Field.Root>
      {files.length > 0 && <Text fontSize="sm">{t("Joints :")}{" "}{files.map((file) => `${file.name} (${fileSize(file.size)})`).join(", ")}</Text>}
      {message && <Text role="status" fontSize="sm" color="brand.fg">{message}</Text>}
      <Flex gap="2" wrap="wrap">
        <Button type="submit" colorPalette="brand" loading={busy} disabled={!text.trim() && !link.trim() && files.length === 0}>
          {latest ? t("Déposer la nouvelle version") : t("Envoyer le dépôt")}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("Annuler")}</Button>
      </Flex>
      {overdue && <Text fontSize="xs" color="saffron.fg">{t("La date limite est passée : le dépôt reste possible et sera signalé comme en retard.")}</Text>}
    </Stack> : <Text fontSize="sm" color="app.muted">{t("Il faut être au moins deux pour déposer : formez votre binôme ou tentez le binôme surprise.")}</Text>}
  </Stack></Panel>
}
