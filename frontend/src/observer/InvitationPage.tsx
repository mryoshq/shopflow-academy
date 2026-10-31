import { formatDateTime, t } from "../i18n"
import { useEffect, useState, type FormEvent } from "react"
import { Box, Button, Field, Flex, Heading, Input, Stack, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Logo } from "../Logo"
import { BrandName } from "../BrandName"

type Invitation = { full_name: string; email: string; kind: "admin" | "guest"; kind_label: string; expires_at: string; password_min: number }

/** #/invitation/<token> (ADR-0042): an invited observer chooses a password; the link then stops working. */
export function invitationToken(hash: string): string | null {
  const match = /^#\/invitation\/([A-Za-z0-9_-]{20,100})$/.exec(hash)
  return match ? match[1] : null
}

export function InvitationPage({ token, onDone }: { token: string; onDone: (username: string) => void }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api<Invitation>(`/invitations/${token}`).then(setInvitation)
      .catch((reason) => setProblem(reason instanceof ApiError ? reason.message : t("Lien indisponible. Réessayez dans un instant.")))
  }, [token])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage("")
    if (password !== confirm) { setMessage(t("Les deux mots de passe ne sont pas identiques.")); return }
    setBusy(true)
    try {
      const result = await api<{ username: string }>(`/invitations/${token}/accept`, "POST", { password })
      onDone(result.username)
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : t("Activation impossible. Réessayez."))
    } finally { setBusy(false) }
  }

  return <Box as="section" aria-labelledby="invitation-title" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="card" boxShadow="card"
    p={{ base: "6", md: "8" }} w="full" maxW="lg" mx="auto">
    <Stack gap="5">
      <Flex align="center" gap="3"><Logo size={48} /><BrandName size="lg" /></Flex>
      <Heading as="h1" size="xl" id="invitation-title">{t("Activer votre accès observateur")}</Heading>
      {problem ? <Text role="alert">{problem}</Text> : !invitation ? <Text role="status" color="app.muted">{t("Vérification du lien…")}</Text> : <form onSubmit={submit}><Stack gap="4">
        <Text>{t("Bonjour {{name}}. Vous êtes invité à consulter des classes en lecture seule, avec un compte « {{kind}} ».", { name: invitation.full_name, kind: t(invitation.kind_label) })}</Text>
        <Text fontSize="sm" color="app.muted">{t("Votre identifiant de connexion : {{email}}. Lien valable jusqu’au {{date}}, une seule fois.", { email: invitation.email, date: formatDateTime(invitation.expires_at) })}</Text>
        <Field.Root required><Field.Label>{t("Mot de passe")}</Field.Label>
          <Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <Field.HelperText>{t("Au moins {{n}} caractères, sans reprendre votre adresse e-mail.", { n: invitation.password_min })}</Field.HelperText></Field.Root>
        <Field.Root required><Field.Label>{t("Confirmer le mot de passe")}</Field.Label>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></Field.Root>
        {message && <Text role="alert" color="red.fg" fontSize="sm">{message}</Text>}
        <Button type="submit" colorPalette="brand" size="lg" loading={busy} disabled={!password || !confirm}>{t("Activer mon compte")}</Button>
        <Text fontSize="xs" color="app.muted">{t("Vos consultations seront enregistrées et visibles par l’enseignant.")}</Text>
      </Stack></form>}
    </Stack>
  </Box>
}
