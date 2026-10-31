import { formatDateTime, msg, t } from "../i18n"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Badge, Box, Button, Field, Flex, Heading, Input, NativeSelect, Stack, Table, Text, chakra } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Panel } from "../student/ui"

export type ObserverKind = "admin" | "guest"
type ObserverAccount = { id: number; full_name: string; email: string | null; username: string; kind: ObserverKind; show_answers: boolean; enabled: boolean
  status: "active" | "pending" | "expired" | "disabled"; invitation_expires_at: string | null; created_at: string | null }
export type Invitation = { link: string; expires_at: string; delivery: "smtp" | "manual"; error: string | null; mail: { to: string; subject: string; body: string } }
type View = { id: number; observer: string; email: string; kind: ObserverKind; view: string; assignment_id: number | null; details: Record<string, unknown>; created_at: string | null }

export const KIND_LABEL: Record<ObserverKind, string> = { admin: msg("Administration"), guest: msg("Invité") }
const KIND_HELP: Record<ObserverKind, string> = {
  admin: msg("Noms réels, notes du cours et du projet, fiches, export CSV et rapport PDF."),
  guest: msg("Anonymisé : tableau de bord, graphiques d’ensemble et cours publié, sans note individuelle ni export."),
}
const STATUS_LABEL: Record<ObserverAccount["status"], string> = {
  active: msg("Actif"), pending: msg("Invitation en attente"), expired: msg("Invitation expirée"), disabled: msg("Désactivé"),
}
const STATUS_COLOR: Record<ObserverAccount["status"], string> = { active: "green", pending: "saffron", expired: "gray", disabled: "gray" }
const VIEW_LABEL: Record<string, string> = {
  classes: msg("Liste des classes"), dashboard: msg("Tableau de bord"), charts: msg("Graphiques"), course: msg("Cours publié"), grades: msg("Notes"),
  "grades.csv": msg("Export CSV des notes"), "report.pdf": msg("Rapport PDF"), student: msg("Fiche d’un étudiant"), project: msg("Projet"),
}

export function mailtoOf(mail: Invitation["mail"]): string {
  return `mailto:${encodeURIComponent(mail.to)}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`
}

/** The link of a new invitation: sent by e-mail, or to copy / to send from the teacher's own mail app. */
function InvitationBox({ name, invitation, onClose }: { name: string; invitation: Invitation; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(invitation.link); setCopied(true) } catch { setCopied(false) }
  }
  return <Box role="status" p="4" rounded="lg" bg="brand.subtle" borderWidth="1px" borderColor="brand.solid" data-testid="invitation-box">
    <Stack gap="2">
      <Text fontWeight="semibold">{invitation.delivery === "smtp" ? t("Invitation envoyée par e-mail à {{email}}.", { email: invitation.mail.to })
        : t("Invitation de {{name}} prête : envoyez-lui ce lien personnel.", { name })}</Text>
      {invitation.error && <Text fontSize="sm" color="red.fg">{invitation.error}</Text>}
      <Input readOnly value={invitation.link} aria-label={t("Lien d’invitation")} fontFamily="mono" fontSize="sm" onFocus={(event) => event.target.select()} />
      <Text fontSize="xs" color="app.muted">{t("Lien à usage unique, valable jusqu’au {{date}}.", { date: formatDateTime(invitation.expires_at) })}</Text>
      <Flex gap="2" wrap="wrap">
        <Button size="sm" colorPalette="brand" onClick={() => void copy()}>{copied ? t("Lien copié") : t("Copier le lien")}</Button>
        <Button size="sm" variant="outline" colorPalette="brand" asChild><a href={mailtoOf(invitation.mail)}>{t("Préparer l’e-mail")}</a></Button>
        <Button size="sm" variant="ghost" onClick={onClose}>{t("Fermer")}</Button>
      </Flex>
    </Stack>
  </Box>
}

/** Réglages > Observateurs (ADR-0042): invite, change the type, resend or revoke, disable; the consultation log. */
export function ObserversPanel() {
  const [observers, setObservers] = useState<ObserverAccount[] | null>(null)
  const [views, setViews] = useState<View[]>([])
  const [mailReady, setMailReady] = useState(false)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [kind, setKind] = useState<ObserverKind>("guest")
  const [showAnswers, setShowAnswers] = useState(false)
  const [latest, setLatest] = useState<{ name: string; invitation: Invitation } | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [testTo, setTestTo] = useState("")
  const [testStatus, setTestStatus] = useState("")

  const load = useCallback(async () => {
    try {
      const [list, journal, mail] = await Promise.all([api<ObserverAccount[]>("/teacher/observers"), api<View[]>("/teacher/observers/views"),
        api<{ configured: boolean }>("/teacher/observers/mail")])
      setObservers(list); setViews(journal); setMailReady(mail.configured)
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) setMessage(t("Chargement impossible. Réessayez."))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setMessage("")
    try {
      const created = await api<{ observer: ObserverAccount; invitation: Invitation }>("/teacher/observers", "POST",
        { full_name: fullName.trim(), email: email.trim(), kind, show_answers: kind === "admin" && showAnswers })
      setLatest({ name: created.observer.full_name, invitation: created.invitation })
      setFullName(""); setEmail(""); setShowAnswers(false)
      await load()
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : t("Création impossible. Réessayez."))
    } finally { setBusy(false) }
  }
  async function act(observer: ObserverAccount, path: string, method: string, body?: unknown) {
    setMessage("")
    try {
      const result = await api<{ invitation?: Invitation }>(`/teacher/observers/${observer.id}${path}`, method, body)
      if (result && "invitation" in result && result.invitation) setLatest({ name: observer.full_name, invitation: result.invitation })
      await load()
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : t("Modification impossible. Réessayez."))
    }
  }
  async function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTestStatus("")
    try { await api("/teacher/observers/mail-test", "POST", { to: testTo.trim() }); setTestStatus(t("E-mail de test envoyé : vérifiez la boîte de réception.")) }
    catch (reason) { setTestStatus(reason instanceof ApiError ? reason.message : t("Envoi impossible. Réessayez.")) }
  }

  return <Stack gap="6">
    <Stack gap="1">
      <Heading as="h2" size="lg">{t("Observateurs")}</Heading>
      <Text color="app.muted">{t("Un observateur (direction, inspection, collègue) consulte vos classes en lecture seule, sans rien pouvoir modifier. Il reçoit un lien d’invitation personnel et choisit son mot de passe. Chaque consultation est listée ci-dessous.")}</Text>
    </Stack>
    <Panel as="section" aria-labelledby="observer-new-title">
      <form onSubmit={create}><Stack gap="4">
        <Heading as="h3" size="sm" id="observer-new-title">{t("Inviter un observateur")}</Heading>
        <Flex gap="3" wrap="wrap">
          <Field.Root required flex="1" minW="56"><Field.Label>{t("Nom")}</Field.Label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="off" placeholder={t("Prénom Nom")} /></Field.Root>
          <Field.Root required flex="1" minW="56"><Field.Label>{t("E-mail")}</Field.Label>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" placeholder="direction@example.org" /></Field.Root>
          <Field.Root flex="1" minW="48"><Field.Label>{t("Type de compte")}</Field.Label>
            <NativeSelect.Root><NativeSelect.Field value={kind} onChange={(event) => setKind(event.target.value as ObserverKind)}>
              <option value="guest">{t(KIND_LABEL.guest)}</option><option value="admin">{t(KIND_LABEL.admin)}</option>
            </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
        </Flex>
        <Text fontSize="sm" color="app.muted">{t(KIND_HELP[kind])}</Text>
        {kind === "admin" && <chakra.label display="flex" alignItems="center" gap="2" minH="11" fontSize="sm">
          <chakra.input type="checkbox" checked={showAnswers} onChange={(event) => setShowAnswers(event.target.checked)} w="5" h="5" />{t("Afficher les corrigés dans le cours publié")}</chakra.label>}
        <Text fontSize="xs" color="app.muted">{mailReady ? t("L’invitation part par e-mail ; le lien reste aussi affiché ici.") : t("L’envoi d’e-mails n’est pas configuré : vous copierez le lien ou préparerez l’e-mail dans votre messagerie.")}</Text>
        <Button type="submit" colorPalette="brand" alignSelf="start" loading={busy} disabled={!fullName.trim() || !email.trim()}>{t("Créer et inviter")}</Button>
      </Stack></form>
    </Panel>
    {latest && <InvitationBox name={latest.name} invitation={latest.invitation} onClose={() => setLatest(null)} />}
    {message && <Text role="alert" color="red.fg">{message}</Text>}
    {observers && (observers.length === 0 ? <Text color="app.muted">{t("Aucun observateur pour le moment.")}</Text>
      : <Stack gap="3" as="ul" listStyleType="none" aria-label={t("Observateurs")}>{observers.map((observer) => <Panel as="li" key={observer.id}>
        <Stack gap="3">
          <Flex gap="3" align="center" wrap="wrap" justify="space-between">
            <Box minW="0"><Text fontWeight="semibold">{observer.full_name || observer.username}</Text><Text fontSize="sm" color="app.muted" overflowWrap="anywhere">{observer.email ?? observer.username}</Text></Box>
            <Flex gap="2" wrap="wrap"><Badge colorPalette={observer.kind === "admin" ? "brand" : "gray"} variant="subtle">{t(KIND_LABEL[observer.kind])}</Badge>
              <Badge colorPalette={STATUS_COLOR[observer.status]} variant="subtle">{t(STATUS_LABEL[observer.status])}</Badge></Flex>
          </Flex>
          {observer.status === "pending" && observer.invitation_expires_at && <Text fontSize="xs" color="app.muted">{t("Lien valable jusqu’au {{date}}.", { date: formatDateTime(observer.invitation_expires_at) })}</Text>}
          <Flex gap="3" wrap="wrap" align="end">
            <Field.Root maxW="56"><Field.Label fontSize="sm">{t("Type")}</Field.Label>
              <NativeSelect.Root size="sm"><NativeSelect.Field value={observer.kind} aria-label={t("Type de {{name}}", { name: observer.full_name || observer.username })}
                onChange={(event) => void act(observer, "", "PATCH", { kind: event.target.value })}>
                <option value="guest">{t(KIND_LABEL.guest)}</option><option value="admin">{t(KIND_LABEL.admin)}</option>
              </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
            {observer.kind === "admin" && <chakra.label display="flex" alignItems="center" gap="2" minH="10" fontSize="sm">
              <chakra.input type="checkbox" checked={observer.show_answers} onChange={(event) => void act(observer, "", "PATCH", { show_answers: event.target.checked })} w="5" h="5" />{t("Corrigés visibles")}</chakra.label>}
          </Flex>
          <Flex gap="2" wrap="wrap">
            {observer.status !== "active" && observer.enabled && <Button size="sm" variant="outline" colorPalette="brand" onClick={() => void act(observer, "/invitation", "POST")}>{t("Renvoyer l’invitation")}</Button>}
            {observer.status === "pending" && <Button size="sm" variant="outline" onClick={() => void act(observer, "/invitation", "DELETE")}>{t("Révoquer l’invitation")}</Button>}
            <Button size="sm" variant="outline" colorPalette={observer.enabled ? "red" : "brand"} onClick={() => void act(observer, "", "PATCH", { enabled: !observer.enabled })}
              aria-label={`${observer.enabled ? t("Désactiver") : t("Réactiver")} ${observer.full_name || observer.username}`}>{observer.enabled ? t("Désactiver") : t("Réactiver")}</Button>
          </Flex>
        </Stack>
      </Panel>)}</Stack>)}
    <Panel as="section" aria-labelledby="mail-test-title">
      <form onSubmit={sendTest}><Stack gap="3">
        <Heading as="h3" size="sm" id="mail-test-title">{t("E-mail des invitations")}</Heading>
        <Text fontSize="sm" color="app.muted">{mailReady ? t("Envoi configuré sur le serveur. Vérifiez-le avec un e-mail de test.") : t("Envoi non configuré (variables SMTP du serveur, voir le runbook).")}</Text>
        <Flex gap="2" wrap="wrap" align="end">
          <Field.Root maxW="sm"><Field.Label>{t("Adresse de test")}</Field.Label>
            <Input type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="moi@example.org" /></Field.Root>
          <Button type="submit" variant="outline" colorPalette="brand" disabled={!testTo.trim()}>{t("Envoyer un e-mail de test")}</Button>
        </Flex>
        {testStatus && <Text role="status" fontSize="sm">{testStatus}</Text>}
      </Stack></form>
    </Panel>
    <Stack gap="2" as="section" aria-labelledby="views-title">
      <Heading as="h3" size="md" id="views-title">{t("Journal des consultations")}</Heading>
      {views.length === 0 ? <Text color="app.muted">{t("Aucune consultation enregistrée.")}</Text>
        : <Box overflowX="auto" tabIndex={0} role="region" aria-label={t("Tableau des consultations")} borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
          <Table.Root size="sm"><Table.Header><Table.Row bg="app.sunken">{[t("Date"), t("Observateur"), t("Type"), t("Consultation"), t("Classe")].map((label) =>
            <Table.ColumnHeader key={label} scope="col">{label}</Table.ColumnHeader>)}</Table.Row></Table.Header>
            <Table.Body>{views.map((view) => <Table.Row key={view.id}>
              <Table.Cell whiteSpace="nowrap">{view.created_at ? formatDateTime(view.created_at) : "—"}</Table.Cell>
              <Table.Cell>{view.observer}</Table.Cell>
              <Table.Cell>{t(KIND_LABEL[view.kind])}</Table.Cell>
              <Table.Cell>{t(VIEW_LABEL[view.view] ?? view.view)}{view.details.answers ? t(" (avec corrigés)") : ""}</Table.Cell>
              <Table.Cell>{view.assignment_id ?? "—"}</Table.Cell>
            </Table.Row>)}</Table.Body></Table.Root>
        </Box>}
    </Stack>
  </Stack>
}
