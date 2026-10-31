import { t } from "../i18n"
import type { ReactNode } from "react"
import { CloseButton, Drawer, Portal } from "@chakra-ui/react"

/** Right-hand panel for a submission's details (ADR-0034), without leaving the page. */
export function DetailPanel({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <Drawer.Root open={open} onOpenChange={(event) => { if (!event.open) onClose() }} placement="end" size={{ base: "full", md: "lg" }}>
    <Portal><Drawer.Backdrop /><Drawer.Positioner><Drawer.Content bg="app.surface" color="app.ink" aria-label={title}>
      <Drawer.Header borderBottomWidth="1px" borderColor="app.border" pr="14"><Drawer.Title fontSize="lg">{title}</Drawer.Title></Drawer.Header>
      <Drawer.Body py="5">{children}</Drawer.Body>
      <Drawer.CloseTrigger asChild position="absolute" top="3" right="3"><CloseButton size="md" aria-label={t("Fermer le panneau")} /></Drawer.CloseTrigger>
    </Drawer.Content></Drawer.Positioner></Portal>
  </Drawer.Root>
}
