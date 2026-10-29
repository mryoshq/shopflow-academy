import type { ReactNode } from "react"
import { CloseButton, Drawer, Portal } from "@chakra-ui/react"

/**
 * Right-hand panel for details (a student, a mission, a help request) without leaving the view
 * (ADR-0031). Focus is trapped while open and returns to the opener; Esc closes.
 */
export function SidePanel({ open, title, onClose, children, footer }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode
}) {
  return <Drawer.Root open={open} onOpenChange={(event) => { if (!event.open) onClose() }} placement="end" size={{ base: "full", md: "md" }}>
    <Portal>
      <Drawer.Backdrop />
      <Drawer.Positioner>
        <Drawer.Content bg="app.surface" color="app.ink" aria-label={title}>
          <Drawer.Header borderBottomWidth="1px" borderColor="app.border" pr="14">
            <Drawer.Title fontSize="lg">{title}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body py="5">{children}</Drawer.Body>
          {footer && <Drawer.Footer borderTopWidth="1px" borderColor="app.border">{footer}</Drawer.Footer>}
          <Drawer.CloseTrigger asChild position="absolute" top="3" right="3">
            <CloseButton size="md" aria-label="Fermer le panneau" />
          </Drawer.CloseTrigger>
        </Drawer.Content>
      </Drawer.Positioner>
    </Portal>
  </Drawer.Root>
}
