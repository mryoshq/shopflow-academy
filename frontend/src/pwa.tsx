import { useEffect, useState } from "react"
import { Box, Button, CloseButton, Flex, Text } from "@chakra-ui/react"

/** ADR-0024: installable app, static-only service worker (public/sw.js), update notice and install prompt. */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
const DISMISS_KEY = "shopflow:install-dismissed"

/** Registers the worker (production build only) and calls ``onUpdate`` when a new version is waiting. */
export async function registerServiceWorker(onUpdate: (worker: ServiceWorker) => void, enabled = (import.meta as { env?: { PROD?: boolean } }).env?.PROD === true): Promise<void> {
  if (!enabled || !("serviceWorker" in navigator)) return
  try {
    const registration = await navigator.serviceWorker.register("/sw.js")
    const waiting = () => { if (registration.waiting && navigator.serviceWorker.controller) onUpdate(registration.waiting) }
    waiting()
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing
      worker?.addEventListener("statechange", () => { if (worker.state === "installed") waiting() })
    })
  } catch { /* the app works without the worker */ }
}

function remembered(): boolean {
  try { return window.localStorage.getItem(DISMISS_KEY) === "1" } catch { return false }
}

/** Bottom banner: « Nouvelle version disponible » (reload on demand) and « Installer l’application ». */
export function PwaBanner({ register = registerServiceWorker }: { register?: typeof registerServiceWorker }) {
  const [update, setUpdate] = useState<ServiceWorker | null>(null)
  const [install, setInstall] = useState<InstallEvent | null>(null)
  const [dismissed, setDismissed] = useState(remembered)

  useEffect(() => {
    void register(setUpdate)
    const onInstall = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent) }
    const onInstalled = () => setInstall(null)
    window.addEventListener("beforeinstallprompt", onInstall)
    window.addEventListener("appinstalled", onInstalled)
    return () => { window.removeEventListener("beforeinstallprompt", onInstall); window.removeEventListener("appinstalled", onInstalled) }
  }, [register])

  function reload() {
    if (!update) return
    navigator.serviceWorker?.addEventListener("controllerchange", () => window.location.reload(), { once: true })
    update.postMessage("academy:update")
  }
  async function installApp() {
    if (!install) return
    await install.prompt()
    await install.userChoice.catch(() => undefined)
    setInstall(null)
  }
  function hideInstall() {
    try { window.localStorage.setItem(DISMISS_KEY, "1") } catch { /* not remembered */ }
    setDismissed(true)
  }

  const showInstall = Boolean(install) && !dismissed
  if (!update && !showInstall) return null
  return <Box position="fixed" bottom={{ base: "3", md: "6" }} left={{ base: "3", md: "6" }} right={{ base: "3", md: "auto" }} zIndex="banner" maxW={{ md: "sm" }}
    role="region" aria-label="Application">
    {update && <Flex role="status" gap="3" align="center" wrap="wrap" p="3" mb="2" bg="app.surface" borderWidth="1px" borderColor="brand.solid" rounded="lg" boxShadow="lg">
      <Text flex="1" minW="40" fontSize="sm" fontWeight="medium">Nouvelle version disponible.</Text>
      <Button size="sm" colorPalette="brand" onClick={reload}>Recharger</Button>
    </Flex>}
    {showInstall && <Flex gap="2" align="center" wrap="wrap" p="3" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="lg" boxShadow="lg">
      <Text flex="1" minW="40" fontSize="sm">Installer ShopFlow Academy sur cet appareil ?</Text>
      <Button size="sm" variant="outline" colorPalette="brand" onClick={() => void installApp()}>Installer l’application</Button>
      <CloseButton size="sm" aria-label="Ne plus proposer l’installation" onClick={hideInstall} />
    </Flex>}
  </Box>
}
