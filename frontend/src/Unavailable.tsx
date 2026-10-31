import { t, msg } from "./i18n"
import { useEffect, useState } from "react"
import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react"
import { Logo } from "./Logo"
import { BrandName } from "./BrandName"
import { OUTAGE_EVENT, RECOVERED_EVENT, RETRY_EVENT, inOutage, nextAttemptAt, retryNow } from "./resilience"

export const UNAVAILABLE_TEXT = msg("La plateforme est momentanément indisponible. Votre session et votre travail sont conservés. Nouvelle tentative automatique…")

/** Seconds until the next automatic attempt, counted down every second (null before the first one). */
function useCountdown(): number | null {
  const read = () => { const at = nextAttemptAt(); return at === null ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000)) }
  const [left, setLeft] = useState<number | null>(read)
  useEffect(() => {
    const update = () => setLeft(read())
    window.addEventListener(RETRY_EVENT, update)
    window.addEventListener(RECOVERED_EVENT, update)
    const tick = window.setInterval(update, 1000)
    return () => { window.removeEventListener(RETRY_EVENT, update); window.removeEventListener(RECOVERED_EVENT, update); window.clearInterval(tick) }
  }, [])
  return left
}

function Retry({ size = "md" }: { size?: "sm" | "md" }) {
  const left = useCountdown()
  const [busy, setBusy] = useState(false)
  return <Flex align="center" gap="3" wrap="wrap">
    <Button size={size} variant="outline" colorPalette="brand" loading={busy} loadingText={t("Nouvelle tentative…")}
      onClick={async () => { setBusy(true); try { await retryNow() } finally { setBusy(false) } }}>{t("Réessayer maintenant")}</Button>
    {left !== null && <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>
      {t("Prochaine tentative dans")}{" "}{left} s</Text>}
  </Flex>
}

/**
 * ADR-0038: shown instead of the application when the platform cannot be reached at all. The attempts
 * are automatic (resilience.ts); the application then reopens the requested address by itself.
 */
export function UnavailablePage() {
  return <Flex minH="100dvh" align="center" justify="center" bg="app.canvas" color="app.ink" px="4" py="10">
    <Box as="main" w="full" maxW="lg" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="card" boxShadow="card" p={{ base: "6", md: "8" }}>
      <Stack gap="5">
        <Flex align="center" gap="3"><Logo size={48} /><BrandName /></Flex>
        <Stack gap="2" role="status" aria-live="polite">
          <Heading as="h1" size="xl">{t("Momentanément indisponible")}</Heading>
          <Text color="app.muted">{t(UNAVAILABLE_TEXT)}</Text>
        </Stack>
        <Retry />
      </Stack>
    </Box>
  </Flex>
}

/** ADR-0038: the page stays usable (and every answer being typed stays in place) during a short outage. */
export function OutageBanner() {
  const [down, setDown] = useState(inOutage)
  useEffect(() => {
    const on = () => setDown(true)
    const off = () => setDown(false)
    window.addEventListener(OUTAGE_EVENT, on)
    window.addEventListener(RECOVERED_EVENT, off)
    return () => { window.removeEventListener(OUTAGE_EVENT, on); window.removeEventListener(RECOVERED_EVENT, off) }
  }, [])
  if (!down) return null
  // At the bottom: the header (account, notifications) stays visible and usable.
  return <Box role="status" aria-live="polite" position="fixed" bottom="4" left="50%" transform="translateX(-50%)" zIndex="toast" w="calc(100% - 1.5rem)" maxW="xl"
    bg="app.surface" borderWidth="1px" borderColor="saffron.solid" borderLeftWidth="4px" rounded="lg" boxShadow="lg" px="4" py="3">
    <Stack gap="2">
      <Text fontSize="sm" fontWeight="medium">{t(UNAVAILABLE_TEXT)}</Text>
      <Retry size="sm" />
    </Stack>
  </Box>
}
