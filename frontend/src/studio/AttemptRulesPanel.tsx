import { locale, t } from "../i18n"
import { useEffect, useState } from "react"
import { Box, Button, Flex, Heading, Input, Stack, Text, Textarea } from "@chakra-ui/react"
import { api, ApiError } from "../api"

export type RulesSettings = {
  decay_enabled: boolean; decay_steps: number[]; decay_floor: number
  pause_enabled: boolean; pause_seconds: number[]
  reading_enabled: boolean; reading_wpm: number; reading_min: number; reading_max: number
  fast_enabled: boolean; announcement_enabled: boolean; announcement: string
  decay_since: string | null; pause_since: string | null; announced_since: string | null
}

const SERVER_DATES = ["decay_since", "pause_since", "announced_since", "defaults"] as const

export function parseList(text: string): number[] | null {
  const values = text.split(/[,;\s]+/).filter(Boolean).map(Number)
  return values.length && values.every((value) => Number.isInteger(value)) ? values : null
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" }) : ""
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint: string }) {
  return <Flex as="label" gap="3" align="start" cursor="pointer">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--chakra-colors-brand-solid)" }} />
    <Box><Text fontWeight="semibold">{label}</Text><Text fontSize="sm" color="app.muted">{hint}</Text></Box>
  </Flex>
}

/** « Mon cours » → Règles (ADR-0027): measures against random clicking, each off until the teacher turns it on. */
export function AttemptRulesPanel({ courseId, disabled }: { courseId: number; disabled: boolean }) {
  const [rules, setRules] = useState<RulesSettings | null>(null)
  const [steps, setSteps] = useState("")
  const [pauses, setPauses] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  function adopt(data: RulesSettings) {
    setRules(data)
    setSteps(data.decay_steps.join(", "))
    setPauses(data.pause_seconds.join(", "))
  }
  useEffect(() => {
    setRules(null)
    api<RulesSettings>(`/teacher/courses/${courseId}/attempt-rules`).then(adopt).catch(() => setError(t("Impossible de charger les règles.")))
  }, [courseId])

  async function save() {
    if (!rules) return
    const decay = parseList(steps)
    const pause = parseList(pauses)
    if (!decay || !pause) { setError(t("Écrivez des nombres entiers séparés par des virgules.")); return }
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const body = Object.fromEntries(Object.entries({ ...rules, decay_steps: decay, pause_seconds: pause })
        .filter(([key]) => !(SERVER_DATES as readonly string[]).includes(key)))
      adopt(await api<RulesSettings>(`/teacher/courses/${courseId}/attempt-rules`, "PUT", body))
      setNotice(t("Règles enregistrées. Elles s’appliquent aux prochains essais, jamais aux essais déjà faits."))
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 422
        ? t("Réglage refusé : pourcentages décroissants entre 0 et 100, plancher au plus égal au dernier pourcentage, pauses de 0 à 30 s, lecture minimale inférieure à la maximale, annonce en texte simple.")
        : t("Enregistrement impossible. Réessayez."))
    } finally {
      setBusy(false)
    }
  }

  if (!rules) return <Text role="status" color="app.muted">{error || t("Chargement des règles…")}</Text>
  const set = (patch: Partial<RulesSettings>) => setRules({ ...rules, ...patch })
  return <Stack gap="5" as="form" onSubmit={(event: React.FormEvent) => { event.preventDefault(); void save() }}>
    <Box><Heading as="h4" size="md">{t("Règles contre le clic au hasard")}</Heading>
      <Text fontSize="sm" color="app.muted" mt="1">{t("Chaque mesure est désactivée tant que vous ne l’activez pas. Activez-les au moment choisi, de préférence hors d’un bloc en cours. Chaque modification est enregistrée dans le journal.")}</Text></Box>

    <Stack gap="3" p="4" rounded="lg" borderWidth="1px" borderColor="app.border">
      <Toggle checked={rules.decay_enabled} onChange={(value) => set({ decay_enabled: value })} label={t("Points dégressifs (missions principales)")}
        hint={t("Chaque essai rapporte au plus le pourcentage de son rang ; le meilleur essai est retenu. Les missions bonus ne sont pas concernées.")} />
      <Flex gap="3" wrap="wrap" pl="8">
        <Box><label htmlFor="decay-steps" style={{ fontSize: "0.875rem", display: "block" }}>{t("Pourcentages par essai")}</label><Input id="decay-steps" size="sm" maxW="44" value={steps} onChange={(event) => setSteps(event.target.value)} /></Box>
        <Box><label htmlFor="decay-floor" style={{ fontSize: "0.875rem", display: "block" }}>{t("Ensuite (plancher, %)")}</label><Input id="decay-floor" size="sm" maxW="24" type="number" min={0} max={100} value={rules.decay_floor} onChange={(event) => set({ decay_floor: Number(event.target.value) })} /></Box>
      </Flex>
      {rules.decay_since && rules.decay_enabled && <Text pl="8" fontSize="sm" color="brand.fg">{t("Active depuis le")}{" "}{when(rules.decay_since)} {t(": les essais antérieurs gardent leurs points.")}</Text>}
    </Stack>

    <Stack gap="3" p="4" rounded="lg" borderWidth="1px" borderColor="app.border">
      <Toggle checked={rules.pause_enabled} onChange={(value) => set({ pause_enabled: value })} label={t("Pause après une erreur")}
        hint={t("Le serveur refuse un nouvel essai pendant la pause ; l’étudiant voit un compte à rebours et le bouton d’indice. Aucune pause après une bonne réponse.")} />
      <Box pl="8"><label htmlFor="pause-seconds" style={{ fontSize: "0.875rem", display: "block" }}>{t("Pauses successives (secondes, 30 au plus)")}</label><Input id="pause-seconds" size="sm" maxW="44" value={pauses} onChange={(event) => setPauses(event.target.value)} /></Box>
    </Stack>

    <Stack gap="3" p="4" rounded="lg" borderWidth="1px" borderColor="app.border">
      <Toggle checked={rules.reading_enabled} onChange={(value) => set({ reading_enabled: value })} label={t("Lecture minimale des leçons")}
        hint={t("« J’ai compris » s’active après le temps de lecture calculé (nombre de mots ÷ vitesse), aussi vérifié par le serveur.")} />
      <Flex gap="3" wrap="wrap" pl="8">
        <Box><label htmlFor="reading-wpm" style={{ fontSize: "0.875rem", display: "block" }}>{t("Mots par minute")}</label><Input id="reading-wpm" size="sm" maxW="24" type="number" min={60} max={600} value={rules.reading_wpm} onChange={(event) => set({ reading_wpm: Number(event.target.value) })} /></Box>
        <Box><label htmlFor="reading-min" style={{ fontSize: "0.875rem", display: "block" }}>{t("Minimum (s)")}</label><Input id="reading-min" size="sm" maxW="24" type="number" min={0} max={120} value={rules.reading_min} onChange={(event) => set({ reading_min: Number(event.target.value) })} /></Box>
        <Box><label htmlFor="reading-max" style={{ fontSize: "0.875rem", display: "block" }}>{t("Maximum (s)")}</label><Input id="reading-max" size="sm" maxW="24" type="number" min={0} max={120} value={rules.reading_max} onChange={(event) => set({ reading_max: Number(event.target.value) })} /></Box>
      </Flex>
    </Stack>

    <Stack gap="3" p="4" rounded="lg" borderWidth="1px" borderColor="app.border">
      <Toggle checked={rules.fast_enabled} onChange={(value) => set({ fast_enabled: value })} label={t("Repérer les clics rapides")}
        hint={t("Essai moins de 5 s après l’ouverture, ou 3 essais en moins de 30 s : badge « clics rapides » dans « Ma classe ». Aucune sanction automatique.")} />
    </Stack>

    <Stack gap="3" p="4" rounded="lg" borderWidth="1px" borderColor="app.border">
      <Toggle checked={rules.announcement_enabled} onChange={(value) => set({ announcement_enabled: value })} label={t("Annoncer les règles aux étudiants")}
        hint={t("Bandeau sur le tableau de bord étudiant quand une règle est activée ou que le texte change.")} />
      <Box pl="8"><label htmlFor="announcement" style={{ fontSize: "0.875rem", display: "block" }}>{t("Texte de l’annonce (280 caractères au plus)")}</label>
        <Textarea id="announcement" size="sm" maxLength={280} rows={2} value={rules.announcement} onChange={(event) => set({ announcement: event.target.value })} /></Box>
      {rules.announced_since && <Text pl="8" fontSize="sm" color="app.muted">{t("Dernière annonce :")}{" "}{when(rules.announced_since)}.</Text>}
    </Stack>

    {error && <Text role="alert" color="red.fg">{error}</Text>}
    {notice && <Text role="status" color="brand.fg">{notice}</Text>}
    <Button type="submit" alignSelf="start" colorPalette="brand" loading={busy} disabled={disabled}>{t("Enregistrer les règles")}</Button>
  </Stack>
}
