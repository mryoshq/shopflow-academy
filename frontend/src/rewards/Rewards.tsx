import { useEffect, useRef, useState } from "react"
import { Badge, Box, Button, Flex, Input, NativeSelect, Stack, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Icon, Panel, ScoreBar } from "../student/ui"
import { chime, confetti } from "./celebrate"
import { formatDate, t, tn } from "../i18n"
import { rewardText } from "../i18n/server"
import type { AttemptRewards, BadgeItem, ClassGoal, Level, Rewards } from "./types"

/** ADR-0039: experience, level, streak and badges, apart from the score. Kind wording only. */

export function levelProgress(level: Level): { current: number; span: number } {
  if (level.max_level || level.next_at === null) return { current: 1, span: 1 }
  return { current: level.xp - level.floor, span: level.next_at - level.floor }
}

export function ProgressPanel({ rewards, title }: { rewards: Rewards; title?: string }) {
  const [open, setOpen] = useState(false)
  const { level } = rewards
  const { current, span } = levelProgress(level)
  const earned = rewards.badges.filter((item) => item.earned)
  return <Panel as="section" aria-labelledby="rewards-title">
    <Stack gap="4">
      <Stack gap="1">
        <Text fontWeight="semibold" id="rewards-title">{title ?? t("Votre progression")}</Text>
        <Text fontSize="xs" color="app.muted">{t("Pour le plaisir : ne compte jamais dans la note.")}</Text>
      </Stack>
      <Stack gap="1.5">
        <Flex justify="space-between" align="baseline" gap="2" wrap="wrap">
          <Text fontSize="lg" fontWeight="bold">{rewardText(level.name)}</Text>
          <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>{t("Niveau {{number}}", { number: level.number })}</Text>
        </Flex>
        <ScoreBar value={current} max={span} label={level.max_level ? t("{{xp}} points d’expérience, niveau maximal", { xp: level.xp }) : t("{{xp}} points d’expérience, {{left}} avant {{name}}", { xp: level.xp, left: level.next_at! - level.xp, name: rewardText(level.next_name ?? "") })} />
        <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>
          {level.max_level ? t("{{xp}} XP : niveau maximal atteint.", { xp: level.xp }) : t("{{xp}} XP · encore {{left}} XP pour « {{name}} »", { xp: level.xp, left: level.next_at! - level.xp, name: rewardText(level.next_name ?? "") })}
        </Text>
      </Stack>
      <Flex gap="2" align="center" fontSize="sm">
        <Box color="saffron.fg"><Icon name="star" size={16} /></Box>
        <Text>{rewards.streak > 0
          ? <><Text as="span" fontWeight="semibold">{t("Série : {{n}}", { n: rewards.streak })}</Text> {tn("mission réussie du premier coup", rewards.streak)}</>
          : t("Réussissez une mission du premier coup pour lancer une série.")}</Text>
      </Flex>
      <Stack gap="2">
        <Flex justify="space-between" align="center" gap="2" wrap="wrap">
          <Text fontSize="sm" fontWeight="semibold">{t("Badges : {{earned}} sur {{total}}", { earned: earned.length, total: rewards.badges.length })}</Text>
          <Button size="xs" variant="outline" colorPalette="brand" aria-expanded={open} aria-controls="badge-collection" onClick={() => setOpen((value) => !value)}>
            {open ? t("Masquer") : t("Voir ma collection")}</Button>
        </Flex>
        {earned.length > 0 && !open && <Flex gap="1.5" wrap="wrap">{earned.slice(0, 3).map((item) => <EarnedChip key={item.key} item={item} />)}
          {earned.length > 3 && <Text fontSize="xs" color="app.muted" alignSelf="center">{tn("et {{count}} autre", earned.length - 3)}</Text>}</Flex>}
        {open && <BadgeCollection id="badge-collection" badges={rewards.badges} />}
      </Stack>
    </Stack>
  </Panel>
}

function EarnedChip({ item }: { item: BadgeItem }) {
  return <Badge colorPalette="saffron" variant="subtle" rounded="full" gap="1" whiteSpace="normal" textAlign="start" lineHeight="1.3" py="0.5">
    <Icon name="star" size={12} />{rewardText(item.label)}</Badge>
}

export function BadgeCollection({ badges, id }: { badges: BadgeItem[]; id?: string }) {
  return <Stack as="ul" id={id} listStyleType="none" p="0" m="0" gap="2" aria-label={t("Collection de badges")}>
    {badges.map((item) => <Flex as="li" key={item.key} gap="2.5" align="start" p="2.5" rounded="md" borderWidth="1px"
      borderColor={item.earned ? "saffron.solid" : "app.border"} bg={item.earned ? "saffron.subtle" : "app.sunken"}>
      <Box mt="0.5" color={item.earned ? "saffron.fg" : "app.muted"}><Icon name={item.earned ? "star" : "lock"} size={16} /></Box>
      <Stack gap="0" minW="0">
        <Text fontSize="sm" fontWeight={item.earned ? "semibold" : "medium"} color={item.earned ? "app.ink" : "app.muted"}>{rewardText(item.label)}</Text>
        <Text fontSize="xs" color="app.muted">{item.earned ? (item.earned_at ? t("Obtenu le {{date}}", { date: formatDate(item.earned_at, { dateStyle: "short" }) }) : t("Obtenu")) : t("À découvrir : {{hint}}", { hint: rewardText(item.hint ?? "") })}</Text>
      </Stack>
    </Flex>)}
  </Stack>
}

export function ClassGoalPanel({ goal, heading }: { goal: ClassGoal; heading?: string }) {
  return <Panel as="section" aria-labelledby="class-goal-title">
    <Stack gap="2.5">
      <Flex gap="2" align="center"><Box color="brand.fg"><Icon name="target" size={16} /></Box><Text fontWeight="semibold" id="class-goal-title">{heading ?? t("Objectif de classe")}</Text></Flex>
      <GoalBar goal={goal} />
      <Text fontSize="xs" color="app.muted">{t("Toute la classe avance ensemble : aucun nom n’est affiché.")}</Text>
    </Stack>
  </Panel>
}

function GoalBar({ goal }: { goal: ClassGoal }) {
  return <Stack gap="1.5">
    <ScoreBar value={goal.value} max={goal.target} label={`${rewardText(goal.text)}, ${goal.percent} %`} />
    <Flex justify="space-between" gap="2" fontSize="sm" css={{ fontVariantNumeric: "tabular-nums" }}>
      <Text>{rewardText(goal.text)}</Text><Text color="app.muted" whiteSpace="nowrap" flexShrink={0}>{goal.percent} %</Text>
    </Flex>
  </Stack>
}

/** Under « Bonne décision »: streak, XP, new badges, new level. A finished block gets confetti and the optional chime. */
export function AttemptRewardsNote({ rewards, correct }: { rewards?: AttemptRewards; correct: boolean }) {
  const celebrated = useRef(false)
  useEffect(() => {
    if (!rewards || celebrated.current) return
    celebrated.current = true
    if (rewards.block_finished) { confetti(); chime() }
    else if (correct && (rewards.streak_mark || rewards.new_badges.length || rewards.level_up)) chime()
  }, [rewards, correct])
  if (!rewards || !correct) return null
  return <Stack gap="2" data-testid="attempt-rewards">
    <Flex gap="2" wrap="wrap" align="center">
      {rewards.streak > 0 && <Badge colorPalette="saffron" variant={rewards.streak_mark ? "solid" : "subtle"} rounded="full" gap="1"
        className={rewards.streak_mark ? "streak-mark" : undefined}
        css={rewards.streak_mark ? { "@keyframes streakPop": { "0%": { transform: "scale(0.85)" }, "60%": { transform: "scale(1.08)" }, "100%": { transform: "scale(1)" } },
          animation: "streakPop 420ms cubic-bezier(0.2, 0, 0, 1)" } : undefined}>
        <Icon name="star" size={12} />{t("Série : {{n}}", { n: rewards.streak })}</Badge>}
      {rewards.xp_gained > 0 && <Badge colorPalette="brand" variant="subtle" rounded="full" css={{ fontVariantNumeric: "tabular-nums" }}>+{rewards.xp_gained} XP</Badge>}
    </Flex>
    {rewards.streak_mark && <Text fontSize="sm" fontWeight="medium">{t("{{n}} missions de suite du premier coup : belle série !", { n: rewards.streak_mark })}</Text>}
    {rewards.block_finished && <Text fontSize="sm" fontWeight="medium">{t("Bloc terminé : bravo !")}</Text>}
    {rewards.level_up && <Text fontSize="sm">{t("Nouveau niveau :")}{" "}<Text as="span" fontWeight="semibold">{rewardText(rewards.level_up)}</Text></Text>}
    {rewards.new_badges.map((item) => <Text key={item.key} fontSize="sm">{t("Nouveau badge :")}{" "}<Text as="span" fontWeight="semibold">{rewardText(item.label)}</Text></Text>)}
  </Stack>
}

// Teacher -----------------------------------------------------------------------------------------

/** « Ma classe »: the class goal bar (anonymous). */
export function TeacherGoalBar({ assignmentId }: { assignmentId: number }) {
  const [goal, setGoal] = useState<ClassGoal | null>(null)
  useEffect(() => {
    let alive = true
    void api<ClassGoal>(`/teacher/classes/${assignmentId}/goal`).then((value) => { if (alive) setGoal(value) }).catch(() => { /* optional */ })
    return () => { alive = false }
  }, [assignmentId])
  if (!goal) return null
  return <Flex gap="4" align="center" wrap="wrap" p="3" mb="4" rounded="lg" borderWidth="1px" borderColor="app.border" bg="app.surface" aria-label={t("Objectif de classe")} role="group">
    <Flex gap="2" align="center" flexShrink={0}><Box color="brand.fg"><Icon name="target" size={16} /></Box><Text fontWeight="semibold" fontSize="sm">{t("Objectif de classe")}</Text></Flex>
    <Box flex="1" minW="48"><GoalBar goal={goal} /></Box>
    <Button asChild size="xs" variant="ghost" colorPalette="brand"><a href="#/reglages/objectif">{t("Modifier")}</a></Button>
  </Flex>
}

/** Réglages > Objectif de classe. */
export function GoalSettings({ assignmentId }: { assignmentId: number }) {
  const [goal, setGoal] = useState<ClassGoal | null>(null)
  const [metric, setMetric] = useState<"missions" | "blocks">("missions")
  const [target, setTarget] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void api<ClassGoal>(`/teacher/classes/${assignmentId}/goal`).then((value) => {
      setGoal(value); setMetric(value.metric); setTarget(value.custom ? String(value.target) : "")
    }).catch(() => setStatus(t("Impossible de charger l’objectif de classe.")))
  }, [assignmentId])
  async function save() {
    setBusy(true); setStatus(null)
    const value = target.trim() ? Number(target) : null
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 10000)) { setStatus(t("La cible est un nombre entier de 1 à 10 000.")); setBusy(false); return }
    try {
      const saved = await api<ClassGoal>(`/teacher/classes/${assignmentId}/goal`, "PUT", { metric, target: value })
      setGoal(saved); setTarget(saved.custom && value !== null ? String(saved.target) : ""); setStatus(t("Objectif enregistré."))
    } catch (error) {
      setStatus(error instanceof ApiError && error.status === 422 ? t("Valeur refusée : vérifiez la cible.") : t("Enregistrement impossible. Réessayez."))
    } finally { setBusy(false) }
  }
  return <Panel as="section" aria-labelledby="goal-settings-title">
    <Stack gap="4" maxW="36rem">
      <Stack gap="1">
        <Text fontWeight="semibold" id="goal-settings-title">{t("Objectif de classe")}</Text>
        <Text fontSize="sm" color="app.muted">{t("Une barre commune sur le tableau de bord des étudiants et dans « Ma classe ». Aucun nom n’est affiché ; la classe reçoit une notification à 25, 50, 75 et 100 %. Sans effet sur les notes.")}</Text>
      </Stack>
      {goal && <GoalBar goal={goal} />}
      <Flex gap="3" wrap="wrap" align="end">
        <Stack gap="1" flex="1" minW="44">
          <Text asChild fontSize="sm" fontWeight="medium"><label htmlFor="goal-metric">{t("Ce qui compte")}</label></Text>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field id="goal-metric" value={metric} onChange={(event) => setMetric(event.target.value as "missions" | "blocks")}>
              <option value="missions">{t("Missions réussies (toute la classe)")}</option>
              <option value="blocks">{t("Blocs terminés (toute la classe)")}</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Stack>
        <Stack gap="1" w="44">
          <Text asChild fontSize="sm" fontWeight="medium"><label htmlFor="goal-target">{t("Cible")}</label></Text>
          <Input id="goal-target" size="sm" type="number" min={1} max={10000} inputMode="numeric" value={target}
            placeholder={goal && goal.metric === metric ? t("Par défaut : {{value}}", { value: goal.default_target }) : t("Par défaut")} onChange={(event) => setTarget(event.target.value)} />
        </Stack>
        <Button size="sm" colorPalette="brand" loading={busy} onClick={() => void save()}>{t("Enregistrer")}</Button>
      </Flex>
      <Text fontSize="xs" color="app.muted">{t("Laissez la cible vide pour la valeur par défaut : tout le monde, tout le cours.")}</Text>
      {status && <Text role="status" fontSize="sm">{status}</Text>}
    </Stack>
  </Panel>
}

/** The student's panel for the teacher: level, streaks and badges, apart from the grade. */
export function StudentRewardsSummary({ rewards }: { rewards: Rewards }) {
  const earned = rewards.badges.filter((item) => item.earned)
  return <Box p="3" rounded="lg" bg="app.sunken" aria-label={t("Progression (hors note)")} role="group">
    <Flex gap="3" wrap="wrap" fontSize="sm" mb={earned.length ? "2" : "0"} css={{ fontVariantNumeric: "tabular-nums" }}>
      <Text><Text as="span" fontWeight="semibold">{rewardText(rewards.level.name)}</Text> · {rewards.level.xp} XP</Text>
      <Text color="app.muted">{t("Série : {{n}} (meilleure : {{best}})", { n: rewards.streak, best: rewards.best_streak })}</Text>
      <Text color="app.muted">{t("Badges : {{earned}} sur {{total}}", { earned: earned.length, total: rewards.badges.length })}</Text>
    </Flex>
    {earned.length > 0 && <Flex gap="1.5" wrap="wrap">{earned.map((item) => <EarnedChip key={item.key} item={item} />)}</Flex>}
  </Box>
}
