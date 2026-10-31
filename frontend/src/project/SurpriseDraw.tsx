import { useCallback, useEffect, useRef, useState } from "react"
import { Badge, Box, Button, Checkbox, Flex, Heading, Stack, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { t, tn } from "../i18n"
import { motionAllowed } from "../rewards/celebrate"
import { Panel } from "../student/ui"
import { when } from "./ProjectText"
import type { DrawOverview, DrawPreview } from "./types"

/** ADR-0041: the surprise draw. Teacher: preview, then confirm, a server-side draw. Student: a reveal shown once. */

const joinNames = (names: string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} ${t("et")} ${names[names.length - 1]}`

// Teacher -----------------------------------------------------------------------------------------

export function TeacherDraw({ assignmentId, onDrawn }: { assignmentId: number; onDrawn: () => Promise<void> | void }) {
  const base = `/teacher/classes/${assignmentId}/project/draw`
  const [overview, setOverview] = useState<DrawOverview | null>(null)
  const [included, setIncluded] = useState<number[]>([])
  const [preview, setPreview] = useState<DrawPreview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [history, setHistory] = useState(false)
  const load = useCallback(async () => {
    try { setOverview(await api<DrawOverview>(base)) } catch { setStatus(t("Chargement du tirage impossible. Réessayez.")) }
  }, [base])
  useEffect(() => { void load() }, [load])

  async function showPreview(teams = included) {
    setBusy(true); setStatus(""); setConfirming(false)
    try { setPreview(await api<DrawPreview>(`${base}/preview`, "POST", { include_team_ids: teams })) }
    catch (reason) { setStatus(reason instanceof ApiError ? reason.message : t("Aperçu impossible. Réessayez.")) }
    finally { setBusy(false) }
  }
  async function confirm() {
    if (!preview) return
    if (preview.previous && !confirming) { setConfirming(true); return }
    setBusy(true); setStatus("")
    try {
      await api(base, "POST", { seed: preview.seed, fingerprint: preview.fingerprint, include_team_ids: included, confirm_again: Boolean(preview.previous) })
      setPreview(null); setConfirming(false)
      setStatus(t("Tirage enregistré : les étudiants tirés au sort sont prévenus."))
      await Promise.all([load(), onDrawn()])
    } catch (reason) {
      setStatus(reason instanceof ApiError ? reason.message : t("Tirage impossible. Réessayez."))
    } finally { setBusy(false) }
  }
  function toggle(teamId: number, on: boolean) {
    const next = on ? [...included, teamId] : included.filter((id) => id !== teamId)
    setIncluded(next)
    if (preview) void showPreview(next)
  }

  if (!overview) return status ? <Text role="status" fontSize="sm">{status}</Text> : null
  const registered = overview.free.filter((item) => item.registered).length
  return <Panel as="section" aria-labelledby="draw-title"><Stack gap="4">
    <Stack gap="1">
      <Heading as="h3" size="md" id="draw-title">{t("Binôme surprise")}</Heading>
      <Text fontSize="sm" color="app.muted">{t("Le tirage apparie au hasard les étudiants encore sans équipe, inscrits ou non. Un nombre impair forme un trinôme. Les équipes déjà formées et les dépôts ne bougent pas.")}</Text>
    </Stack>
    <Box>
      <Text fontWeight="semibold" fontSize="sm">{tn("{{count}} étudiant sans équipe", overview.free.length)} · {tn("{{count}} inscrit au tirage", registered)}</Text>
      {overview.free.length > 0 && <Flex gap="1.5" wrap="wrap" mt="1.5">{overview.free.map((item) => <Badge key={item.id} variant={item.registered ? "solid" : "subtle"}
        colorPalette={item.registered ? "brand" : "gray"} rounded="full">{item.name}{item.registered ? ` · ${t("inscrit")}` : ""}</Badge>)}</Flex>}
    </Box>
    {overview.solo_teams.length > 0 && <Stack gap="2">
      <Text fontWeight="semibold" fontSize="sm">{t("Équipes d’une seule personne : les proposer au tirage ?")}</Text>
      {overview.solo_teams.map((team) => <Checkbox.Root key={team.team_id} checked={included.includes(team.team_id)} colorPalette="brand"
        onCheckedChange={(event) => toggle(team.team_id, Boolean(event.checked))}>
        <Checkbox.HiddenInput /><Checkbox.Control />
        <Checkbox.Label fontSize="sm">{team.name}{team.has_work ? ` (${t("a déjà du travail : garde son équipe")})` : ""}</Checkbox.Label>
      </Checkbox.Root>)}
    </Stack>}
    {!preview && <Button alignSelf="start" colorPalette="brand" loading={busy} disabled={overview.free.length + included.length < 2}
      onClick={() => void showPreview()}>{t("Lancer le tirage")}</Button>}
    {!preview && overview.free.length + included.length < 2 && <Text fontSize="sm" color="app.muted">{overview.free.length === 1
      ? t("Un seul étudiant sans équipe : ajoutez-le à la main à un binôme, ou proposez une équipe d’une seule personne au tirage.")
      : t("Personne à apparier : il faut au moins deux personnes.")}</Text>}
    {preview && <Stack gap="3" p="3" rounded="lg" bg="app.sunken" aria-live="polite">
      <Text fontWeight="semibold">{t("Aperçu : rien n’est enregistré avant validation.")}</Text>
      {preview.groups.length === 0 ? <Text fontSize="sm">{t("Personne à apparier : il faut au moins deux personnes.")}</Text>
        : <Stack as="ol" listStyleType="none" p="0" m="0" gap="1.5">{preview.groups.map((group, index) => <Flex as="li" key={index} gap="2" align="center" wrap="wrap"
          p="2.5" rounded="md" bg="app.surface" borderWidth="1px" borderColor="app.border">
          <Text fontWeight="medium" flex="1" minW="0">{group.members.join(" + ")}</Text>
          {group.members.length === 3 && <Badge colorPalette="saffron" variant="subtle">{t("Trinôme")}</Badge>}
          {group.existing_team && <Badge variant="subtle">{t("Équipe existante")}</Badge>}
        </Flex>)}</Stack>}
      {preview.left_out.length > 0 && <Text fontSize="sm" color="app.muted">{t("À apparier à la main (équipes qui ont déjà du travail) :")}{" "}{preview.left_out.join(", ")}</Text>}
      {confirming && preview.previous && <Text fontSize="sm" color="saffron.fg" fontWeight="medium">
        {t("Un tirage a déjà eu lieu le {{date}}. Les équipes formées ne bougeront pas. Confirmez-vous ce nouveau tirage ?", { date: when(preview.previous.created_at) })}</Text>}
      <Flex gap="2" wrap="wrap">
        <Button colorPalette="brand" loading={busy} disabled={preview.groups.length === 0} onClick={() => void confirm()}>
          {confirming ? t("Confirmer le nouveau tirage") : t("Valider ce tirage")}</Button>
        <Button variant="outline" colorPalette="brand" disabled={busy} onClick={() => void showPreview()}>{t("Autre tirage")}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { setPreview(null); setConfirming(false) }}>{t("Annuler")}</Button>
      </Flex>
    </Stack>}
    {status && <Text role="status" fontSize="sm" color="brand.fg">{status}</Text>}
    {overview.draws.length > 0 && <Stack gap="1.5">
      <Text fontWeight="semibold" fontSize="sm">{t("Tirages enregistrés")}</Text>
      {(history ? overview.draws : overview.draws.slice(0, 3)).map((draw) => <Box key={draw.id} fontSize="sm">
        <Text color="app.muted">{t("Le {{date}} par {{name}}", { date: when(draw.created_at), name: draw.by })}</Text>
        <Text>{draw.groups.map((group) => group.join(" + ")).join(" · ")}</Text>
      </Box>)}
      {overview.draws.length > 3 && <Button alignSelf="start" size="xs" variant="ghost" colorPalette="brand" aria-expanded={history} onClick={() => setHistory(!history)}>
        {history ? t("Masquer les anciens tirages") : tn("Afficher {{count}} tirage plus ancien", overview.draws.length - 3)}</Button>}
    </Stack>}
  </Stack></Panel>
}

/** A card turned from « ? » to the name: Web Animations API (no generated CSS), 800 ms, staggered by 200 ms. */
function FlipCard({ name, index, animate }: { name: string; index: number; animate: boolean }) {
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = card.current
    if (!animate || !node || typeof node.animate !== "function") return
    const flip = node.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }],
      { duration: 800, delay: 200 + index * 200, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "backwards" })
    return () => flip.cancel()
  }, [animate, index])
  return <Box w="40" h="24" style={{ perspective: "800px" }}>
    <Box ref={card} position="relative" w="full" h="full" className={animate ? "surprise-card" : undefined}
      style={{ transformStyle: "preserve-3d", transform: "rotateY(180deg)" }}>
      <Flex position="absolute" inset="0" align="center" justify="center" rounded="lg" bg="brand.solid" color="brand.contrast" fontSize="3xl" fontWeight="bold"
        style={{ backfaceVisibility: "hidden" }}>?</Flex>
      <Flex position="absolute" inset="0" align="center" justify="center" rounded="lg" bg="saffron.subtle" borderWidth="2px" borderColor="saffron.solid"
        px="2" fontWeight="semibold" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", overflowWrap: "anywhere" }}>{name}</Flex>
    </Box>
  </Box>
}

// Student -----------------------------------------------------------------------------------------

/** Shown once after the draw: cards turn over (about 1.2 s), cut by « Réduire les animations ». */
export function SurpriseReveal({ partners, cohortId }: { partners: string[]; cohortId: number }) {
  const [animate] = useState(motionAllowed)
  const [closed, setClosed] = useState(false)
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    void api("/student/project/surprise/seen", "POST", { cohort_id: cohortId }).catch(() => { /* shown again next time */ })
  }, [cohortId])
  if (closed) return null
  const message = t("Votre binôme surprise : {{names}}", { names: joinNames(partners) })
  return <Panel as="section" aria-labelledby="surprise-title" data-testid="surprise-reveal"><Stack gap="4" align="center" textAlign="center">
    <Text fontSize="sm" color="app.muted">{t("Le tirage a eu lieu !")}</Text>
    <Flex gap="3" justify="center" wrap="wrap" aria-hidden="true">{partners.map((name, index) => <FlipCard key={name + index} name={name} index={index} animate={animate} />)}</Flex>
    <Box role="status"><Heading as="h2" size="md" id="surprise-title">{message}</Heading></Box>
    <Button size="sm" variant="outline" colorPalette="brand" onClick={() => setClosed(true)}>{t("Fermer")}</Button>
  </Stack></Panel>
}
