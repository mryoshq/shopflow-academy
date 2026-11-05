import { useEffect, useState } from "react"
import { Button, Field, Flex, Heading, Input, Stack, Switch, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { t } from "../i18n"
import { Panel } from "../student/ui"

type Settings = { sounds: boolean; silent: boolean; recap_at: string | null }

export function RafiClassSettings({ assignmentId }: { assignmentId: number }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [time, setTime] = useState("")
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")
  const path = `/teacher/classes/${assignmentId}/rafi`
  useEffect(() => {
    let active = true
    void api<Settings>(path).then((value) => {
      if (active) { setSettings(value); setTime(value.recap_at ?? "") }
    }).catch(() => { if (active) setSettings(null) })
    return () => { active = false }
  }, [path])

  async function save(change: Partial<Settings>) {
    setNotice("")
    setSaving(true)
    try {
      const updated = await api<Settings>(path, "PUT", change)
      setSettings(updated)
      setNotice(change.sounds === undefined ? t("Réglages de Rafi enregistrés.")
        : change.sounds ? t("Sons de Rafi rétablis pour la classe.") : t("Sons de Rafi coupés pour toute la classe."))
    } catch (reason) { setNotice(reason instanceof ApiError ? reason.message : t("Action impossible. Réessayez.")) }
    finally { setSaving(false) }
  }

  if (!settings) return null
  return <Panel><Stack gap="3">
    <Heading as="h3" size="sm">{t("Rafi, l’assistant des étudiants")}</Heading>
    <Text fontSize="sm" color="app.muted">{t("Rafi présente les annonces (rappels des jalons, blocs à terminer, vos messages) dans le coin de l’écran des étudiants. Ses sons sont courts et rares.")}</Text>
    <Switch.Root checked={settings.sounds} disabled={saving} onCheckedChange={(event) => void save({ sounds: event.checked })} colorPalette="brand" size="sm">
      <Switch.HiddenInput /><Switch.Control><Switch.Thumb /></Switch.Control>
      <Switch.Label fontSize="sm">{t("Sons de Rafi pour toute la classe")}</Switch.Label>
    </Switch.Root>
    <Switch.Root checked={settings.silent ?? false} disabled={saving} onCheckedChange={(event) => void save({ silent: event.checked })} colorPalette="brand" size="sm">
      <Switch.HiddenInput /><Switch.Control><Switch.Thumb /></Switch.Control>
      <Switch.Label fontSize="sm">{t("Mode silencieux pour la classe")}</Switch.Label>
    </Switch.Root>
    <Text fontSize="sm" color="app.muted">{t("Les annonces restent dans le centre de notifications. Les étudiants peuvent demander une étape à Rafi.")}</Text>
    <Flex as="form" align="end" wrap="wrap" gap="3" onSubmit={(event) => { event.preventDefault(); void save({ recap_at: time || null }) }}>
      <Field.Root maxW="xs">
        <Field.Label>{t("Heure du récapitulatif (heure du Maroc)")}</Field.Label>
        <Input type="time" value={time} disabled={saving} onChange={(event) => setTime(event.currentTarget.value)} />
        <Field.HelperText>{t("Laissez l’heure vide pour désactiver le récapitulatif.")}</Field.HelperText>
      </Field.Root>
      <Button type="submit" size="sm" variant="outline" colorPalette="brand" disabled={saving || time === (settings.recap_at ?? "")}>{t("Enregistrer l’heure")}</Button>
    </Flex>
    {notice && <Text fontSize="sm" color="brand.fg" role="status">{notice}</Text>}
  </Stack></Panel>
}
