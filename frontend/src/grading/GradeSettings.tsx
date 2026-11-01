import { useEffect, useState } from "react"
import { Button, Checkbox, Field, Flex, Heading, Input, SimpleGrid, Stack, Switch, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { formatNumber, t } from "../i18n"
import { ErrorState, LoadingState, Panel } from "../student/ui"
import type { GradingConfig } from "./FinalGrade"

type Settings = { config: GradingConfig; defaults: GradingConfig; modules: { title: string; workshop: boolean; open: boolean }[] }
const text = (value: number) => String(value).replace(".", ",")
const parse = (value: string) => Number(value.replace(",", "."))

/** ADR-0046, Réglages > Notes: weights, cap, bonus maxima, workshop modules and visibility of the final grade. */
export function GradeSettings({ assignmentId }: { assignmentId: number }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [workshops, setWorkshops] = useState<string[]>([])
  const [visible, setVisible] = useState(false)
  const [notice, setNotice] = useState("")

  function fill(next: Settings) {
    const c = next.config
    setSettings(next)
    setDraft({ course: text(c.weights.course), workshops: text(c.weights.workshops), project: text(c.weights.project), cap: text(c.cap),
      project_bonus_max: text(c.project_bonus_max), course_bonus_max: text(c.course_bonus_max) })
    setWorkshops(next.modules.filter((m) => m.workshop).map((m) => m.title))
    setVisible(c.visible_to_students)
  }
  useEffect(() => {
    void api<Settings>(`/teacher/classes/${assignmentId}/grading`).then(fill)
      .catch((reason) => { if (!(reason instanceof ApiError && reason.status === 401)) setError(t("Chargement impossible. Réessayez.")) })
  }, [assignmentId])

  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />
  if (!settings) return <LoadingState label={t("Chargement des réglages…")} />
  const sum = parse(draft.course) + parse(draft.workshops) + parse(draft.project)
  const numbers = Object.values(draft).map(parse)
  const wrong = numbers.some((v) => !Number.isFinite(v) || v < 0) || Math.abs(sum - 100) > 1e-6 || parse(draft.cap) <= 0 || parse(draft.cap) > 20
    || parse(draft.project_bonus_max) > 5 || parse(draft.course_bonus_max) > 5

  async function save(reset = false) {
    setNotice("")
    const d = settings!.defaults
    const body = reset ? { ...d, workshop_modules: null, visible_to_students: visible } : {
      weights: { course: parse(draft.course), workshops: parse(draft.workshops), project: parse(draft.project) }, cap: parse(draft.cap),
      project_bonus_max: parse(draft.project_bonus_max), course_bonus_max: parse(draft.course_bonus_max), workshop_modules: workshops, visible_to_students: visible,
    }
    try { fill(await api<Settings>(`/teacher/classes/${assignmentId}/grading`, "PUT", body)); setNotice(t("Réglages des notes enregistrés.")) }
    catch (reason) { setNotice(reason instanceof ApiError ? reason.message : t("Action impossible. Réessayez.")) }
  }

  const number = (key: string, label: string, hint?: string) => <Field.Root key={key} invalid={!Number.isFinite(parse(draft[key] ?? "")) || parse(draft[key] ?? "") < 0}>
    <Field.Label fontSize="sm">{label}</Field.Label>
    <Input inputMode="decimal" size="sm" maxW="28" value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
    {hint && <Field.HelperText>{hint}</Field.HelperText>}
  </Field.Root>

  return <Panel><Stack gap="5" maxW="3xl">
    <Stack gap="1"><Heading as="h3" size="md">{t("Note finale sur 20")}</Heading>
      <Text fontSize="sm" color="app.muted">{t("Un calcul au-dessus des points obtenus : aucune note déjà enregistrée ne change. Chaque partie est ramenée sur 20.")}</Text></Stack>
    <Stack as="fieldset" gap="3"><Text as="legend" fontWeight="semibold" fontSize="sm" mb="2">{t("Pondération du socle (total 100 %)")}</Text>
      <SimpleGrid columns={{ base: 1, sm: 3 }} gap="3">
        {number("course", t("Cours, en %"), t("Points principaux des axes"))}
        {number("workshops", t("Ateliers, en %"), t("Tous les points des ateliers"))}
        {number("project", t("CampusEquip, en %"), t("Socle du projet sur 20"))}
      </SimpleGrid>
      <Text fontSize="sm" color={Math.abs(sum - 100) > 1e-6 ? "red.fg" : "app.muted"} role="status">{t("Total : {{sum}} %", { sum: Number.isFinite(sum) ? formatNumber(sum) : "—" })}</Text>
    </Stack>
    <SimpleGrid columns={{ base: 1, sm: 3 }} gap="3">
      {number("cap", t("Plafond (sur 20)"))}
      {number("project_bonus_max", t("Bonus du projet, au plus"), t("Proportionnel aux bonus du projet sur 10"))}
      {number("course_bonus_max", t("Bonus du cours, au plus"), t("Proportionnel aux bonus hors ateliers"))}
    </SimpleGrid>
    <Stack as="fieldset" gap="2"><Text as="legend" fontWeight="semibold" fontSize="sm" mb="1">{t("Modules qui comptent comme ateliers")}</Text>
      <Text fontSize="xs" color="app.muted">{t("Par défaut, ceux dont le titre commence par « Ateliers ». Leurs points comptent pour la partie Ateliers, même marqués bonus.")}</Text>
      {settings.modules.map((module) => <Checkbox.Root key={module.title} size="sm" colorPalette="brand" checked={workshops.includes(module.title)}
        onCheckedChange={(event) => setWorkshops(event.checked ? [...workshops, module.title] : workshops.filter((title) => title !== module.title))}>
        <Checkbox.HiddenInput /><Checkbox.Control /><Checkbox.Label fontSize="sm">{module.title}{module.open ? "" : ` (${t("pas encore ouvert")})`}</Checkbox.Label>
      </Checkbox.Root>)}
    </Stack>
    <Switch.Root checked={visible} onCheckedChange={(event) => setVisible(event.checked)} colorPalette="brand" size="sm">
      <Switch.HiddenInput /><Switch.Control><Switch.Thumb /></Switch.Control>
      <Switch.Label fontSize="sm">{t("Afficher la note finale aux étudiants")}</Switch.Label>
    </Switch.Root>
    <Flex gap="3" wrap="wrap" align="center">
      <Button colorPalette="brand" disabled={wrong} onClick={() => void save()}>{t("Enregistrer")}</Button>
      <Button variant="outline" onClick={() => void save(true)}>{t("Valeurs par défaut")}</Button>
      {wrong && <Text fontSize="sm" color="red.fg">{t("Vérifiez les valeurs : poids à 100 %, plafond entre 0 et 20, bonus de 0 à 5.")}</Text>}
      {notice && <Text fontSize="sm" color="brand.fg" role="status">{notice}</Text>}
    </Flex>
  </Stack></Panel>
}
