import { t, tn } from "../i18n"
import { Badge, Box } from "@chakra-ui/react"

/** Sent when the teacher handles a help request, so the badge does not wait for the next refresh. */
export const HELP_CHANGED = "academy:help-changed"

export function helpLabel(count: number): string {
  return tn("{{count}} demande d’aide en attente", count)
}

/** The hidden text the badge stands for, referenced with aria-describedby. */
export function HelpText({ count, id }: { count: number; id: string }) {
  if (count <= 0) return null
  return <Box as="span" id={id} srOnly>{helpLabel(count)}</Box>
}

/**
 * Pending help requests, same style as the notification badge. The number is decorative (aria-hidden); the
 * element it decorates points to the hidden text with aria-describedby, so its name (« Ma classe »,
 * « Demandes d’aide ») stays the same and screen readers hear « 3 demandes d’aide en attente ». Nothing at zero.
 */
export function HelpBadge({ count, id, dot = false }: { count: number; id?: string; dot?: boolean }) {
  if (count <= 0) return null
  return <>
    {id && <HelpText count={count} id={id} />}
    {dot
      ? <Box as="span" aria-hidden="true" position="absolute" top="1" insetEnd="1" minW="4" h="4" px="1" rounded="full" bg="saffron.solid" color="saffron.contrast"
          display="inline-flex" alignItems="center" justifyContent="center" fontSize="2xs" fontWeight="bold" lineHeight="1"
          css={{ fontVariantNumeric: "tabular-nums" }}>{count > 9 ? "9+" : count}</Box>
      : <Badge aria-hidden="true" colorPalette="saffron" variant="solid" rounded="full" minW="5" justifyContent="center" css={{ fontVariantNumeric: "tabular-nums" }}>
          {count > 99 ? "99+" : count}</Badge>}
  </>
}
